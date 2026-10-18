import { type Camera, PerspectiveCamera, Quaternion, Vector3 } from "three";

/*
 * Easing the camera from wherever the walker put it to a framing of its own
 * (the hearth's view over Elliott's shoulder, a person framed in
 * conversation) and back again: the pose it is at, eased towards where it is
 * going each frame, and placed on the camera while it is the framing's.
 */

export interface CameraPose {
  position: Vector3;
  quaternion: Quaternion;
  fov: number;
  /** Whether the camera is easing between the walker's view and the framing's, so it is the framing's to place. */
  easing: boolean;
}

export function cameraPose(fov: number): CameraPose {
  return { position: new Vector3(), quaternion: new Quaternion(), fov, easing: false };
}

/** Starts the pose from where the camera is now, as a framing takes it over. */
export function takeOver(pose: CameraPose, camera: Camera, fallbackFov: number): void {
  pose.position.copy(camera.position);
  pose.quaternion.copy(camera.quaternion);
  pose.fov = camera instanceof PerspectiveCamera ? camera.fov : fallbackFov;
  pose.easing = true;
}

export function ease(pose: CameraPose, position: Vector3, quaternion: Quaternion, fov: number, k: number): void {
  pose.position.lerp(position, k);
  pose.quaternion.slerp(quaternion, k);
  pose.fov += (fov - pose.fov) * k;
}

export function place(camera: { position: Vector3; quaternion: Quaternion }, pose: CameraPose): void {
  camera.position.copy(pose.position);
  camera.quaternion.copy(pose.quaternion);
  if (camera instanceof PerspectiveCamera && Math.abs(camera.fov - pose.fov) > 1e-3) {
    camera.fov = pose.fov;
    camera.updateProjectionMatrix();
  }
}

/** Back to wherever the walker put the camera this frame, until it is there: true once arrived. */
export function easeBack(pose: CameraPose, camera: Camera, fallbackFov: number, k: number): boolean {
  const target = camera instanceof PerspectiveCamera ? camera.fov : fallbackFov;
  ease(pose, camera.position, camera.quaternion, target, k);
  const arrived = pose.position.distanceTo(camera.position) < 0.01 && pose.quaternion.angleTo(camera.quaternion) < 0.003;
  if (arrived) pose.easing = false;
  else place(camera, pose);
  return arrived;
}
