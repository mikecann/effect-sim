import * as THREE from "three";
import type { CameraPose } from "./solvePose";

// The camera that took a mapping photo, and how the simulator's view lines up
// with it. The photo is drawn over the view, fitted inside it ("contain"), so
// the view's camera matches the photo's when it sits where the photo's did
// and its field of view is widened by however much taller the view is than
// the photo on screen.

export type Rect = { left: number; top: number; width: number; height: number };

/** Where a photo of this aspect sits inside a view, fitted and centred. */
export const photoRect = (
  viewWidth: number,
  viewHeight: number,
  photoAspect: number,
): Rect => {
  const viewAspect = viewWidth / viewHeight;
  const width = viewAspect > photoAspect ? viewHeight * photoAspect : viewWidth;
  const height = width / photoAspect;
  return {
    left: (viewWidth - width) / 2,
    top: (viewHeight - height) / 2,
    width,
    height,
  };
};

const tanHalf = (fovDeg: number) => Math.tan((fovDeg * Math.PI) / 360);
const fromTanHalf = (t: number) => (Math.atan(t) * 360) / Math.PI;

/** The view's vertical field of view that shows exactly what the photo does. */
export const viewFovForPhoto = (
  photoFovDeg: number,
  viewHeight: number,
  rect: Rect,
) => fromTanHalf(tanHalf(photoFovDeg) * (viewHeight / rect.height));

/** The photo's field of view, if the view as it is now took it. */
export const photoFovForView = (
  viewFovDeg: number,
  viewHeight: number,
  rect: Rect,
) => fromTanHalf(tanHalf(viewFovDeg) * (rect.height / viewHeight));

/** A three.js camera for a pose, e.g. to cast rays through the photo. */
export const cameraForPose = (pose: CameraPose): THREE.PerspectiveCamera => {
  const camera = new THREE.PerspectiveCamera(
    pose.fovDeg,
    pose.aspect,
    0.01,
    1000,
  );
  camera.position.set(pose.position.x, pose.position.y, pose.position.z);
  camera.quaternion.set(
    pose.quaternion.x,
    pose.quaternion.y,
    pose.quaternion.z,
    pose.quaternion.w,
  );
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return camera;
};

/** The pose of a three.js camera, as the photo's (its fov already the photo's). */
export const poseOfCamera = (
  camera: THREE.Camera,
  fovDeg: number,
  aspect: number,
): CameraPose => ({
  position: {
    x: camera.position.x,
    y: camera.position.y,
    z: camera.position.z,
  },
  quaternion: {
    x: camera.quaternion.x,
    y: camera.quaternion.y,
    z: camera.quaternion.z,
    w: camera.quaternion.w,
  },
  fovDeg,
  aspect,
});

/** A photo point (u right, v down, 0..1) as normalised device coordinates. */
export const imageToNdc = ({ u, v }: { u: number; v: number }) => ({
  x: u * 2 - 1,
  y: 1 - v * 2,
});
