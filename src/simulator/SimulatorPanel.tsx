import { Canvas } from "@react-three/fiber";
import { GardenModel } from "./rendering/GardenModel.tsx";
import SideToolbar from "./ui/SideToolbar.tsx";
import MeasureTool from "./measure/MeasureTool.tsx";
import { SimulatorContext } from "./SimulatorContext";
import MeasureStatus from "./measure/MeasureStatus.tsx";
import { PlacementStatus } from "./placing/PlacementStatus.tsx";
import { MappingScene } from "../mapping/MappingScene.tsx";
import { PhotoOverlay } from "../mapping/PhotoOverlay.tsx";
import { RangePickStatus } from "./ui/RangePickStatus.tsx";
import { DevCanvasHooks } from "../common/DevHooks.tsx";
import StringPlacer from "./placing/StringPlacer.tsx";
import StringsRenderer from "./StringsRenderer.tsx";
import { NightModeMultiCameraPass } from "./rendering/NightModeMultiCameraPass.tsx";
import { DayModeMultiCameraPass } from "./rendering/DayModeMultiCameraPass.tsx";
import { useMemo, useRef } from "react";
import { LoadingOverlay } from "./ui/LoadingOverlay";
import { SimulatorControls } from "./SimulatorControls";
import { SimulatorUIModel } from "./models/SimulatorUIModel.ts";
import { useApp } from "../common/AppContext.tsx";

export default function SimulatorPanel({ id }: { id: string }) {
  const app = useApp();
  const simulator = useMemo(() => new SimulatorUIModel(app, id), [app, id]);
  const project = app.getProject();
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);

  return (
    <SimulatorContext value={simulator}>
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
        <LoadingOverlay />
        <Canvas
          style={{ height: "100%", width: "100%" }}
          camera={{ position: [4, 3, 6], fov: 45 }}
          onPointerMissed={(e) => {
            if (e.type !== "click") return;
            if (isDraggingRef.current) return;
            if (app.tool.kind !== "select") return;
            app.clearSelection();
          }}
        >
          <ambientLight intensity={project.settings.nightMode ? 0 : 0.6} />
          <directionalLight
            position={[5, 10, 5]}
            intensity={project.settings.nightMode ? 0.1 : 1.2}
          />
          <GardenModel isDraggingRef={isDraggingRef} />
          {app.isMeasureMode ? <MeasureTool /> : null}
          {app.isMeasureMode ? null : <SimulatorControls />}
          {app.placingTool ? <StringPlacer tool={app.placingTool} /> : null}
          <StringsRenderer />
          <MappingScene />
          <DevCanvasHooks />

          {project.settings.nightMode ? (
            <NightModeMultiCameraPass
              lightsOnTop={project.settings.lightsOnTop}
            />
          ) : (
            <DayModeMultiCameraPass
              lightsOnTop={project.settings.lightsOnTop}
            />
          )}
        </Canvas>
        <PhotoOverlay />
        <SideToolbar />
        <MeasureStatus />
        <PlacementStatus />
        <RangePickStatus />
      </div>
    </SimulatorContext>
  );
}
