import { useEffect, useMemo, useState } from "react";

const ANIMATION_DURATION_MS = 2000; // 2 seconds for full cycle
const EFFECT_DURATION_FRAMES = 100; // Match endFrame - startFrame

export function FakeEffectProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [frame, setFrame] = useState(0);
  const [loopCount] = useState(0);

  useEffect(() => {
    let rafId: number;
    let startTime: number | null = null;

    const animate = (timestamp: number) => {
      if (startTime === null) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const elapsedMs = elapsed % ANIMATION_DURATION_MS;
      // Convert elapsed time to frame number (0 to EFFECT_DURATION_FRAMES)
      const currentFrame = Math.floor(
        (elapsedMs / ANIMATION_DURATION_MS) * EFFECT_DURATION_FRAMES,
      );
      setFrame(currentFrame);
      rafId = requestAnimationFrame(animate);
    };

    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const model = useMemo(
    () => ({
      effectFrame: frame,
      effectPlaybackRatio: frame / EFFECT_DURATION_FRAMES,
      loopCount,
    }),
    [frame, loopCount],
  );

  return null;
  //return <EffectProvider model={model}>{children}</EffectProvider>;
}
