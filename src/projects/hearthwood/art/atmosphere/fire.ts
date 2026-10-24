import { Color, Vector3, type Object3D, type PointLight } from "three";
import { uniform } from "three/tsl";
import type { FeatureFrame } from "../feature-art";
import { colourUniform } from "../tsl";

/*
 * Where the fire is and how brightly it burns, for the air's features: the
 * glow round it in the air, and the clouds' shadows, which never dim it.
 * The campfire is the scene's one point light, and camp moves, so it is
 * looked for in the scene now and then rather than told; no fire is a
 * light far below the world with no colour.
 */

export const FIRE = {
  position: uniform(new Vector3(0, -1e5, 0)),
  /** The fire's light: its colour times its intensity. */
  light: colourUniform(),
};

/** Frames between looks for the fire. */
const LOOK_EVERY = 45;
let frames = LOOK_EVERY;
let found: PointLight | null = null;
let lastFrame: FeatureFrame | null = null;
const visit = (o: Object3D) => {
  if (!found && (o as PointLight).isPointLight === true) found = o as PointLight;
};
const at = new Vector3();
const colour = new Color();

/** Updates the fire's uniforms, once a frame however many features ask. */
export function updateFire(frame: FeatureFrame): void {
  if (frame === lastFrame) return;
  lastFrame = frame;
  const { scene } = frame;
  if (++frames >= LOOK_EVERY || (found && !found.parent)) {
    frames = 0;
    found = null;
    scene.traverseVisible(visit);
  }
  if (!found || found.intensity <= 0) {
    FIRE.light.value.setRGB(0, 0, 0);
    FIRE.position.value.set(0, -1e5, 0);
    return;
  }
  FIRE.position.value.copy(found.getWorldPosition(at));
  FIRE.light.value.copy(colour.copy(found.color).multiplyScalar(found.intensity));
}
