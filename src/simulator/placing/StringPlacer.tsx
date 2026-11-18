import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import { useApp } from "../../common/AppContext";
import type { PlacingTool } from "../../common/models/editorTool";
import { isKeyboardEventFromEditable } from "../../common/utils/keyboard";
import { resamplePath } from "../../../shared/geometry/stringLayout";
import AnchorPoints from "./AnchorPoints";
import { HoverLine } from "./HoverLine";
import { HoverPoint } from "./HoverPointRef";
import {
  calculateRemainingDistance,
  computeClampedHoverPoint,
} from "./helpers";
import {
  collectSurfaceMeshes,
  pointerToNdc,
  rayFromCamera,
  raycastSurface,
} from "./raycast";

/** A click that moved further than this is a camera drag, not a click. */
const CLICK_SLOP_PX = 5;

/**
 * Drawing a string's path on the house. Click to add a point; Enter
 * finishes, Backspace takes the last point back, Esc asks before throwing
 * the path away. It finishes by itself once the path uses the whole string.
 */
export default function StringPlacer({ tool }: { tool: PlacingTool }) {
  const { gl, camera } = useThree();
  const app = useApp();
  const string = app.project?.findString(tool.stringKey) ?? null;
  const hoverPointRef = useRef<THREE.Vector3 | null>(null);
  const meshes = useMemo(
    () => collectSurfaceMeshes(app.gardenModel),
    [app.gardenModel],
  );

  // Pointer: hover follows the surface, a click (not a drag) adds a point.
  useEffect(() => {
    if (!string) return;
    const dom = gl.domElement;
    const down = { x: 0, y: 0 };
    let frame: number | null = null;
    let pending: PointerEvent | null = null;

    const hover = () => {
      frame = null;
      if (!pending) return;
      const surface = raycastSurface(
        rayFromCamera(camera, pointerToNdc(pending, dom)),
        meshes,
      );
      pending = null;
      const points = app.placingTool?.points ?? [];
      hoverPointRef.current = surface
        ? toVector(
            computeClampedHoverPoint(
              points,
              surface,
              string.ledCount,
              string.spacingMeters,
            ),
          )
        : null;
    };

    const onMove = (e: PointerEvent) => {
      pending = e;
      if (frame === null) frame = requestAnimationFrame(hover);
    };
    const onDown = (e: PointerEvent) => {
      down.x = e.clientX;
      down.y = e.clientY;
    };
    const onUp = (e: PointerEvent) => {
      const hoverPoint = hoverPointRef.current;
      if (!hoverPoint) return;
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > CLICK_SLOP_PX)
        return;
      const point = { x: hoverPoint.x, y: hoverPoint.y, z: hoverPoint.z };
      app.sendTool({ kind: "ADD_POINT", point });
      const remaining = calculateRemainingDistance(
        app.placingTool?.points ?? [],
        string.ledCount,
        string.spacingMeters,
      );
      if (remaining <= 0.001) app.sendTool({ kind: "FINISH_PLACING" });
    };

    dom.addEventListener("pointermove", onMove);
    dom.addEventListener("pointerdown", onDown);
    dom.addEventListener("pointerup", onUp);
    return () => {
      dom.removeEventListener("pointermove", onMove);
      dom.removeEventListener("pointerdown", onDown);
      dom.removeEventListener("pointerup", onUp);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [gl.domElement, camera, meshes, string, app]);

  // Keys: Enter finishes, Backspace undoes, Esc asks before discarding.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isKeyboardEventFromEditable(e)) return;
      if (e.key === "Enter") app.sendTool({ kind: "FINISH_PLACING" });
      else if (e.key === "Backspace") app.sendTool({ kind: "UNDO_POINT" });
      else if (e.key === "Escape") app.sendTool({ kind: "CANCEL_PLACING" });
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [app]);

  const anchors = useMemo(() => tool.points.map(toVector), [tool.points]);
  const preview = useMemo(
    () =>
      string
        ? resamplePath(tool.points, string.ledCount, string.spacingMeters)
            .positions
        : [],
    [tool.points, string],
  );

  if (!string) return null;

  return (
    <group>
      <HoverPoint
        hoverPointRef={hoverPointRef}
        ledCount={string.ledCount}
        spacingMeters={string.spacingMeters}
        pathPoints={tool.points}
      />
      {preview.map((p, i) =>
        p ? (
          <mesh key={i} position={[p.x, p.y, p.z]}>
            <boxGeometry args={[0.03, 0.03, 0.03]} />
            <meshBasicMaterial color="#333333" />
          </mesh>
        ) : null,
      )}
      <HoverLine
        lastAnchorPoint={anchors[anchors.length - 1] ?? null}
        hoverPointRef={hoverPointRef}
      />
      <AnchorPoints points={anchors} />
    </group>
  );
}

const toVector = (p: { x: number; y: number; z: number }) =>
  new THREE.Vector3(p.x, p.y, p.z);
