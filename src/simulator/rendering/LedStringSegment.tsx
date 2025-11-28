import * as THREE from "three";
import { LineLed } from "./LineLed";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { useLedData } from "../../data/LedDataStoreContext";
import type { StringUISegmentModel } from "../models/StringUISegmentModel";

export function LedStringSegment({
  segment,
}: {
  segment: StringUISegmentModel;
}) {
  const ledData = useLedData();
  const materialRefs = useRef<Array<THREE.ShaderMaterial | null>>([]);
  const lastUpdateRef = useRef<number>(0);

  const parent = segment.parent;
  const stringId = parent.stringId;
  const isSelected = parent.isSelected;
  const ledSelectionInfo = parent.ledSelectionInfo;
  const brightness = parent.string.brightness;
  const lightsOnTop = parent.lightsOnTop;

  // Use cached geometry from segment model
  const hasValidGeometry = segment.hasValidGeometry;
  const ledPositions = segment.ledPositions;
  const midpoint = segment.midpoint;
  const rotation = segment.rotation;
  const length = segment.length;
  const startIndex = segment.startLedIndex;
  const maxLeds = segment.ledCount;
  const totalLedCount = parent.string.ledCount;

  // Throttled per-frame color update
  useFrame(({ clock }) => {
    if (startIndex >= totalLedCount) return;
    if (!hasValidGeometry) return;

    const now = clock.elapsedTime * 1000;
    if (now - lastUpdateRef.current < 50) return;
    lastUpdateRef.current = now;

    const model = ledData.stringsMap.get(stringId);
    if (!model) return;

    const count = Math.min(maxLeds, totalLedCount - startIndex);
    const scale = Math.max(0, Math.min(1, brightness / 255));

    for (let i = 0; i < count; i++) {
      const material = materialRefs.current[i];
      if (!material) continue;

      const idx = startIndex + i;
      const base = idx * 3;
      const r = model.data[base] ?? 0;
      const g = model.data[base + 1] ?? 0;
      const b = model.data[base + 2] ?? 0;

      const rN = (r / 255) * scale;
      const gN = (g / 255) * scale;
      const bN = (b / 255) * scale;

      const ledColor = material.uniforms.ledColor.value;
      if (ledColor.r !== rN || ledColor.g !== gN || ledColor.b !== bN)
        ledColor.setRGB(rN, gN, bN);
    }
  });

  if (!hasValidGeometry) return null;

  const app = parent.simulator.app;

  return (
    <group renderOrder={10}>
      {/* Invisible clickable area along the segment */}
      <mesh
        position={midpoint}
        quaternion={rotation}
        onClick={(e) => {
          if (app.placingStringId) return;
          e.stopPropagation();
          const project = app.project;
          if (!project) return;
          const node = project.findModel("nodes", stringId);
          if (!node) return;
          if (
            "kind" in node &&
            (node.kind === "string" ||
              node.kind === "switch" ||
              node.kind === "folder" ||
              node.kind === "virtual_string")
          )
            app.setSelectedEntity({ kind: "node", node });
        }}
      >
        <boxGeometry args={[0.2, length, 0.2]} />
        <meshBasicMaterial visible={false} />
      </mesh>

      {/* Render LED cubes along the segment */}
      {ledPositions.map((position, index) => {
        const ledIndex = startIndex + index;
        const isInYellowSegment =
          ledSelectionInfo.yellowLedIndices.has(ledIndex);
        const isInWhiteSegment = ledSelectionInfo.whiteLedIndices.has(ledIndex);
        const ledIsSelected =
          isSelected ||
          isInYellowSegment ||
          isInWhiteSegment ||
          ledSelectionInfo.isHighlighted;
        const ledBorderColor = isInYellowSegment
          ? "yellow"
          : ledSelectionInfo.isHighlighted
            ? "green"
            : "white";

        return (
          <LineLed
            key={index}
            position={position}
            materialRef={(mat) => {
              materialRefs.current[index] = mat;
            }}
            lightsOnTop={lightsOnTop}
            isSelected={ledIsSelected}
            borderColor={ledBorderColor}
          />
        );
      })}
    </group>
  );
}
