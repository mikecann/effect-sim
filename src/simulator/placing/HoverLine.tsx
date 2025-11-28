import * as THREE from "three";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";

export function HoverLine({
  lastAnchorPoint,
  hoverPointRef,
}: {
  lastAnchorPoint: THREE.Vector3 | null;
  hoverPointRef: React.RefObject<THREE.Vector3 | null>;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  // Update the mesh position and rotation on each frame without causing re-renders
  useFrame(() => {
    const hoverPoint = hoverPointRef.current;

    if (!lastAnchorPoint || !hoverPoint || !meshRef.current) {
      if (meshRef.current) meshRef.current.visible = false;
      return;
    }

    const direction = new THREE.Vector3().subVectors(
      hoverPoint,
      lastAnchorPoint,
    );
    const length = direction.length();

    // Skip rendering if points are too close
    if (length < 0.001) {
      if (meshRef.current) meshRef.current.visible = false;
      return;
    }

    if (meshRef.current) {
      meshRef.current.visible = true;

      // Calculate midpoint for line positioning
      const midpoint = new THREE.Vector3()
        .addVectors(lastAnchorPoint, hoverPoint)
        .multiplyScalar(0.5);
      meshRef.current.position.copy(midpoint);

      // Calculate rotation to align with direction
      const rotation = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      const forward = direction.clone().normalize();
      rotation.setFromUnitVectors(up, forward);
      meshRef.current.quaternion.copy(rotation);

      // Update the mesh scale to match the new length
      meshRef.current.scale.set(1, length / 0.1, 1);
    }
  });

  return (
    <group>
      {/* Render only the elongated cube line without LEDs */}
      <mesh ref={meshRef} visible={false}>
        <boxGeometry args={[0.03, 0.1, 0.03]} />
        <meshBasicMaterial color="#66ff66" transparent opacity={0.7} />
      </mesh>
    </group>
  );
}
