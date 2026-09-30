import { bumper, headlight } from "./kit";
import { stripesAcross, type Paint, type VehicleDesign } from "./parts";

// Sprinkles scattered over the roof: [col, across, back from the front, paint].
const SPRINKLES: readonly [col: number, u: number, z: number, paint: Paint][] = [
  [0, 0.15, 0.2, "cherry"],
  [0, 0.55, 0.45, "sky"],
  [0, 0.3, 0.8, "sunflower"],
  [0, 0.7, 1.1, "lime"],
  [0, 0.2, 1.4, "grape"],
  [0, 0.6, 1.7, "cherry"],
  [1, 0.25, 0.25, "lime"],
  [1, 0.65, 0.6, "grape"],
  [1, 0.15, 0.95, "sky"],
  [1, 0.55, 1.25, "sunflower"],
  [1, 0.3, 1.6, "cherry"],
];

export const mrSprinkles: VehicleDesign = {
  name: "Mr. Sprinkles",
  archetype: "Ice-cream van",
  blurb: "A square pink-and-cream ice-cream van with sprinkles on the roof and a scoop on the side.",
  length: 2,
  body: (cell) => (cell.row === 0 ? "bubblegum" : "cream"),
  details: (f) => [
    bumper(f, 0, 0),
    bumper(f, 1, 0),
    headlight(f, 0, 0, "left"),
    headlight(f, 1, 0, "right"),
    // One grille split by the seam between the two cells.
    f.front(0, 0, [0.6, 0.34, 0.94, 0.52], "charcoal"),
    f.front(1, 0, [0.06, 0.34, 0.4, 0.52], "charcoal"),
    ...f.tyreFronts(),
    f.front(0, 1, [0.08, 0.2, 0.92, 0.86], "glass"),
    f.front(1, 1, [0.08, 0.2, 0.92, 0.86], "glass"),
    ...SPRINKLES.map(([col, u, z, paint]) => f.top(col, 1, [u, z, u + 0.16, z + 0.06], paint)),
    // The serving hatch, under a striped awning.
    f.side(1, 1, "right", [0.3, 0.15, 1.7, 0.72], "glass"),
    ...stripesAcross([0.3, 0.78, 1.7, 0.94], 7).map(([z0, v0, z1, v1], i) =>
      f.side(1, 1, "right", [z0, v0, z1, v1], i % 2 === 0 ? "bubblegum" : "snow"),
    ),
    // A giant scoop on a cone, painted down the other side.
    f.side(0, 1, "left", [0.6, 0.12, 1.4, 0.92], "mint", "round"),
    f.side(0, 0, "left", [0.82, 0.62, 1.18, 1], "bun"),
    f.back(0, 1, [0.12, 0.3, 0.88, 0.85], "glass"),
    f.back(1, 1, [0.12, 0.3, 0.88, 0.85], "glass"),
    ...f.wheels(),
  ],
};

export const O_VEHICLES = { O0: mrSprinkles } as const satisfies Record<string, VehicleDesign>;
