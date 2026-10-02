import { bumper, carNose, headlights, ring, sidePorthole, windscreen } from "./kit";
import { OVERLAY, stripesAcross, windowsAlong, type VehicleDesign } from "./parts";

const SIDES = ["left", "right"] as const;

export const tractorFactor: VehicleDesign = {
  name: "Tractor Factor",
  archetype: "Farm tractor",
  blurb: "A purple farm tractor, glass cab perched over one giant muddy back wheel.",
  body: (cell) => (cell.row === 1 ? "cream" : "grape"),
  details: (f) => [
    // The glass cab, with a beacon on its roof.
    f.front(0, 1, [0.12, 0.1, 0.88, 0.88], "glass"),
    ...SIDES.map((side) => f.side(0, 1, side, [0.12, 0.1, 1.88, 0.88], "glass")),
    f.back(0, 1, [0.12, 0.1, 0.88, 0.88], "glass"),
    f.top(0, 1, [0.35, 0.8, 0.65, 1.2], "sunflower"),
    // The giant back wheel's tread, seen head-on.
    f.front(0, 0, [0.04, 0, 0.34, 0.88], "charcoal"),
    ...f.wheel(0, "left", 1.04, 0.46),
    ...f.wheel(2, "right", 0.1, 0.25),
    // A round lamp, then the chrome grille on the nose.
    f.front(1, 0, [0.3, 0.3, 0.7, 0.7], "headlight", "round"),
    f.front(2, 0, [0.14, 0.28, 0.86, 0.86], "chrome"),
    ...[0.4, 0.54, 0.68].map((v) => f.front(2, 0, [0.2, v, 0.8, v + 0.07], "charcoal", "flat", OVERLAY)),
    // A cream stripe down the hood, the exhaust's mouth, and mud.
    f.top(1, 0, [0.4, 0.1, 0.6, 1.9], "cream"),
    f.top(2, 0, [0.4, 0.1, 0.6, 1.9], "cream"),
    f.top(2, 0, [0.66, 0.3, 0.86, 0.5], "charcoal"),
    f.side(2, 0, "right", [1.0, 0.3, 1.35, 0.5], "cocoa"),
    f.side(2, 0, "right", [1.5, 0.6, 1.7, 0.72], "cocoa"),
    f.side(0, 0, "left", [0.2, 0.62, 0.55, 0.82], "cocoa"),
    f.back(0, 0, [0.35, 0.1, 0.65, 0.3], "charcoal"),
  ],
};

export const clawDaddy: VehicleDesign = {
  name: "Claw Daddy",
  archetype: "Crane truck",
  blurb: "A lime crane truck with a hazard-striped jib and an arcade claw dangling off the end.",
  body: (cell) => (cell.row === 2 ? "sunflower" : "lime"),
  details: (f) => [
    ...carNose(f, 0, 0),
    windscreen(f, 0, 1, [0.1, 0.2, 0.9, 0.86]),
    ...SIDES.flatMap((side) => windowsAlong(3, 0.3, 0.86).map((rect) => f.side(0, 1, side, rect, "glass"))),
    // The operator's window, under hazard stripes.
    f.front(0, 2, [0.15, 0.12, 0.85, 0.5], "glass"),
    ...[0, 1].flatMap((col) =>
      stripesAcross([0.06, 0.6, 0.94, 0.92], 5)
        .filter((_, i) => i % 2 === 0)
        .map((rect) => f.front(col, 2, rect, "charcoal")),
    ),
    // The claw, hanging from its cable at the tip of the jib.
    f.front(1, 2, [0.46, 0.24, 0.54, 0.56], "chrome"),
    f.front(1, 2, [0.34, 0.16, 0.66, 0.26], "chrome"),
    f.front(1, 2, [0.28, 0.06, 0.38, 0.18], "chrome"),
    f.front(1, 2, [0.62, 0.06, 0.72, 0.18], "chrome"),
    f.under(1, 2, [0.42, 0.1, 0.58, 2.9], "chrome"),
    ...stripesAcross([0.1, 0.1, 2.9, 0.9], 7)
      .filter((_, i) => i % 2 === 1)
      .flatMap((rect) => [f.side(1, 2, "right", rect, "charcoal"), f.side(0, 2, "left", rect, "charcoal")]),
    f.back(0, 2, [0.1, 0.1, 0.9, 0.9], "charcoal"),
    f.back(0, 0, [0.1, 0.5, 0.3, 0.7], "cherry"),
    f.back(0, 0, [0.7, 0.5, 0.9, 0.7], "cherry"),
    ...f.wheels(0.28),
  ],
};

