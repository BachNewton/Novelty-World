import { AdditiveBlending, BufferAttribute, BufferGeometry, Group, type Material, Mesh, Points, PointsMaterial } from "three";
import type { ForageSpot } from "../engine/forage";
import type { ForagePalette } from "./forage-shapes";

/*
 * A pick's little moment: the berries (or the mushroom) lift off their spot
 * with a bounce, swell and shrink away into the basket, while a few soft
 * sparkles drift up and fade.
 */

export const POP_SECONDS = 0.8;
const SPARKLES = 7;

export interface PickPop {
  group: Group;
  item: Mesh;
  sparkles: Points<BufferGeometry, PointsMaterial>;
  size: number;
  age: number;
}

const easeOut = (t: number) => 1 - (1 - t) ** 3;
const smooth = (a: number, b: number, t: number) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

export function makePop(shape: BufferGeometry, material: Material, spot: ForageSpot, palette: ForagePalette): PickPop {
  const group = new Group();
  group.position.set(spot.x, spot.y, spot.z);
  const item = new Mesh(shape, material);
  item.rotation.y = spot.turn;
  item.scale.setScalar(spot.size);
  const sparkleAt = new Float32Array(SPARKLES * 3);
  for (let s = 0; s < SPARKLES; s++) {
    const angle = (s / SPARKLES) * Math.PI * 2;
    sparkleAt.set([Math.cos(angle) * 0.12, 0.08 + (s % 3) * 0.06, Math.sin(angle) * 0.12], s * 3);
  }
  const sparkleShape = new BufferGeometry();
  sparkleShape.setAttribute("position", new BufferAttribute(sparkleAt, 3));
  const sparkleLook = new PointsMaterial({ color: palette.sparkle, size: 0.07, transparent: true, depthWrite: false, blending: AdditiveBlending });
  const sparkles = new Points(sparkleShape, sparkleLook);
  group.add(item, sparkles);
  return { group, item, sparkles, size: spot.size, age: 0 };
}

/** Lets go of what a pop made of its own (its shape is the design's, kept by whoever made it). */
export function disposePop(pop: PickPop): void {
  pop.sparkles.geometry.dispose();
  pop.sparkles.material.dispose();
}

/** Moves a pop on by `seconds`; false once it is over. */
export function agePop(pop: PickPop, seconds: number): boolean {
  pop.age += seconds;
  const t = Math.min(1, pop.age / POP_SECONDS);
  const { item, sparkles, size } = pop;
  item.position.y = 0.55 * easeOut(t);
  item.rotation.y += seconds * 4;
  item.scale.setScalar(size * (1 + 0.35 * Math.sin(Math.PI * Math.min(1, t * 2))) * (1 - smooth(0.5, 1, t)));
  sparkles.position.y = 0.45 * easeOut(t);
  sparkles.scale.setScalar(1 + 1.6 * t);
  sparkles.material.opacity = 1 - smooth(0.35, 1, t);
  return t < 1;
}
