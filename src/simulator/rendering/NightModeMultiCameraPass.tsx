import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { EffectComposer, BloomEffect, EffectPass } from "postprocessing";

export function NightModeMultiCameraPass({
  lightsOnTop,
}: {
  lightsOnTop: boolean;
}) {
  const { gl, scene, camera, size } = useThree();

  const hasInit = useRef(false);
  const composerRef = useRef<EffectComposer | null>(null);

  useEffect(() => {
    if (hasInit.current) return;
    // eslint-disable-next-line react-hooks/immutability
    gl.autoClear = false;
    hasInit.current = true;
  }, [gl]);

  // Initialize post-processing with bloom
  useEffect(() => {
    if (!gl || !camera) return;

    const composer = new EffectComposer(gl);
    composerRef.current = composer;

    const bloomEffect = new BloomEffect({
      intensity: 10.0,
      luminanceThreshold: 0.01,
      luminanceSmoothing: 0.1,
      radius: 0.3,
      mipmapBlur: true,
    });
    const effectPass = new EffectPass(camera, bloomEffect);
    composer.addPass(effectPass);

    return () => {
      composer.dispose();
    };
  }, [gl, camera, size]);

  // Update composer size when viewport changes
  useEffect(() => {
    if (!composerRef.current) return;
    composerRef.current.setSize(size.width, size.height);
  }, [size]);

  useFrame(() => {
    const isReady = !!gl && !!camera && !!composerRef.current;
    if (!isReady) return;

    const composer = composerRef.current;
    if (!composer) return;

    // Render world (layer 0) and LEDs (layer 1) directly to composer's input buffer
    gl.setRenderTarget(composer.inputBuffer);
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

    // Apply bloom post-processing and render to screen
    gl.setRenderTarget(null);
    composer.render();

    // Just make sure the default render doesnt render anything
    camera.layers.set(99);
  }, 1);

  return null;
}
