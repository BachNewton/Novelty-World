import { Group, type Material, Mesh, type BufferGeometry } from "three";
import type { ForageSpot } from "../engine/forage";
import type { AtmosphereUniforms } from "./atmosphere";
import { cloud, popMaterial, POP_SPARKLES } from "./effects";
import type { ForagePalette } from "./forage-shapes";

/*
 * A pick's little moment: the berries (or the mushroom) lift off their spot
 * with a bounce, swell and shrink away into the basket, while a few soft
 * sparkles drift up and fade.
 */

export const POP_SECONDS = 0.8;

export interface PickPop {
  group: Group;
  item: Mesh;
  sparkles: Mesh;
  size: number;
  age: number;
}

const easeOut = (t: number) => 1 - (1 - t) ** 3;
const smooth = (a: number, b: number, t: number) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

export function makePop(shape: BufferGeometry, material: Material, spot: ForageSpot, palette: ForagePalette, atmosphere: AtmosphereUniforms): PickPop {
  const group = new Group();
  group.position.set(spot.x, spot.y, spot.z);
  const item = new Mesh(shape, material);
  item.rotation.y = spot.turn;
  item.scale.setScalar(spot.size);
  const sparkles = cloud(POP_SPARKLES, popMaterial(atmosphere));
  sparkles.renderOrder = 6;
  sparkles.userData = { tint: palette.sparkle.clone(), age: 0 };
  group.add(item, sparkles);
  return { group, item, sparkles, size: spot.size, age: 0 };
}

/** Moves a pop on by `seconds`; false once it is over. */
export function agePop(pop: PickPop, seconds: number): boolean {
  pop.age += seconds;
  const t = Math.min(1, pop.age / POP_SECONDS);
  const { item, sparkles, size } = pop;
  item.position.y = 0.55 * easeOut(t);
  item.rotation.y += seconds * 4;
  item.scale.setScalar(size * (1 + 0.35 * Math.sin(Math.PI * Math.min(1, t * 2))) * (1 - smooth(0.5, 1, t)));
  sparkles.userData.age = t;
  return t < 1;
}
