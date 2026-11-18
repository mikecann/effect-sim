import * as THREE from "three";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { useLedData } from "../../data/LedDataStoreContext";
import type { StringUIModel } from "../models/StringUIModel";
import type {
  PathSegmentLayout,
  Point3,
} from "../../../shared/geometry/stringLayout";
import { LineLed } from "./LineLed";

type PlacedLed = { index: number; position: THREE.Vector3 };

const toVector = (p: Point3) => new THREE.Vector3(p.x, p.y, p.z);

/** The LED nearest a point, for picking one by clicking near it. */
const nearestLed = (leds: PlacedLed[], point: THREE.Vector3) => {
  let best = leds[0];
  for (const led of leds)
    if (
      led.position.distanceToSquared(point) <
      best.position.distanceToSquared(point)
    )
      best = led;
  return best?.index ?? 0;
};

const UP = new THREE.Vector3(0, 1, 0);

/** An invisible box along a path segment, so the string can be clicked. */
function SegmentHitArea({
  segment,
  onClick,
}: {
  segment: PathSegmentLayout;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const { midpoint, rotation } = useMemo(() => {
    const start = toVector(segment.start);
    const end = toVector(segment.end);
    const direction = end.clone().sub(start).normalize();
    return {
      midpoint: start.clone().add(end).multiplyScalar(0.5),
      rotation: new THREE.Quaternion().setFromUnitVectors(UP, direction),
    };
  }, [segment]);
  if (segment.length < 0.001) return null;
  return (
    <mesh position={midpoint} quaternion={rotation} onClick={onClick}>
      <boxGeometry args={[0.2, segment.length, 0.2]} />
      <meshBasicMaterial visible={false} />
    </mesh>
  );
}

/** One string's LEDs, wherever its layout puts them, lit from the LED data. */
export function LedString({ string }: { string: StringUIModel }) {
  const ledData = useLedData();
  const materials = useRef(new Map<number, THREE.ShaderMaterial>());
  const lastUpdate = useRef(0);
  const app = string.simulator.app;
  const { key, layout, isSelected, highlights, lightsOnTop, ledSize } = string;
  const brightness = string.string.brightness;
  const ledCount = string.string.ledCount;
  const tool = app.tool;
  const pickedFirst =
    tool.kind === "pickingRange" && tool.first?.stringKey === key
      ? tool.first.index
      : null;

  const leds = useMemo(
    () =>
      layout.positions.flatMap((p, index) =>
        p ? [{ index, position: toVector(p) }] : [],
      ),
    [layout],
  );

  useFrame(({ clock }) => {
    const now = clock.elapsedTime * 1000;
    if (now - lastUpdate.current < 50) return;
    lastUpdate.current = now;

    const model = ledData.stringsMap.get(key);
    if (!model) return;
    const scale = Math.max(0, Math.min(1, brightness / 255));
    for (const { index } of leds) {
      const material = materials.current.get(index);
      if (!material || index >= ledCount) continue;
      const base = index * 3;
      const r = ((model.data[base] ?? 0) / 255) * scale;
      const g = ((model.data[base + 1] ?? 0) / 255) * scale;
      const b = ((model.data[base + 2] ?? 0) / 255) * scale;
      const color = material.uniforms.ledColor.value as THREE.Color;
      if (color.r !== r || color.g !== g || color.b !== b)
        color.setRGB(r, g, b);
    }
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (app.tool.kind === "pickingRange") {
      e.stopPropagation();
      app.sendTool({
        kind: "PICK_LED",
        stringKey: key,
        index: nearestLed(leds, e.point),
      });
      return;
    }
    if (app.tool.kind !== "select") return;
    e.stopPropagation();
    const node = app.project?.findNode(key);
    if (node) app.setSelectedEntity({ kind: "node", node });
  };

  return (
    <group renderOrder={10}>
      {layout.isMapped
        ? leds.map(({ index, position }) => (
            <mesh key={`hit-${index}`} position={position} onClick={onClick}>
              <boxGeometry args={[0.15, 0.15, 0.15]} />
              <meshBasicMaterial visible={false} />
            </mesh>
          ))
        : layout.segments.map((segment) => (
            <SegmentHitArea
              key={segment.index}
              segment={segment}
              onClick={onClick}
            />
          ))}

      {leds.map(({ index, position }) => {
        const isYellow = highlights.yellow.has(index);
        const isPicked = pickedFirst === index;
        return (
          <LineLed
            key={index}
            position={position}
            materialRef={(material) => materials.current.set(index, material)}
            lightsOnTop={lightsOnTop}
            isSelected={
              isSelected || isYellow || isPicked || highlights.white.has(index)
            }
            borderColor={isPicked ? "green" : isYellow ? "yellow" : "white"}
            stringLedSize={ledSize}
          />
        );
      })}
    </group>
  );
}
