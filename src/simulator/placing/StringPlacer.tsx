import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useEffect, useRef, useState } from "react";
import { useSimulator } from "../SimulatorContext";
import { LedString } from "../rendering/LedString";
import AnchorPoints from "./AnchorPoints";
import { HoverLine } from "./HoverLine";
import { HoverPoint } from "./HoverPointRef";
import {
  calculateRemainingDistance,
  computeClampedHoverPoint,
} from "./helpers";
import { useEscapeKey } from "../../common/utils/useEscapeKey";
import type { StringNodeModel } from "../../../shared/models/StringNodeModel";
import { StringUIModel } from "../models/StringUIModel";

export default function StringPlacer({ string }: { string: StringUIModel }) {
  const { gl, camera } = useThree();
  const appModel = useSimulator().app;

  const [pathPoints, setPathPoints] = useState<Array<THREE.Vector3>>([]);

  // Use refs for hover point tracking to avoid re-renders
  const hoverPointRef = useRef<THREE.Vector3 | null>(null);

  // Store pathPoints in a ref to avoid recreating handlers
  const pathPointsRef = useRef(pathPoints);
  useEffect(() => {
    pathPointsRef.current = pathPoints;
  }, [pathPoints]);

  // Cache garden objects to avoid traversing scene on every raycast
  const gardenObjectsRef = useRef<Array<THREE.Object3D> | null>(null);
  useEffect(() => {
    if (!appModel.gardenModel) {
      gardenObjectsRef.current = null;
      return;
    }

    // Collect all mesh objects from the garden model once
    const gardenObjects: Array<THREE.Object3D> = [];
    appModel.gardenModel.traverse((obj) => {
      if (obj.userData && (obj.userData.__measure || obj.userData.__string))
        return;
      if ("isMesh" in obj && (obj as { isMesh: boolean }).isMesh)
        gardenObjects.push(obj);
    });
    gardenObjectsRef.current = gardenObjects;
  }, [appModel.gardenModel]);

  // Set up pointer move handler to update hover point through refs
  useEffect(() => {
    const dom = gl.domElement;
    const mouseDownPosition = new THREE.Vector2();
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();

    // Throttle pointer move using requestAnimationFrame
    let rafId: number | null = null;
    let pendingEvent: PointerEvent | null = null;

    const processPointerMove = () => {
      if (!pendingEvent || !appModel.gardenModel || !gardenObjectsRef.current) {
        rafId = null;
        return;
      }

      const e = pendingEvent;
      pendingEvent = null;

      // Raycast from camera through pointer position
      const rect = dom.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      pointerNdc.set(x, y);
      raycaster.setFromCamera(pointerNdc, camera);

      // Raycast against cached garden objects
      const intersections = raycaster.intersectObjects(
        gardenObjectsRef.current,
        true,
      );
      const intersection = intersections.length > 0 ? intersections[0] : null;
      if (!intersection) {
        hoverPointRef.current = null;
        rafId = null;
        return;
      }

      // Offset the intersection point along the surface normal
      const offsetDistance = 0.05; // 5cm above the surface
      const offsetPoint = intersection.point.clone();

      if (intersection.face && intersection.object) {
        // Get the normal in world space
        const normal = new THREE.Vector3();
        normal.copy(intersection.face.normal);
        if (intersection.object instanceof THREE.Mesh) {
          // Transform normal to world space
          const worldMatrix = new THREE.Matrix3();
          worldMatrix.getNormalMatrix(intersection.object.matrixWorld);
          normal.applyMatrix3(worldMatrix).normalize();
        }
        // Offset along the normal
        offsetPoint.add(normal.multiplyScalar(offsetDistance));
      }

      const currentPathPoints = pathPointsRef.current;
      hoverPointRef.current = computeClampedHoverPoint(
        currentPathPoints[currentPathPoints.length - 1] || null,
        offsetPoint,
        currentPathPoints,
        string.string.ledCount,
        string.string.spacingMeters,
      );

      rafId = null;
    };

    const handlePointerMove = (e: PointerEvent) => {
      pendingEvent = e;
      if (rafId === null) rafId = requestAnimationFrame(processPointerMove);
    };

    // Store mouse down position
    const handlePointerDown = (e: PointerEvent) =>
      mouseDownPosition.set(e.clientX, e.clientY);

    const handlePointerUp = (e: PointerEvent) => {
      const hoverPoint = hoverPointRef.current;
      if (!hoverPoint) return;

      // Check if mouse moved less than 5 pixels
      const distance = Math.sqrt(
        Math.pow(e.clientX - mouseDownPosition.x, 2) +
          Math.pow(e.clientY - mouseDownPosition.y, 2),
      );

      if (distance > 5) return;

      // This is a click. Place the anchor
      const newPoint = hoverPoint.clone();
      setPathPoints([...pathPointsRef.current, newPoint]);
    };

    dom.addEventListener("pointermove", handlePointerMove);
    dom.addEventListener("pointerdown", handlePointerDown);
    dom.addEventListener("pointerup", handlePointerUp);

    return () => {
      dom.removeEventListener("pointermove", handlePointerMove);
      dom.removeEventListener("pointerdown", handlePointerDown);
      dom.removeEventListener("pointerup", handlePointerUp);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [gl.domElement, camera, appModel.gardenModel, string]);

  useEscapeKey(() => appModel.cancelPlacingString());

  useEffect(() => {
    if (
      calculateRemainingDistance(
        pathPoints,
        string.string.ledCount,
        string.string.spacingMeters,
        null,
      ) > 0.001
    )
      return;

    string.string.setPathPoints(
      pathPoints.map((p) => ({
        position: { x: p.x, y: p.y, z: p.z },
      })),
    );
    appModel.cancelPlacingString();
  }, [string, pathPoints, appModel]);

  return (
    <group>
      <HoverPoint
        hoverPointRef={hoverPointRef}
        string={string.string.doc}
        pathPoints={pathPoints}
      />

      {pathPoints.length >= 2 && (
        <LedString
          string={string}
          pathPointsOverride={pathPoints.map((p) => ({
            x: p.x,
            y: p.y,
            z: p.z,
          }))}
        />
      )}

      <HoverLine
        lastAnchorPoint={pathPoints[pathPoints.length - 1]}
        hoverPointRef={hoverPointRef}
      />

      <AnchorPoints points={pathPoints} />
    </group>
  );
}
