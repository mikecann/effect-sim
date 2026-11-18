import * as THREE from "three";

// Finding the point on the house under a ray. The string placer uses it for
// the pointer, and camera mapping for each LED seen in a photo
// (src/mapping/projectLeds.ts).

/** How far off the surface a placed point sits, so LEDs aren't inside walls. */
export const SURFACE_OFFSET_M = 0.05;

/** The meshes a ray can land on: the house, without strings or measure marks. */
export const collectSurfaceMeshes = (
  root: THREE.Object3D | null,
): THREE.Object3D[] => {
  const meshes: THREE.Object3D[] = [];
  root?.traverse((obj) => {
    if (obj.userData.__measure || obj.userData.__string) return;
    if (obj instanceof THREE.Mesh) meshes.push(obj);
  });
  return meshes;
};

export type SurfaceHit = {
  /** Where the ray hit, lifted `offset` metres off the surface. */
  point: THREE.Vector3;
  /** The surface's normal there, facing the ray (null for a face-less hit). */
  normal: THREE.Vector3 | null;
  /** How square-on the ray met the surface: 1 head-on, near 0 glancing. */
  headOn: number;
};

/** Where a ray first hits the surface, and how; null if it hits nothing. */
export const raycastSurfaceHit = (
  raycaster: THREE.Raycaster,
  meshes: THREE.Object3D[],
  offset = SURFACE_OFFSET_M,
): SurfaceHit | null => {
  const hit = raycaster.intersectObjects(meshes, true)[0];
  if (!hit) return null;
  const point = hit.point.clone();
  if (!hit.face) return { point, normal: null, headOn: 1 };
  const normal = hit.face.normal
    .clone()
    .applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld))
    .normalize();
  // Faces seen from behind (thin walls, open meshes) lift towards the camera.
  if (normal.dot(raycaster.ray.direction) > 0) normal.negate();
  return {
    point: point.add(normal.clone().multiplyScalar(offset)),
    normal,
    headOn: Math.abs(normal.dot(raycaster.ray.direction)),
  };
};

/**
 * Where a ray first hits the surface, lifted `offset` metres off it along the
 * face's normal; null if it hits nothing.
 */
export const raycastSurface = (
  raycaster: THREE.Raycaster,
  meshes: THREE.Object3D[],
  offset = SURFACE_OFFSET_M,
): THREE.Vector3 | null =>
  raycastSurfaceHit(raycaster, meshes, offset)?.point ?? null;

/** The ray from a camera through a point in normalised device coordinates. */
export const rayFromCamera = (
  camera: THREE.Camera,
  ndc: { x: number; y: number },
): THREE.Raycaster => {
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
  return raycaster;
};

/** A pointer event's position in an element, as normalised device coordinates. */
export const pointerToNdc = (
  e: { clientX: number; clientY: number },
  element: HTMLElement,
) => {
  const rect = element.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
    y: -((e.clientY - rect.top) / rect.height) * 2 + 1,
  };
};
