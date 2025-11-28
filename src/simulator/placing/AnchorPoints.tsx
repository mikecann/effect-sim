import type * as THREE from "three";

export type AnchorPointsProps = {
  points: Array<THREE.Vector3>;
};

export default function AnchorPoints({ points }: AnchorPointsProps) {
  return (
    <>
      {points.map((point, index) => (
        <mesh key={index} position={point}>
          <sphereGeometry args={[0.07, 16, 16]} />
          <meshBasicMaterial color="red" />
        </mesh>
      ))}
    </>
  );
}
