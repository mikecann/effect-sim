import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { GardenModel } from "./rendering/GardenModel.tsx";
import SideToolbar from "./ui/SideToolbar.tsx";
import MeasureTool from "./measure/MeasureTool.tsx";
import { useSimulator } from "./SimulatorContext";
import MeasureStatus from "./measure/MeasureStatus.tsx";
import StringPlacer from "./placing/StringPlacer.tsx";
import StringsRenderer from "./StringsRenderer.tsx";
import { NightModeMultiCameraPass } from "./rendering/NightModeMultiCameraPass.tsx";
import { DayModeMultiCameraPass } from "./rendering/DayModeMultiCameraPass.tsx";
import { useRef } from "react";

export default function SimulatorPanel() {
  const simulator = useSimulator();
  const app = simulator.app;
  const project = app.getProject();
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);

  return (
    <div
      style={{
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: project.settings.nightMode ? "#000000" : "#0a0a0a",
        position: "relative",
      }}
      onPointerDown={(e) => {
        startPosRef.current = { x: e.clientX, y: e.clientY };
        isDraggingRef.current = false;
      }}
      onPointerMove={(e) => {
        const start = startPosRef.current;
        if (!start) return;
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (Math.hypot(dx, dy) > 3) isDraggingRef.current = true;
      }}
      onPointerUp={() => {
        startPosRef.current = null;
      }}
    >
      <Canvas
        style={{ height: "100%", width: "100%" }}
        camera={{ position: [4, 3, 6], fov: 45 }}
        onPointerMissed={(e) => {
          if (e.type !== "click") return;
          if (isDraggingRef.current) return;
          if (app.placingStringId) return;
          app.clearSelection();
        }}
      >
        <ambientLight intensity={project.settings.nightMode ? 0 : 0.6} />
        <directionalLight
          position={[5, 10, 5]}
          intensity={project.settings.nightMode ? 0.1 : 1.2}
        />
        <GardenModel isDraggingRef={isDraggingRef} />
        <MeasureTool />
        {simulator.placingString && (
          <StringPlacer string={simulator.placingString} />
        )}
        <StringsRenderer />
        <OrbitControls enableDamping makeDefault enabled={!app.isMeasureMode} />
        {project.settings.nightMode ? (
          <NightModeMultiCameraPass
            lightsOnTop={project.settings.lightsOnTop}
          />
        ) : (
          <DayModeMultiCameraPass lightsOnTop={project.settings.lightsOnTop} />
        )}
      </Canvas>
      <SideToolbar />
      <MeasureStatus />
    </div>
  );
}
