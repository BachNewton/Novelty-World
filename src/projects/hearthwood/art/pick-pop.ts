import { Group, type Material, Mesh, type BufferGeometry } from "three";
import type { ForageSpot } from "../engine/forage";
import type { AtmosphereUniforms } from "./atmosphere";
import { cloud, type Cloud, popMaterial, POP_SPARKLES } from "./effects";
import type { ForagePalette } from "./forage-shapes";

/*
 * A pick's little moment: the berries (or the mushroom) lift off their spot
 * with a bounce, swell and shrink away into the basket, while a few soft
 * sparkles drift up and fade. A pop that is over is kept and played again
 * for the next pick, so picking makes nothing new to draw.
 */

export const POP_SECONDS = 0.8;

export interface PickPop {
  group: Group;
  item: Mesh;
  sparkles: Cloud;
  size: number;
  age: number;
}

const easeOut = (t: number) => 1 - (1 - t) ** 3;
const smooth = (a: number, b: number, t: number) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

/** Pops that are over, to play again. They hold nothing of their own to free: the shapes and materials are their callers', the sparkles' quad is shared. */
const over: PickPop[] = [];

function freshPop(atmosphere: AtmosphereUniforms): PickPop {
  const group = new Group();
  const item = new Mesh();
  const sparkles = cloud(POP_SPARKLES, popMaterial(atmosphere));
  sparkles.renderOrder = 6;
  group.add(item, sparkles);
  return { group, item, sparkles, size: 0, age: 0 };
}

export function makePop(shape: BufferGeometry, material: Material, spot: ForageSpot, palette: ForagePalette, atmosphere: AtmosphereUniforms): PickPop {
  const pop = over.pop() ?? freshPop(atmosphere);
  pop.group.position.set(spot.x, spot.y, spot.z);
  pop.item.geometry = shape;
  pop.item.material = material;
  pop.item.position.set(0, 0, 0);
  pop.item.rotation.set(0, spot.turn, 0);
  pop.item.scale.setScalar(spot.size);
  pop.sparkles.material = popMaterial(atmosphere);
  pop.sparkles.userData = { tint: palette.sparkle.clone(), age: 0 };
  pop.size = spot.size;
  pop.age = 0;
  return pop;
}

/** Moves a pop on by `seconds`; false once it is over, when it goes back to be played again, so the caller lets go of it. */
export function agePop(pop: PickPop, seconds: number): boolean {
  pop.age += seconds;
  const t = Math.min(1, pop.age / POP_SECONDS);
  const { item, sparkles, size } = pop;
  item.position.y = 0.55 * easeOut(t);
  item.rotation.y += seconds * 4;
  item.scale.setScalar(size * (1 + 0.35 * Math.sin(Math.PI * Math.min(1, t * 2))) * (1 - smooth(0.5, 1, t)));
  sparkles.userData.age = t;
  if (t < 1) return true;
  over.push(pop);
  return false;
}
