import { distance, type Point3 } from "../../../shared/geometry/stringLayout";

/** How much of the string is left once the path (and the hover point, if any) is drawn. */
export function calculateRemainingDistance(
  pathPoints: ReadonlyArray<Point3>,
  ledCount: number,
  spacingMeters: number,
  hoverPoint?: Point3 | null,
): number {
  const maxAllowedLength = (ledCount - 1) * spacingMeters;
  let length = 0;
  for (let i = 0; i < pathPoints.length - 1; i++)
    length += distance(pathPoints[i], pathPoints[i + 1]);
  const last = pathPoints[pathPoints.length - 1];
  if (last && hoverPoint) length += distance(last, hoverPoint);
  return Math.max(0, maxAllowedLength - length);
}

/** The hover point, pulled back along the line from the last point so the path can't outrun the string. */
export function computeClampedHoverPoint(
  pathPoints: ReadonlyArray<Point3>,
  target: Point3,
  ledCount: number,
  spacingMeters: number,
): Point3 {
  const last = pathPoints[pathPoints.length - 1];
  if (!last) return target;
  const remaining = calculateRemainingDistance(
    pathPoints,
    ledCount,
    spacingMeters,
  );
  const reach = distance(last, target);
  if (reach <= remaining || reach === 0) return target;
  const t = remaining / reach;
  return {
    x: last.x + (target.x - last.x) * t,
    y: last.y + (target.y - last.y) * t,
    z: last.z + (target.z - last.z) * t,
  };
}
