import { bumper, carNose, grille, headlight, headlights, ring, windscreen } from "./kit";
import { OVERLAY, layers, stripesAcross, type VehicleDesign } from "./parts";

const SIDES = ["left", "right"] as const;

export const trashPanda: VehicleDesign = {
  name: "Trash Panda",
  archetype: "Garbage truck",
  blurb: "A mint garbage truck whose raised bin has a raccoon's masked face and ringed tail.",
  body: (cell) => (cell.row === 1 ? "grape" : "mint"),
  details: (f) => [
    ...[0, 1, 2].map((col) => bumper(f, col, 0)),
    windscreen(f, 0, 0, [0.08, 0.62, 0.92, 0.9]),
    windscreen(f, 1, 0, [0.08, 0.62, 0.92, 0.9]),
    headlight(f, 0, 0, "left"),
    grille(f, 1, 0),
    headlight(f, 2, 0, "right"),
    ...f.tyreFronts(),
    // The raccoon on the bin: ears, mask, eyes, muzzle and nose.
    f.front(2, 1, [0.08, 0.8, 0.28, 0.94], "charcoal"),
    f.front(2, 1, [0.72, 0.8, 0.92, 0.94], "charcoal"),
    f.front(2, 1, [0.08, 0.44, 0.92, 0.7], "charcoal"),
    f.front(2, 1, [0.2, 0.48, 0.4, 0.66], "snow", "round", OVERLAY),
    f.front(2, 1, [0.6, 0.48, 0.8, 0.66], "snow", "round", OVERLAY),
    f.front(2, 1, [0.26, 0.53, 0.34, 0.61], "charcoal", "round", layers(3)),
    f.front(2, 1, [0.66, 0.53, 0.74, 0.61], "charcoal", "round", layers(3)),
    f.front(2, 1, [0.3, 0.1, 0.7, 0.4], "snow", "round"),
    f.front(2, 1, [0.42, 0.22, 0.58, 0.34], "charcoal", "round", OVERLAY),
    // Its ringed tail runs down both sides of the bin.
    ...SIDES.flatMap((side) =>
      stripesAcross([0.1, 0.06, 2.9, 0.94], 7)
        .filter((_, i) => i % 2 === 1)
        .map((rect) => f.side(2, 1, side, rect, "charcoal")),
    ),
    f.side(0, 0, "left", [0.1, 0.6, 0.9, 0.92], "glass"),
    f.side(0, 0, "left", [1.1, 0.62, 2.9, 0.72], "teal"),
    f.side(2, 0, "right", [0.9, 0.62, 2.9, 0.72], "teal"),
    f.top(0, 0, [0.2, 0.3, 0.8, 0.7], "teal"),
    f.top(1, 0, [0.1, 1, 0.9, 2.8], "teal"),
    f.back(1, 0, [0.1, 0.1, 0.9, 0.9], "charcoal"),
    f.back(0, 0, [0.1, 0.5, 0.35, 0.75], "cherry"),
    f.back(2, 0, [0.65, 0.5, 0.9, 0.75], "cherry"),
    ...f.wheels(),
  ],
};

export const tallLatte: VehicleDesign = {
  name: "Tall Latte",
  archetype: "Coffee cart",
  blurb: "A three-storey takeaway cup with a sleeve, a lid and latte art, pushed along by a tiny scooter cab.",
  body: (cell) => (cell.col === 1 ? "sky" : cell.row === 1 ? "cocoa" : "cream"),
  details: (f) => [
    bumper(f, 0, 0),
    ...headlights(f, 0, 0),
    // The sleeve's logo: a coffee bean on a white disc.
    f.front(0, 1, [0.22, 0.22, 0.78, 0.78], "snow", "round"),
    f.front(0, 1, [0.4, 0.3, 0.6, 0.7], "cocoa", "round", OVERLAY),
    f.side(0, 1, "right", [0.72, 0.22, 1.28, 0.78], "snow", "round"),
    f.side(0, 1, "right", [0.9, 0.3, 1.1, 0.7], "cocoa", "round", OVERLAY),
    // A handle, drawn flat on the cup's side.
    f.side(0, 1, "left", [0.55, 0.15, 1.45, 0.85], "cream", "round"),
    f.side(0, 1, "left", [0.75, 0.35, 1.25, 0.65], "cocoa", "round", OVERLAY),
    // The lid, and a latte-art heart on the foam.
    f.front(0, 2, [0.06, 0.74, 0.94, 0.9], "chrome"),
    ...SIDES.map((side) => f.side(0, 2, side, [0.06, 0.74, 1.94, 0.9], "chrome")),
    f.top(0, 2, [0.28, 0.72, 0.5, 0.94], "cocoa"),
    f.top(0, 2, [0.5, 0.72, 0.72, 0.94], "cocoa"),
    f.top(0, 2, [0.38, 0.94, 0.62, 1.16], "cocoa"),
    f.top(0, 2, [0.45, 1.16, 0.55, 1.26], "cocoa"),
    // The scooter cab.
    bumper(f, 1, 0),
    windscreen(f, 1, 0, [0.12, 0.6, 0.88, 0.9]),
    f.front(1, 0, [0.38, 0.32, 0.62, 0.52], "headlight", "round"),
    ...f.tyreFronts(),
    ...f.wheels(),
  ],
};

