import { Color, Vector3, type Object3D, type PointLight } from "three";
import { uniform } from "three/tsl";
import type { FeatureFrame } from "../feature-art";
import { colourUniform } from "../tsl";

/*
 * Where the fire is and how brightly it burns, for the air's features: the
 * glow round it in the air, and the clouds' shadows, which never dim it.
 * A campfire registers its light while it is mounted (camp moves, and the
 * gallery has one of its own), so nothing walks the scene to find it; the
 * fire is the first registered light that is in the scene, shown and
 * burning. No fire is a light far below the world with no colour.
 */

export const FIRE = {
  position: uniform(new Vector3(0, -1e5, 0)),
  /** The fire's light: its colour times its intensity. */
  light: colourUniform(),
};

const lights = new Set<PointLight>();

/** Registers a campfire's light while it is mounted; returns its unregistering, for an effect's cleanup. */
export function registerFireLight(light: PointLight): () => void {
  lights.add(light);
  return () => {
    lights.delete(light);
  };
}

/** Whether an object is drawn in the scene: in it, and it and everything above it shown. */
function shownIn(scene: Object3D, o: Object3D): boolean {
  for (let up: Object3D | null = o; up; up = up.parent) {
    if (!up.visible) return false;
    if (up === scene) return true;
  }
  return false;
}

let lastFrame: FeatureFrame | null = null;
const at = new Vector3();
const colour = new Color();

/** Updates the fire's uniforms, once a frame however many features ask. */
export function updateFire(frame: FeatureFrame): void {
  if (frame === lastFrame) return;
  lastFrame = frame;
  let found: PointLight | null = null;
  for (const light of lights) {
    if (light.intensity > 0 && shownIn(frame.scene, light)) {
      found = light;
      break;
    }
  }
  if (!found) {
    FIRE.light.value.setRGB(0, 0, 0);
    FIRE.position.value.set(0, -1e5, 0);
    return;
  }
  FIRE.position.value.copy(found.getWorldPosition(at));
  FIRE.light.value.copy(colour.copy(found.color).multiplyScalar(found.intensity));
}