// Mustard dashes zigzagging along a strip: [left, bottom, right, top].
const MUSTARD: readonly (readonly [number, number, number, number])[] = [
  [0.1, 0.46, 0.34, 0.54],
  [0.38, 0.54, 0.62, 0.62],
  [0.66, 0.46, 0.9, 0.54],
];

export const topDog: VehicleDesign = {
  name: "Top Dog",
  archetype: "Hot-dog cart",
  blurb: "A tiny sky-blue cart carrying a three-lane hot dog, mustard and all, high over the road.",
  body: (cell) => (cell.row === 1 ? "bun" : "sky"),
  details: (f) => [
    // The sausage peeks out along the bun's front and top, with mustard.
    ...[0, 1, 2].flatMap((col) => [
      f.front(col, 1, [0.06, 0.36, 0.94, 0.7], "coral"),
      ...MUSTARD.map((rect) => f.front(col, 1, rect, "sunflower", "flat", OVERLAY)),
      f.top(col, 1, [0.06, 0.4, 0.94, 1.6], "coral"),
      ...MUSTARD.map(([u0, v0, u1, v1]) => f.top(col, 1, [u0, v0 + 0.4, u1, v1 + 0.4], "sunflower", OVERLAY)),
    ]),
    f.side(0, 1, "left", [0.4, 0.36, 1.6, 0.7], "coral", "round"),
    f.side(2, 1, "right", [0.4, 0.36, 1.6, 0.7], "coral", "round"),
    // The cart underneath.
    bumper(f, 2, 0),
    ...headlights(f, 2, 0),
    windscreen(f, 2, 0, [0.2, 0.62, 0.8, 0.9]),
    ...stripesAcross([0.1, 0.62, 1.9, 0.92], 6)
      .filter((_, i) => i % 2 === 0)
      .map((rect) => f.side(2, 0, "left", rect, "snow")),
    f.back(2, 0, [0.1, 0.5, 0.3, 0.7], "cherry"),
    f.back(2, 0, [0.7, 0.5, 0.9, 0.7], "cherry"),
    ...f.wheels(),
  ],
};

export const moonHauler: VehicleDesign = {
  name: "Moon Hauler",
  archetype: "Rocket transporter",
  blurb: "A grape-purple truck with a whole rocket standing upright on its bed, nose cone and all.",
  body: (cell) => (cell.col === 0 ? "grape" : cell.row === 2 ? "cherry" : "snow"),
  details: (f) => [
    ...carNose(f, 0, 0),
    windscreen(f, 0, 0, [0.1, 0.62, 0.9, 0.9]),
    f.side(0, 0, "left", [0.8, 0.6, 1.8, 0.92], "glass"),
    // The rocket: fins, a porthole, a banded nose cone with a beacon.
    f.front(1, 0, [0.06, 0.26, 0.28, 0.74], "cherry"),
    f.front(1, 0, [0.72, 0.26, 0.94, 0.74], "cherry"),
    f.front(1, 0, [0.36, 0.3, 0.64, 0.7], "chrome", "round"),
    ...ring(f, 1, 1, [0.2, 0.2, 0.8, 0.8], "chrome", "glass", 0.7),
    ...SIDES.flatMap((side) => sidePorthole(f, 1, 1, side, 0.78)),
    f.side(1, 0, "right", [0.9, 0.6, 1.8, 0.94], "cherry"),
    f.front(1, 2, [0.06, 0.08, 0.94, 0.22], "snow"),
    f.front(1, 2, [0.38, 0.5, 0.62, 0.74], "headlight", "round"),
    ...SIDES.map((side) => f.side(1, 2, side, [0.08, 0.08, 1.92, 0.22], "snow")),
    // Flames out of the back.
    f.back(1, 0, [0.2, 0.05, 0.8, 0.7], "tangerine", "round"),
    f.back(1, 0, [0.33, 0.15, 0.67, 0.5], "sunflower", "round", OVERLAY),
    ...f.wheels(),
  ],
};

export const J_VEHICLES = {
  J0: tractorFactor,
  J1: clawDaddy,
  J2: topDog,
  J3: moonHauler,
} as const satisfies Record<string, VehicleDesign>;
