import { seeded, type V3 } from "../roadside/mesh";
import type { RoadsideModel } from "../roadside/models";
import { Painted, streetModel, type Motion, type StreetPart } from "./paint";

/*
 * Åland's midsummer pole, which stands all year in a village: a tall mast, clad in
 * birch leaves, with a crossbar and two hanging rings, little sailing boats for the
 * islands' shipping, ribbons, and a sun on top. Leaves are a saw-toothed tube: each
 * length starts wide and narrows into the next, so the outline is shaggy for few
 * triangles.
 */

const MAST_M = 15;
const BAR_M = 10.8;
const BAR_HALF_M = 2.6;
const RING_RADIUS_M = 0.95;
const RING_DROP_M = 0.55;
const RING_STEPS = 9;
const SHAG_LENGTHS = 15;

const way = (from: V3, to: V3, share: number): V3 => [from[0] + (to[0] - from[0]) * share, from[1] + (to[1] - from[1]) * share, from[2] + (to[2] - from[2]) * share];

function clad(into: Painted, random: () => number, from: V3, to: V3, lengths: number, wide: number, narrow: number): Painted {
  for (let length = 0; length < lengths; length++) {
    const part: StreetPart = length % 2 === 0 ? "midsummer-leaf" : "midsummer-leaf-lit";
    into.tube(way(from, to, length / lengths), way(from, to, (length + 1.15) / lengths), wide * (0.85 + random() * 0.3), 5, { radiusTo: narrow, shadeFrom: 0.82, shadeTo: 1.08 }, part);
  }
  return into;
}

function ring(into: Painted, random: () => number, centre: V3): Painted {
  const at = (step: number): V3 => {
    const angle = (step / RING_STEPS) * 2 * Math.PI;
    return [centre[0], centre[1] + Math.cos(angle) * RING_RADIUS_M, centre[2] + Math.sin(angle) * RING_RADIUS_M];
  };
  for (let step = 0; step < RING_STEPS; step++) into.tube(at(step), at(step + 1), 0.13 * (0.9 + random() * 0.25), 4, { radiusTo: 0.1, shadeFrom: 0.85, shadeTo: 1.1 }, step % 2 === 0 ? "midsummer-leaf" : "midsummer-leaf-lit");
  return into;
}

function ribbon(into: Painted, [x, y, z]: V3, part: StreetPart, length: number): Painted {
  return into.face([[x - 0.06, y, z], [x + 0.06, y, z], [x + 0.08, y - length, z + 0.02], [x - 0.04, y - length, z + 0.02]], part);
}

/** A small hanging boat with a white sail, the size of a child: its hull a wedge, its sail a triangle. */
function toyBoat(into: Painted, [x, y, z]: V3): Painted {
  const [long, wide, deep] = [0.5, 0.13, 0.15];
  return into
    .face([[x, y, z - long], [x + wide, y, z - long * 0.2], [x + wide * 0.7, y, z + long], [x, y - deep, z + long * 0.7], [x, y - deep, z - long * 0.6]], "hull-under", 0.95)
    .face([[x, y, z - long], [x - wide, y, z - long * 0.2], [x - wide * 0.7, y, z + long], [x, y - deep, z + long * 0.7], [x, y - deep, z - long * 0.6]], "hull-under", 0.95)
    .face([[x, y, z - long * 0.5], [x, y + 0.72, z], [x, y, z + long * 0.5]], "petal-white", 1.05);
}

/** The sun on the mast's top: a gold disc with rays, in two crossed sheets so it reads from any way. */
function sun(into: Painted, [x, y, z]: V3): Painted {
  const rays = 10;
  const [inner, outer] = [0.26, 0.52];
  for (let ray = 0; ray < rays; ray++) {
    const [a, b] = [(ray / rays) * 2 * Math.PI, ((ray + 1) / rays) * 2 * Math.PI];
    const middle = (a + b) / 2;
    into.face([[x, y, z], [x + Math.cos(a) * inner, y + Math.sin(a) * inner, z], [x + Math.cos(middle) * outer, y + Math.sin(middle) * outer, z], [x + Math.cos(b) * inner, y + Math.sin(b) * inner, z]], "pole-gold", 1.05);
  }
  return into;
}

