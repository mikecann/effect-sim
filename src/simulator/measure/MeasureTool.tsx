import { useEffect, useMemo, useRef, useState } from "react";
import { Html, Line } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useSimulator } from "../SimulatorContext";

export default function MeasureTool() {
  const simulator = useSimulator();
  const enabled = simulator.isMeasureMode;
  const { gl, camera, scene } = useThree();
  const [firstPoint, setFirstPoint] = useState<THREE.Vector3 | null>(null);
  const [secondPoint, setSecondPoint] = useState<THREE.Vector3 | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const pointerNdc = useRef(new THREE.Vector2());

  useEffect(() => {
    if (!enabled) {
      setFirstPoint(null);
      setSecondPoint(null);
      return;
    }

    const dom = gl.domElement;
    const previousCursor = dom.style.cursor;
    // eslint-disable-next-line react-hooks/immutability
    dom.style.cursor = "crosshair";

    const handlePointerDown = (e: PointerEvent) => {
      const rect = dom.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      pointerNdc.current.set(x, y);

      const raycaster = raycasterRef.current;
      raycaster.setFromCamera(pointerNdc.current, camera);

      const allObjects: Array<THREE.Object3D> = [];
      scene.traverse((obj) => {
        if (obj.userData && obj.userData.__measure) return;
        if ("isMesh" in obj && (obj as { isMesh: boolean }).isMesh)
          allObjects.push(obj);
      });
      const intersections = raycaster.intersectObjects(allObjects, true);
      const hit = intersections.find((i) => {
        let obj: THREE.Object3D | null = i.object;
        while (obj) {
          if (obj.userData && obj.userData.__measure) return false;
          obj = obj.parent;
        }
        return true;
      });
      if (!hit) return;

      const point = hit.point.clone();
      if (firstPoint === null) {
        setFirstPoint(point);
        return;
      }
      if (secondPoint === null) {
        setSecondPoint(point);
        return;
      }
      setFirstPoint(point);
      setSecondPoint(null);
    };

    dom.addEventListener("pointerdown", handlePointerDown);
    return () => {
      dom.style.cursor = previousCursor;
      dom.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [enabled, gl.domElement, camera, scene, firstPoint, secondPoint]);

  const linePoints = useMemo(() => {
    if (!firstPoint || !secondPoint) return null;
    return [firstPoint, secondPoint] as const;
  }, [firstPoint, secondPoint]);

  const distanceText = useMemo(() => {
    if (!firstPoint || !secondPoint) return "";
    const distance = firstPoint.distanceTo(secondPoint);
    return `${distance.toFixed(2)} m`;
  }, [firstPoint, secondPoint]);

  const midPoint = useMemo(() => {
    if (!firstPoint || !secondPoint) return null;
    return firstPoint.clone().add(secondPoint).multiplyScalar(0.5);
  }, [firstPoint, secondPoint]);

  if (!enabled) return null;

  return (
    <group userData={{ __measure: true }}>
      {firstPoint ? (
        <Html
          position={firstPoint}
          center
          pointerEvents="none"
          zIndexRange={[100, 0]}
        >
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: 12,
              background: "#00e0ff",
              boxShadow: "0 0 0 2px rgba(0,224,255,0.35)",
            }}
          />
        </Html>
      ) : null}
      {secondPoint ? (
        <Html
          position={secondPoint}
          center
          pointerEvents="none"
          zIndexRange={[100, 0]}
        >
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: 12,
              background: "#00e0ff",
              boxShadow: "0 0 0 2px rgba(0,224,255,0.35)",
            }}
          />
        </Html>
      ) : null}
      {linePoints ? (
        <Line
          points={linePoints as unknown as Array<THREE.Vector3>}
          color="#00e0ff"
          lineWidth={3}
          dashed={false}
          renderOrder={999}
          depthTest={false}
        />
      ) : null}
      {midPoint ? (
        <Html position={midPoint} center>
          <div
            style={{
              background: "rgba(0,0,0,0.6)",
              color: "#fff",
              padding: "4px 8px",
              borderRadius: 6,
              fontSize: 12,
              whiteSpace: "nowrap",
            }}
          >
            {distanceText}
          </div>
        </Html>
      ) : null}
    </group>
  );
}
