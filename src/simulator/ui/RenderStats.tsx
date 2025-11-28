import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { useState, useRef } from "react";

export function RenderStats() {
  const { gl } = useThree();
  const [stats, setStats] = useState({
    calls: 0,
    triangles: 0,
    points: 0,
    lines: 0,
    fps: 0,
  });

  const lastTime = useRef(0);
  const frames = useRef(0);

  useFrame(() => {
    const now = performance.now();

    // Initialize on first frame
    if (lastTime.current === 0) {
      lastTime.current = now;
      return;
    }

    frames.current++;

    // Update stats every 500ms
    if (now - lastTime.current >= 500) {
      const fps = Math.round(
        (frames.current * 1000) / (now - lastTime.current),
      );

      setStats({
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        points: gl.info.render.points,
        lines: gl.info.render.lines,
        fps,
      });

      lastTime.current = now;
      frames.current = 0;
    }
  });

  return (
    <Html fullscreen>
      <div
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          background: "rgba(0, 0, 0, 0.8)",
          color: "#00ff00",
          padding: "10px",
          fontFamily: "monospace",
          fontSize: "12px",
          borderRadius: "4px",
          pointerEvents: "none",
          zIndex: 1000,
          lineHeight: "1.5",
        }}
      >
        <div>FPS: {stats.fps}</div>
        <div>Draw Calls: {stats.calls}</div>
        <div>Triangles: {stats.triangles.toLocaleString()}</div>
        {stats.points > 0 && <div>Points: {stats.points.toLocaleString()}</div>}
        {stats.lines > 0 && <div>Lines: {stats.lines.toLocaleString()}</div>}
      </div>
    </Html>
  );
}
