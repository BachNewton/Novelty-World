import { bumper, carNose, grille, headlight, ring, windscreen } from "./kit";
import { OVERLAY, stripesAcross, type FaceRect, type VehicleDesign } from "./parts";

const SIDES = ["left", "right"] as const;

// The dark squares of a checkerboard filling a face rectangle.
function checkerDarks(rect: FaceRect, across: number, up: number): FaceRect[] {
  const [u0, v0, u1, v1] = rect;
  const du = (u1 - u0) / across;
  const dv = (v1 - v0) / up;
  return Array.from({ length: across * up }, (_, i) => ({ a: i % across, b: Math.floor(i / across) }))
    .filter(({ a, b }) => (a + b) % 2 === 0)
    .map(({ a, b }): FaceRect => [u0 + a * du, v0 + b * dv, u0 + (a + 1) * du, v0 + (b + 1) * dv]);
}

export const bigCab: VehicleDesign = {
  name: "Big Cab",
  archetype: "Taxi",
  blurb: "A three-lane taxi whose roof light grew into a whole checkered cell.",
  length: 2,
  body: (cell) => (cell.row === 0 ? "sunflower" : "cream"),
  details: (f) => [
    ...[0, 1, 2].flatMap((col) => [bumper(f, col, 0), windscreen(f, col, 0, [0.08, 0.62, 0.92, 0.9])]),
    headlight(f, 0, 0, "left"),
    headlight(f, 2, 0, "right"),
    grille(f, 1, 0),
    ...f.tyreFronts(),
    // The roof light, checkered on every face.
    ...checkerDarks([0.1, 0.22, 0.9, 0.78], 4, 2).map((rect) => f.front(1, 1, rect, "charcoal")),
    ...SIDES.flatMap((side) =>
      checkerDarks([0.2, 0.22, 1.8, 0.78], 8, 2).map(([z0, v0, z1, v1]) =>
        f.side(1, 1, side, [z0, v0, z1, v1], "charcoal"),
      ),
    ),
    // A checker band down both flanks.
    ...checkerDarks([0, 0.62, 2, 0.82], 10, 1).flatMap(([z0, v0, z1, v1]) => [
      f.side(0, 0, "left", [z0, v0, z1, v1], "charcoal"),
      f.side(2, 0, "right", [z0, v0, z1, v1], "charcoal"),
    ]),
    f.back(0, 0, [0.1, 0.5, 0.35, 0.75], "cherry"),
    f.back(2, 0, [0.65, 0.5, 0.9, 0.75], "cherry"),
    ...f.wheels(),
  ],
};

export const tacoTower: VehicleDesign = {
  name: "Taco Tower",
  archetype: "Food truck",
  blurb: "A tall, skinny taco truck with its striped awning flung open to one side.",
  length: 2,
  body: (cell) => (cell.col === 1 ? "sunflower" : "coral"),
  details: (f) => [
    ...carNose(f, 0, 0),
    ...f.tyreFronts(),
    windscreen(f, 0, 0, [0.1, 0.62, 0.9, 0.9]),
    windscreen(f, 0, 1, [0.1, 0.2, 0.9, 0.86]),
    // The taco sign on top: a shell with lettuce and tomato.
    f.front(0, 2, [0.14, 0.14, 0.86, 0.86], "bun", "round"),
    f.front(0, 2, [0.2, 0.52, 0.8, 0.64], "lime", "flat", OVERLAY),
    f.front(0, 2, [0.3, 0.36, 0.44, 0.5], "cherry", "round", OVERLAY),
    f.front(0, 2, [0.56, 0.36, 0.7, 0.5], "cherry", "round", OVERLAY),
    // The awning, striped on every face.
    ...stripesAcross([0.06, 0.06, 0.94, 0.94], 4)
      .filter((_, i) => i % 2 === 1)
      .map((rect) => f.front(1, 1, rect, "cherry")),
    ...stripesAcross([0.06, 0.1, 0.94, 1.9], 4)
      .filter((_, i) => i % 2 === 1)
      .map((rect) => f.top(1, 1, rect, "cherry")),
    ...stripesAcross([0.1, 0.06, 1.9, 0.94], 6)
      .filter((_, i) => i % 2 === 1)
      .map((rect) => f.side(1, 1, "right", rect, "cherry")),
    // The menu board under the awning, and the serving hatch opposite.
    f.side(0, 0, "right", [0.7, 0.62, 1.8, 0.94], "charcoal"),
    ...[0.68, 0.78, 0.88].map((v) => f.side(0, 0, "right", [0.8, v, 1.6, v + 0.03], "cream", "flat", OVERLAY)),
    f.side(0, 1, "left", [0.25, 0.2, 1.75, 0.85], "glass"),
    ...SIDES.map((side) => f.side(0, 2, side, [0.5, 0.15, 1.5, 0.85], "bun", "round")),
    ...f.wheels(),
  ],
};

