import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";

export function DayModeMultiCameraPass({
  lightsOnTop,
}: {
  lightsOnTop: boolean;
}) {
  const { gl, scene, camera } = useThree();

  const hasInit = useRef(false);

  useEffect(() => {
    if (hasInit.current) return;
    // eslint-disable-next-line react-hooks/immutability
    gl.autoClear = false;
    hasInit.current = true;
  }, [gl]);

  useFrame(() => {
    const isReady = !!gl && !!camera;
    if (!isReady) return;

    // Render directly to screen without post-processing
    gl.setRenderTarget(null);
    gl.clear();

    if (lightsOnTop) {
      // Render garden model (layer 0) first
      camera.layers.set(0);
      gl.render(scene, camera);

      // Render LEDs (layer 1) on top
      gl.clearDepth();
      camera.layers.set(1);
      gl.render(scene, camera);
    } else {
      // Render LEDs (layer 1) first with depth writing enabled
      camera.layers.set(1);
      gl.render(scene, camera);

      // Render garden model (layer 0) on top, don't clear depth so it can properly occlude LEDs
      camera.layers.set(0);
      gl.render(scene, camera);
    }

    // Just make sure the default render doesnt render anything
    camera.layers.set(99);
  }, 1);

  return null;
}
