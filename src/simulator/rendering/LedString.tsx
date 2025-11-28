import { LedStringSegment } from "./LedStringSegment";
import type { StringUIModel } from "../models/StringUIModel";
import type { Point3D } from "../models/StringUISegmentModel";

export function LedString({
  string,
  pathPointsOverride,
}: {
  string: StringUIModel;
  pathPointsOverride?: Point3D[];
}) {
  // When pathPointsOverride is provided (during placement), we need to compute segments dynamically
  // Otherwise use the cached segments from the model
  if (pathPointsOverride)
    return (
      <LedStringWithOverride string={string} pathPoints={pathPointsOverride} />
    );

  const segments = string.segments;
  if (segments.length === 0) return null;

  return (
    <group>
      {segments.map((segment) => (
        <LedStringSegment key={segment.segmentIndex} segment={segment} />
      ))}
    </group>
  );
}

// Separate component for placement mode with path override
function LedStringWithOverride({
  string,
  pathPoints,
}: {
  string: StringUIModel;
  pathPoints: Point3D[];
}) {
  if (pathPoints.length < 2) return null;

  // Compute segment data for override path (similar logic to StringUIModel)
  const spacingMeters = string.string.spacingMeters;
  const ledCount = string.string.ledCount;

  // Calculate segment lengths
  const segmentLengths: number[] = [];
  for (let i = 0; i < pathPoints.length - 1; i++) {
    const a = pathPoints[i];
    const b = pathPoints[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    segmentLengths.push(Math.sqrt(dx * dx + dy * dy + dz * dz));
  }

  const totalLength = segmentLengths.reduce((a, b) => a + b, 0);
  const ledsPerMeter = 1 / spacingMeters;
  const totalLedsBySpacing = Math.max(
    1,
    Math.round(totalLength * ledsPerMeter),
  );
  const totalLeds = Math.min(ledCount, totalLedsBySpacing);

  // Allocate LEDs across segments proportionally
  const allocations: { startIndex: number; count: number }[] = [];
  let assigned = 0;
  for (let i = 0; i < segmentLengths.length; i++) {
    const proportion = totalLength > 0 ? segmentLengths[i] / totalLength : 0;
    const count =
      i === segmentLengths.length - 1
        ? totalLeds - assigned
        : Math.round(totalLeds * proportion);
    allocations.push({ startIndex: assigned, count: Math.max(1, count) });
    assigned += allocations[i].count;
  }

  // Normalize in case rounding overshot
  while (assigned > totalLeds)
    for (let i = 0; i < allocations.length && assigned > totalLeds; i++)
      if (allocations[i].count > 1) {
        allocations[i].count -= 1;
        assigned -= 1;
      }

  // Recalculate start indices
  let runningStart = 0;
  for (const alloc of allocations) {
    alloc.startIndex = runningStart;
    runningStart += alloc.count;
  }

  return (
    <group>
      {pathPoints.slice(0, -1).map((start, index) => {
        const end = pathPoints[index + 1];
        const alloc = allocations[index];
        return (
          <LedStringSegmentOverride
            key={index}
            string={string}
            start={start}
            end={end}
            startLedIndex={alloc.startIndex}
            ledCount={alloc.count}
          />
        );
      })}
    </group>
  );
}

// Minimal segment renderer for placement mode (no click handling, no selection)
function LedStringSegmentOverride({
  string,
  start,
  end,
  startLedIndex,
  ledCount,
}: {
  string: StringUIModel;
  start: Point3D;
  end: Point3D;
  startLedIndex: number;
  ledCount: number;
}) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);

  if (length < 0.001) return null;

  const spacingMeters = string.string.spacingMeters;
  const positions: Array<{ x: number; y: number; z: number }> = [];
  const nx = dx / length;
  const ny = dy / length;
  const nz = dz / length;

  for (let distance = 0; distance <= length; distance += spacingMeters)
    positions.push({
      x: start.x + nx * distance,
      y: start.y + ny * distance,
      z: start.z + nz * distance,
    });

  if (positions.length === 0) positions.push(start);

  // Limit to allocated count
  const ledsToRender = positions.slice(0, ledCount);

  return (
    <group>
      {ledsToRender.map((pos, i) => (
        <mesh key={i} position={[pos.x, pos.y, pos.z]}>
          <boxGeometry args={[0.03, 0.03, 0.03]} />
          <meshBasicMaterial color="#333333" />
        </mesh>
      ))}
    </group>
  );
}
