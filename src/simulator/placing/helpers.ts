import * as THREE from "three";

export function calculateRemainingDistance(
  pathPoints: Array<THREE.Vector3>,
  ledCount: number,
  spacingMeters: number,
  hoverPoint?: THREE.Vector3 | null,
): number {
  const maxAllowedLength = (ledCount - 1) * spacingMeters;

  let currentLength = 0;
  for (let i = 0; i < pathPoints.length - 1; i++) {
    const segmentStart = pathPoints[i];
    const segmentEnd = pathPoints[i + 1];
    currentLength += segmentStart.distanceTo(segmentEnd);
  }

  if (pathPoints.length > 0 && hoverPoint) {
    const lastAnchor = pathPoints[pathPoints.length - 1];
    currentLength += lastAnchor.distanceTo(hoverPoint);
  }

  const remaining = maxAllowedLength - currentLength;
  return Math.max(0, remaining);
}

export function computeClampedHoverPoint(
  lastAnchor: THREE.Vector3 | null,
  intersectionPoint: THREE.Vector3,
  pathPoints: Array<THREE.Vector3>,
  ledCount: number,
  spacingMeters: number,
): THREE.Vector3 {
  if (!lastAnchor) return intersectionPoint.clone();

  const remainingForHover = calculateRemainingDistance(
    pathPoints,
    ledCount,
    spacingMeters,
    null,
  );

  const potentialHoverPoint = intersectionPoint.clone();
  const hoverDistance = lastAnchor.distanceTo(potentialHoverPoint);
  if (hoverDistance <= remainingForHover) return potentialHoverPoint;

  const direction = new THREE.Vector3()
    .subVectors(potentialHoverPoint, lastAnchor)
    .normalize();
  return lastAnchor.clone().add(direction.multiplyScalar(remainingForHover));
}
