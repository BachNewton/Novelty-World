import { Box3, Matrix4, Quaternion, Vector3, type Node } from "three/webgpu";
import { positionWorld, uniform, varying, vec4 } from "three/tsl";
import type { CarState } from "../sim/car-state";
import type { CarArt } from "./cars/model";

/*
 * The room the player's car takes up, for everything else in the world to keep out
 * of: a grass tuft it rolls over, a puff of its own dust, a tree it drives through.
 * From outside the body hides what's in it, but not through the glass, so anything
 * that isn't the car itself would seem to fill the cabin.
 *
 * It's two boxes in the car's own frame, from the drawn art: the body up to where
 * the glass starts, and the glass's own bounds over the cabin, so dust over the
 * bonnet or behind the boot isn't cut where a single box round the roof would.
 * Each material that wants it drops its pixels inside, in its mask: every one that
 * takes it already has a mask, so it adds no `discard` and keeps the GPU's early
 * depth test as it was. The point's place in the car's frame is worked out per
 * vertex, where it is exact, being a linear map of the vertex's.
 *
 * One car, so one set of uniforms for every material. Until a car is fitted the
 * boxes are empty, so a kit's gallery draws everything.
 */

const empty = () => ({ low: uniform(new Vector3(1, 1, 1)), high: uniform(new Vector3(-1, -1, -1)) });
const toCar = uniform(new Matrix4());
const body = empty();
const cabin = empty();

/** True where a pixel lies outside the player's car: AND it into a mask. A material that places its vertices itself says where they are in the world. */
export function outsideCar(world: Node<"vec3"> = positionWorld) {
  const local = varying(toCar.mul(vec4(world, 1)).xyz);
  const within = ({ low, high }: ReturnType<typeof empty>) => local.greaterThan(low).all().and(local.lessThan(high).all());
  return within(body).or(within(cabin)).not();
}

const boundsOf = (geometry: CarArt["body"]) => {
  geometry.computeBoundingBox();
  return (geometry.boundingBox ?? new Box3()).clone();
};

/** Takes the shape of a car's art: on its first drawing and whenever the car changes. */
export function fitCarVolume({ body: shell, glass }: CarArt) {
  const whole = boundsOf(shell);
  body.low.value.copy(whole.min);
  body.high.value.copy(whole.max);
  if (!glass) {
    cabin.low.value.set(1, 1, 1);
    cabin.high.value.set(-1, -1, -1);
    return;
  }
  const glazed = boundsOf(glass);
  body.high.value.y = glazed.min.y;
  cabin.low.value.copy(glazed.min);
  cabin.high.value.copy(glazed.max);
}

const at = new Vector3();
const turn = new Quaternion();
const unscaled = new Vector3(1, 1, 1);

/** Puts the volume where the car is drawn this frame. */
export function placeCarVolume({ position, rotation }: CarState) {
  toCar.value.compose(at.set(...position), turn.set(...rotation), unscaled).invert();
}