// The three little cars riding the carrier's deck, as the frog sees them.
const DECK_CARS = [0, 1, 2];

export const deckHand: VehicleDesign = {
  name: "Deck Hand",
  archetype: "Car carrier",
  blurb: "A blue cab on one lane hauling a top deck of three little cars that overhangs the other two.",
  body: (cell) => (cell.row === 0 ? "cobalt" : (["cherry", "lime", "sunflower"] as const)[cell.col]),
  details: (f) => [
    ...carNose(f, 0, 0),
    windscreen(f, 0, 0, [0.1, 0.62, 0.9, 0.9]),
    ...f.tyreFronts(),
    ...SIDES.map((side) => f.side(0, 0, side, [0.1, 0.6, 0.9, 0.92], "glass")),
    // Each little car's face, sunroof and flank.
    ...DECK_CARS.flatMap((col) => [
      f.front(col, 1, [0.1, 0.08, 0.9, 0.16], "chrome"),
      f.front(col, 1, [0.12, 0.24, 0.3, 0.42], "headlight", "round"),
      f.front(col, 1, [0.7, 0.24, 0.88, 0.42], "headlight", "round"),
      f.front(col, 1, [0.16, 0.56, 0.84, 0.86], "glass"),
      f.top(col, 1, [0.2, 0.5, 0.8, 1.3], "glass"),
    ]),
    ...(
      [
        [0, "left"],
        [2, "right"],
      ] as const
    ).flatMap(([col, side]) => [
      f.side(col, 1, side, [0.4, 0.52, 2.6, 0.86], "glass"),
      f.side(col, 1, side, [0.25, 0.04, 0.65, 0.44], "charcoal", "round"),
      f.side(col, 1, side, [2.35, 0.04, 2.75, 0.44], "charcoal", "round"),
    ]),
    // The deck's rails underneath.
    ...[1, 2].flatMap((col) => [
      f.under(col, 1, [0.1, 0.1, 0.25, 2.9], "chrome"),
      f.under(col, 1, [0.75, 0.1, 0.9, 2.9], "chrome"),
    ]),
    ...f.wheels(),
  ],
};

export const cherryOnTop: VehicleDesign = {
  name: "Cherry on Top",
  archetype: "Cherry picker",
  blurb: "A sky-blue utility truck whose boom holds a cherry-red bucket out over the next lane.",
  body: (cell) => (cell.col === 0 ? "cherry" : "sky"),
  details: (f) => [
    ...carNose(f, 1, 0),
    windscreen(f, 1, 0, [0.1, 0.62, 0.9, 0.9]),
    ...f.tyreFronts(),
    // The boom, climbing to a pivot.
    ...(
      [
        [0.06, 0.3, "charcoal"],
        [0.3, 0.38, "sunflower"],
        [0.38, 0.62, "charcoal"],
        [0.62, 0.7, "sunflower"],
        [0.7, 0.94, "charcoal"],
      ] as const
    ).map(([v0, v1, paint]) => f.front(1, 1, [0.4, v0, 0.6, v1], paint)),
    f.front(1, 2, [0.4, 0.06, 0.6, 0.42], "charcoal"),
    ...ring(f, 1, 2, [0.3, 0.42, 0.7, 0.82], "chrome", "charcoal", 0.4),
    ...SIDES.map((side) => f.side(1, 1, side, [0.8, 0.06, 1.2, 0.94], "charcoal")),
    // The bucket: a white rim and a pair of cherries.
    f.front(0, 2, [0.06, 0.8, 0.94, 0.92], "snow"),
    f.side(0, 2, "left", [0.06, 0.8, 1.94, 0.92], "snow"),
    f.front(0, 2, [0.16, 0.06, 0.84, 0.74], "snow", "round"),
    f.front(0, 2, [0.24, 0.14, 0.48, 0.38], "cherry", "round", OVERLAY),
    f.front(0, 2, [0.52, 0.14, 0.76, 0.38], "cherry", "round", OVERLAY),
    f.front(0, 2, [0.34, 0.38, 0.38, 0.62], "lime", "flat", OVERLAY),
    f.front(0, 2, [0.62, 0.38, 0.66, 0.62], "lime", "flat", OVERLAY),
    f.front(0, 2, [0.34, 0.58, 0.66, 0.62], "lime", "flat", layers(3)),
    f.back(1, 0, [0.1, 0.5, 0.3, 0.7], "cherry"),
    f.back(1, 0, [0.7, 0.5, 0.9, 0.7], "cherry"),
    ...f.wheels(),
  ],
};

export const L_VEHICLES = {
  L0: trashPanda,
  L1: tallLatte,
  L2: deckHand,
  L3: cherryOnTop,
} as const satisfies Record<string, VehicleDesign>;
