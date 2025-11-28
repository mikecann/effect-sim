import type * as THREE from "three";

export function raycastWithGardenModel(
  raycaster: THREE.Raycaster,
  gardenModel: THREE.Object3D | null,
): THREE.Intersection | null {
  if (!gardenModel) return null;

  // Collect all mesh objects from the garden model
  const gardenObjects: Array<THREE.Object3D> = [];
  gardenModel.traverse((obj) => {
    // Skip objects that are marked as measure or string objects
    if (obj.userData && (obj.userData.__measure || obj.userData.__string))
      return;

    if ("isMesh" in obj && (obj as { isMesh: boolean }).isMesh)
      gardenObjects.push(obj);
  });

  // Perform raycasting
  const intersections = raycaster.intersectObjects(gardenObjects, true);
  return intersections.length > 0 ? intersections[0] : null;
}
