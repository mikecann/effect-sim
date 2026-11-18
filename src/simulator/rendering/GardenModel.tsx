import { useGLTF } from "@react-three/drei";
import { useSimulator } from "../SimulatorContext";
import { useEffect, useRef } from "react";
import * as THREE from "three";

export function GardenModel({
  isDraggingRef,
}: {
  isDraggingRef?: React.RefObject<boolean>;
}) {
  const gltf = useGLTF("/garden04.glb", true, true);
  const appModel = useSimulator().app;
  const ref = useRef<THREE.Object3D>(null);

  useEffect(() => {
    if (ref.current) {
      appModel.setGardenModel(ref.current);
      const layers = new THREE.Layers();
      layers.set(0);
      // Ensure the garden model always renders behind LED strings
      ref.current.traverse((obj) => {
        obj.layers = layers;
      });
    }
    return () => {
      appModel.setGardenModel(null);
    };
  }, [appModel]);

  if (!gltf || !gltf.scene) return null;
  return (
    <primitive
      ref={ref}
      onClick={() => {
        if (appModel.tool.kind !== "select") return;
        if (isDraggingRef?.current) return;
        appModel.clearSelection();
      }}
      object={gltf.scene}
    />
  );
}