/** Rings, ribbons and boats move in the air; the mast doesn't. */
const hanging: Motion = (part, [x, y]) => {
  if (y >= BAR_M - 0.1 || x === 0 || part.startsWith("midsummer") || part.startsWith("pole")) {
    const onBar = part.startsWith("ribbon") || part === "hull-under" || part === "petal-white";
    return onBar ? { kind: "cloth", metres: 0.05 } : { kind: "still" };
  }
  return { kind: "leaf", metres: 0.14 };
};

export function buildMidsummerPole(seed = 4): RoadsideModel {
  const random = seeded(seed);
  const [bottom, top]: V3[] = [[0, -0.5, 0], [0, MAST_M, 0]];
  const near = new Painted()
    .tube(bottom, [0, 1.6, 0], 0.17, 6, { radiusTo: 0.14, shadeFrom: 0.8, shadeTo: 1 }, "mast-wood")
    .tube([0, MAST_M - 0.05, 0], [0, MAST_M + 0.5, 0], 0.06, 4, { radiusTo: 0.035, cap: true }, "mast-wood");
  clad(near, random, [0, 1.5, 0], top, SHAG_LENGTHS, 0.44, 0.17);
  clad(near, random, [-BAR_HALF_M, BAR_M, 0], [BAR_HALF_M, BAR_M, 0], 6, 0.3, 0.12);
  sun(near, [0, MAST_M + 0.66, 0]);
  for (const side of [-1, 1]) {
    const x = side * BAR_HALF_M * 0.92;
    const [hook, centreY] = [BAR_M - 0.1, BAR_M - RING_DROP_M - RING_RADIUS_M];
    near.beam([x, hook, 0], [x, centreY + RING_RADIUS_M, 0], 0.03, 0.03, "rigging");
    ring(near, random, [x, centreY, 0]);
    ribbon(near, [x, centreY - RING_RADIUS_M, 0.06], "ribbon-red", 0.95);
    ribbon(near, [x - side * 0.5, BAR_M - 0.15, 0.1], "ribbon-blue", 1.2);
    ribbon(near, [x * 0.2, BAR_M - 0.15, -0.1], "ribbon-red", 1.3);
    toyBoat(near, [x * 0.46, BAR_M - 1.25, 0]);
    near.beam([x * 0.46, BAR_M - 0.1, 0], [x * 0.46, BAR_M - 0.55, 0], 0.02, 0.02, "rigging");
  }
  const far = new Painted()
    .tube(bottom, top, 0.34, 3, { radiusTo: 0.2, shadeFrom: 0.95, shadeTo: 1.1 }, "midsummer-leaf")
    .tube([-BAR_HALF_M, BAR_M, 0], [BAR_HALF_M, BAR_M, 0], 0.22, 3, {}, "midsummer-leaf-lit")
    .face([[0, MAST_M + 0.2, -0.0], [0.5, MAST_M + 0.7, 0], [0, MAST_M + 1.2, 0], [-0.5, MAST_M + 0.7, 0]], "pole-gold");
  for (const side of [-1, 1]) {
    const [x, y] = [side * BAR_HALF_M * 0.92, BAR_M - RING_DROP_M - RING_RADIUS_M];
    const [outer, inner] = [RING_RADIUS_M * 1.1, RING_RADIUS_M * 0.82];
    const corners = Array.from({ length: 6 }, (_, step) => (step / 6) * 2 * Math.PI);
    corners.forEach((angle, index) => {
      const next = corners[(index + 1) % 6];
      far.face([[x, y + Math.cos(angle) * outer, Math.sin(angle) * outer], [x, y + Math.cos(next) * outer, Math.sin(next) * outer], [x, y + Math.cos(next) * inner, Math.sin(next) * inner], [x, y + Math.cos(angle) * inner, Math.sin(angle) * inner]], "midsummer-leaf");
    });
  }
  return streetModel(near, far, 140, 800, hanging);
}