export const mowProblemo: VehicleDesign = {
  name: "Mow Problemo",
  archetype: "Ride-on mower",
  blurb: "A little red ride-on mower under an enormous striped sun canopy.",
  length: 2,
  body: (cell) => (cell.row === 0 ? "cherry" : cell.col === 1 ? "snow" : "mint"),
  details: (f) => [
    // The mower: a wide cutter vent and two small lamps.
    f.front(1, 0, [0.14, 0.26, 0.86, 0.5], "charcoal"),
    f.front(1, 0, [0.14, 0.62, 0.34, 0.82], "headlight", "round"),
    f.front(1, 0, [0.66, 0.62, 0.86, 0.82], "headlight", "round"),
    ...f.tyreFronts(),
    // The canopy's scalloped fringe, and a stripe down each panel's top.
    ...[0, 1, 2].flatMap((col) => [
      ...[0.1, 0.41, 0.72].map((u) =>
        f.front(col, 1, [u, 0.03, u + 0.18, 0.21], col === 1 ? "mint" : "snow", "round"),
      ),
      f.top(col, 1, [0.35, 0.1, 0.65, 1.9], col === 1 ? "mint" : "snow"),
    ]),
    f.side(1, 0, "left", [0.9, 0.62, 1.3, 0.94], "snow", "round"),
    f.side(1, 0, "right", [0.9, 0.62, 1.3, 0.94], "snow", "round"),
    // The grass bag on the back.
    f.back(1, 0, [0.14, 0.1, 0.86, 0.8], "lime", "flat", 0.06),
    ...f.wheels(0.25),
  ],
};

export const beachPatrol: VehicleDesign = {
  name: "Beach Patrol",
  archetype: "Lifeguard tower buggy",
  blurb: "A lifeguard tower on wheels, lookout on top and a lifebuoy seat hung off one side.",
  length: 2,
  body: (cell) => (cell.col === 0 ? "coral" : cell.row === 1 ? "snow" : "sky"),
  details: (f) => [
    ...carNose(f, 1, 0),
    ...f.tyreFronts(),
    windscreen(f, 1, 0, [0.1, 0.62, 0.9, 0.9]),
    // A red cross on the white middle, front and sides.
    f.front(1, 1, [0.4, 0.2, 0.6, 0.8], "cherry"),
    f.front(1, 1, [0.2, 0.4, 0.8, 0.6], "cherry", "flat", OVERLAY),
    f.side(1, 1, "right", [0.7, 0.2, 1.3, 0.8], "cherry"),
    f.side(1, 1, "right", [0.4, 0.4, 1.6, 0.6], "cherry", "flat", OVERLAY),
    // The lookout: glass all round.
    f.front(1, 2, [0.1, 0.2, 0.9, 0.8], "glass"),
    ...SIDES.map((side) => f.side(1, 2, side, [0.15, 0.2, 1.85, 0.8], "glass")),
    f.back(1, 2, [0.1, 0.2, 0.9, 0.8], "glass"),
    f.top(1, 2, [0.1, 0.4, 0.9, 1.6], "snow"),
    // The lifebuoy seat.
    ...ring(f, 0, 1, [0.14, 0.14, 0.86, 0.86], "snow", "cherry", 0.5),
    f.side(0, 1, "left", [0.5, 0.15, 1.5, 0.85], "snow", "round"),
    f.side(0, 1, "left", [0.75, 0.4, 1.25, 0.6], "cherry", "round", OVERLAY),
    ...f.wheels(),
  ],
};

export const T_VEHICLES = {
  T0: bigCab,
  T1: tacoTower,
  T2: mowProblemo,
  T3: beachPatrol,
} as const satisfies Record<string, VehicleDesign>;
