import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { useEffect, useMemo } from "react";
import { useApp } from "../common/AppContext";
import type { MappingTool } from "../common/models/editorTool";
import {
  collectSurfaceMeshes,
  pointerToNdc,
  rayFromCamera,
  raycastSurface,
} from "../simulator/placing/raycast";
import {
  photoFovForView,
  photoRect,
  poseOfCamera,
  viewFovForPhoto,
} from "./photoCamera";
import { colorForSource } from "./confidence";
import { sourcesFromViews } from "./projectLeds";
import { useLatestSession, useView, useViews } from "./useMappingData";

const CLICK_SLOP_PX = 5;

type Controls = { enabled: boolean; target?: THREE.Vector3; update?(): void };

const perspective = (camera: THREE.Camera) =>
  camera instanceof THREE.PerspectiveCamera ? camera : null;

/** Keeps the view's camera on the photo's while it's locked, and lends it to the mapping tools. */
function PhotoCamera({
  aspect,
  viewName,
}: {
  aspect: number;
  viewName: string;
}) {
  const mapping = useApp().mapping;
  const get = useThree((s) => s.get);
  const locked = mapping.cameraLocked;

  useEffect(() => {
    const camera = perspective(get().camera);
    const originalFov = camera?.fov ?? null;
    mapping.setView({
      readPose: (photoAspect) => {
        const { camera, size } = get();
        const fov = perspective(camera)?.fov ?? 45;
        const rect = photoRect(size.width, size.height, photoAspect);
        return poseOfCamera(
          camera,
          photoFovForView(fov, size.height, rect),
          photoAspect,
        );
      },
    });
    return () => {
      mapping.setView(null);
      const current = perspective(get().camera);
      if (!current || originalFov === null) return;
      current.fov = originalFov;
      current.updateProjectionMatrix();
    };
  }, [get, mapping]);

  // The camera controls stay out of the way while the view is on the photo,
  // and orbit from where it was left afterwards.
  useEffect(() => {
    const controls = get().controls as Controls | null;
    if (!controls) return;
    controls.enabled = !locked;
    if (!locked && controls.target) {
      const camera = get().camera;
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(
        camera.quaternion,
      );
      controls.target.copy(camera.position).add(forward.multiplyScalar(10));
      controls.update?.();
    }
  }, [get, locked]);

  // Locked, the view sits where the photo's camera did. Free, it keeps the
  // photo's field of view as set by hand, so what lines up is what's kept.
  useFrame(({ camera: frameCamera, size }) => {
    const pose = mapping.alignmentOf(viewName)?.pose;
    const camera = perspective(frameCamera);
    if (!camera) return;
    const rect = photoRect(size.width, size.height, aspect);
    const isLocked = mapping.cameraLocked && pose;
    if (isLocked) {
      camera.position.set(pose.position.x, pose.position.y, pose.position.z);
      camera.quaternion.set(
        pose.quaternion.x,
        pose.quaternion.y,
        pose.quaternion.z,
        pose.quaternion.w,
      );
    }
    const photoFov = isLocked ? pose.fovDeg : mapping.handFovDeg;
    const fov = viewFovForPhoto(photoFov, size.height, rect);
    if (Math.abs(camera.fov - fov) > 1e-6) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  });

  return null;
}

/** While picking pairs, a click on the house picks the point under it. */
function HousePicker() {
  const app = useApp();
  const get = useThree((s) => s.get);
  const meshes = useMemo(
    () => collectSurfaceMeshes(app.gardenModel),
    [app.gardenModel],
  );

  useEffect(() => {
    const dom = get().gl.domElement;
    const down = { x: 0, y: 0 };
    const onDown = (e: PointerEvent) => {
      down.x = e.clientX;
      down.y = e.clientY;
    };
    const onUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > CLICK_SLOP_PX)
        return;
      const hit = raycastSurface(
        rayFromCamera(get().camera, pointerToNdc(e, dom)),
        meshes,
        0,
      );
      if (hit)
        app.sendTool({
          kind: "MESH_POINT",
          world: { x: hit.x, y: hit.y, z: hit.z },
        });
    };
    dom.addEventListener("pointerdown", onDown);
    dom.addEventListener("pointerup", onUp);
    const previousCursor = dom.style.cursor;
    dom.style.cursor = "crosshair";
    return () => {
      dom.removeEventListener("pointerdown", onDown);
      dom.removeEventListener("pointerup", onUp);
      dom.style.cursor = previousCursor;
    };
  }, [get, meshes, app]);

  return null;
}

/** The house points picked so far, numbered like their photo points. */
function PairMarkers({ tool }: { tool: MappingTool }) {
  return (
    <group userData={{ __measure: true }}>
      {tool.pairs.map((pair, i) => (
        <group key={i} position={[pair.world.x, pair.world.y, pair.world.z]}>
          <mesh renderOrder={20}>
            <sphereGeometry args={[0.06, 12, 12]} />
            <meshBasicMaterial color="#00e0ff" depthTest={false} />
          </mesh>
          <Html center style={{ pointerEvents: "none" }}>
            <div
              style={{
                transform: "translate(10px, -10px)",
                color: "#00e0ff",
                fontSize: 12,
                fontWeight: 700,
                textShadow: "0 0 3px #000",
              }}
            >
              {i + 1}
            </div>
          </Html>
        </group>
      ))}
    </group>
  );
}

/** The session's proposed LED positions, coloured by how sure the capture was. */
function ProposedLeds() {
  const app = useApp();
  const session = useLatestSession();
  const views = useViews(session?.id ?? null);
  const proposed =
    session?.state.kind === "review" ? session.state.proposed : null;

  const geometry = useMemo(() => {
    if (!proposed) return null;
    const positions: number[] = [];
    const colors: number[] = [];
    const color = new THREE.Color();
    for (const { nodeKey, ledPositions } of proposed) {
      if (!ledPositions) continue;
      const sources =
        app.mapping.sources.get(nodeKey) ??
        sourcesFromViews(views ?? [], nodeKey, ledPositions.length);
      ledPositions.forEach((p, i) => {
        positions.push(p.x, p.y, p.z);
        color.set(colorForSource(sources[i]));
        colors.push(color.r, color.g, color.b);
      });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return g;
  }, [proposed, views, app.mapping.sources]);

  if (!geometry) return null;
  return (
    <points geometry={geometry} renderOrder={30}>
      <pointsMaterial
        size={7}
        sizeAttenuation={false}
        vertexColors
        depthTest={false}
        transparent
      />
    </points>
  );
}

/** Camera mapping's part of the 3D view. */
export function MappingScene() {
  const app = useApp();
  const tool = app.tool.kind === "mapping" ? app.tool : null;
  const view = useView(tool?.sessionKey ?? null, tool?.viewName ?? null);
  const aspect = view ? view.imageWidth / view.imageHeight : null;

  return (
    <>
      <ProposedLeds />
      {tool && aspect ? (
        <PhotoCamera aspect={aspect} viewName={tool.viewName} />
      ) : null}
      {tool?.step.kind === "pickMesh" ? <HousePicker /> : null}
      {tool ? <PairMarkers tool={tool} /> : null}
    </>
  );
}
