import { carNose } from "./kit";
import { layers, stripesAcross, windowsAlong, type VehicleDesign } from "./parts";

const LANES = [0, 1, 2, 3];
const SIDES = ["left", "right"] as const;

export const plowzilla: VehicleDesign = {
  name: "Plowzilla",
  archetype: "Snowplough",
  blurb: "A snowplough so wide it clears all four lanes at once, hazard-striped blade first.",
  body: () => "tangerine",
  details: (f) => [
    // The blade runs the whole width, a thick plate of hazard stripes that
    // step across the cells' seams.
    ...LANES.flatMap((col) =>
      stripesAcross([0.06, 0.08, 0.94, 0.58], 4).map((rect, i) =>
        f.front(col, 0, rect, i % 2 === 0 ? "sunflower" : "charcoal", "flat", layers(3)),
      ),
    ),
    // Big lamps on the outer cells, the driver's windscreen in the middle two.
    f.front(0, 0, [0.3, 0.64, 0.7, 0.94], "headlight", "round"),
    f.front(3, 0, [0.3, 0.64, 0.7, 0.94], "headlight", "round"),
    f.front(1, 0, [0.1, 0.66, 0.9, 0.92], "glass"),
    f.front(2, 0, [0.1, 0.66, 0.9, 0.92], "glass"),
    // Amber beacons on the roof.
    f.top(1, 0, [0.3, 0.3, 0.7, 0.7], "sunflower"),
    f.top(2, 0, [0.3, 0.3, 0.7, 0.7], "sunflower"),
    f.side(0, 0, "left", [0, 0.62, 2, 0.72], "charcoal"),
    f.side(3, 0, "right", [0, 0.62, 2, 0.72], "charcoal"),
    f.back(0, 0, [0.1, 0.5, 0.35, 0.8], "cherry"),
    f.back(3, 0, [0.65, 0.5, 0.9, 0.8], "cherry"),
    ...f.wheels(0.29),
  ],
};

const DECKS = [1, 2, 3];

export const stackAttack: VehicleDesign = {
  name: "Stack Attack",
  archetype: "Quadruple-decker bus",
  blurb: "A bus with one deck too many: four storeys, one lane wide, a window band per deck.",
  body: () => "cherry",
  details: (f) => [
    ...carNose(f, 0, 0),
    ...f.tyreFronts(),
    f.front(0, 0, [0.1, 0.62, 0.9, 0.9], "glass"),
    // Each deck has its own cream band and windows, so the four storeys count.
    ...DECKS.flatMap((row) => [
      f.front(0, row, [0.06, 0.06, 0.94, 0.18], "cream"),
      f.front(0, row, row === 3 ? [0.1, 0.28, 0.9, 0.62] : [0.1, 0.3, 0.9, 0.86], "glass"),
      f.back(0, row, [0.14, 0.34, 0.86, 0.82], "glass"),
      ...SIDES.flatMap((side) => [
        f.side(0, row, side, [0, 0.08, 3, 0.2], "cream"),
        ...windowsAlong(3, 0.34, 0.86).map((rect) => f.side(0, row, side, rect, "glass")),
      ]),
    ]),
    // The destination sign on the top deck.
    f.front(0, 3, [0.1, 0.7, 0.9, 0.9], "headlight"),
    f.side(0, 0, "left", [0, 0.62, 3, 0.74], "cream"),
    f.side(0, 0, "right", [0.9, 0.3, 1.6, 0.94], "glass"),
    f.top(0, 3, [0.25, 0.9, 0.75, 1.5], "chrome"),
    f.back(0, 0, [0.1, 0.5, 0.3, 0.7], "headlight"),
    f.back(0, 0, [0.7, 0.5, 0.9, 0.7], "headlight"),
    ...f.wheels(0.3),
  ],
};

export const I_VEHICLES = { I0: plowzilla, I1: stackAttack } as const satisfies Record<string, VehicleDesign>;
