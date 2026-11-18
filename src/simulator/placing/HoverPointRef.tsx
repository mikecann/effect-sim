import type * as THREE from "three";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { calculateRemainingDistance } from "./helpers";
import type { Point3 } from "../../../shared/geometry/stringLayout";

export type HoverPointRefProps = {
  hoverPointRef: React.RefObject<THREE.Vector3 | null>;
  ledCount: number;
  spacingMeters: number;
  pathPoints: ReadonlyArray<Point3>;
};

export function HoverPoint({
  hoverPointRef,
  ledCount,
  spacingMeters,
  pathPoints,
}: HoverPointRefProps) {
  const sphereRef = useRef<THREE.Mesh>(null);
  const labelGroupRef = useRef<THREE.Group>(null);
  const labelDivRef = useRef<HTMLDivElement>(null);

  useFrame(() => {
    if (hoverPointRef.current) {
      // Update sphere position
      if (sphereRef.current) {
        sphereRef.current.visible = true;
        sphereRef.current.position.copy(hoverPointRef.current);
      }

      // Move the label group directly without React state
      if (labelGroupRef.current) {
        labelGroupRef.current.visible = true;
        labelGroupRef.current.position.copy(hoverPointRef.current);
        labelGroupRef.current.position.y += 0.2;
      }

      // Update label text imperatively
      const distance = calculateRemainingDistance(
        pathPoints,
        ledCount,
        spacingMeters,
        hoverPointRef.current,
      );
      if (labelDivRef.current)
        labelDivRef.current.textContent = `${distance.toFixed(2)} m remaining`;
    } else {
      if (sphereRef.current) sphereRef.current.visible = false;
      if (labelGroupRef.current) labelGroupRef.current.visible = false;
    }
  });

  return (
    <group>
      <mesh ref={sphereRef} visible={false}>
        <sphereGeometry args={[0.07, 16, 16]} />
        <meshBasicMaterial color="yellow" />
      </mesh>
      <group ref={labelGroupRef} visible={false}>
        <Html
          position={[0, 0, 0]}
          center
          style={{ zIndex: 1000, pointerEvents: "none", userSelect: "none" }}
        >
          <div
            ref={labelDivRef}
            style={{
              background: "rgba(0,0,0,0.6)",
              color: "#fff",
              padding: "4px 8px",
              borderRadius: 6,
              fontSize: 12,
              whiteSpace: "nowrap",
            }}
          >
            0.00 m remaining
          </div>
        </Html>
      </group>
    </group>
  );
}
