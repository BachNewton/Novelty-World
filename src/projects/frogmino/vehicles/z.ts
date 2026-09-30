import { bumper, carNose, headlight, ring, windscreen } from "./kit";
import { OVERLAY, layers, stripesAcross, type VehicleDesign } from "./parts";

export const breadWinner: VehicleDesign = {
  name: "Bread Winner",
  archetype: "Bakery van",
  blurb: "A blue bakery van hauling one colossal loaf that hangs off the roof to one side.",
  body: (cell) => (cell.row === 0 ? "cobalt" : "bun"),
  details: (f) => [
    bumper(f, 1, 0),
    bumper(f, 2, 0),
    headlight(f, 1, 0, "left"),
    headlight(f, 2, 0, "right"),
    f.front(1, 0, [0.6, 0.34, 0.94, 0.52], "charcoal"),
    f.front(2, 0, [0.06, 0.34, 0.4, 0.52], "charcoal"),
    windscreen(f, 1, 0, [0.08, 0.62, 0.92, 0.9]),
    windscreen(f, 2, 0, [0.08, 0.62, 0.92, 0.9]),
    ...f.tyreFronts(),
    // The loaf's sliced ends show the crumb, and its top is scored.
    ...[0, 1].flatMap((col) => [
      f.front(col, 1, [0.12, 0.08, 0.88, 0.78], "cream"),
      f.front(col, 1, [0.3, 0.4, 0.4, 0.5], "bun", "round", OVERLAY),
      f.front(col, 1, [0.58, 0.24, 0.66, 0.32], "bun", "round", OVERLAY),
      f.back(col, 1, [0.12, 0.08, 0.88, 0.78], "cream"),
      ...[0.25, 0.8, 1.35].map((z) => f.top(col, 1, [0.12, z, 0.88, z + 0.14], "cream")),
    ]),
    // The van's flanks: a cream stripe and the bakery's hatch.
    f.side(1, 0, "left", [0, 0.62, 2, 0.72], "cream"),
    f.side(2, 0, "right", [0, 0.62, 2, 0.72], "cream"),
    f.side(2, 0, "right", [0.75, 0.2, 1.25, 0.56], "glass"),
    f.back(1, 0, [0.1, 0.5, 0.35, 0.75], "cherry"),
    f.back(2, 0, [0.65, 0.5, 0.9, 0.75], "cherry"),
    ...f.wheels(),
  ],
};

export const landGalleon: VehicleDesign = {
  name: "Land Galleon",
  archetype: "Pirate ship on wheels",
  blurb: "A wooden galleon on wheels, stern castle up high and a striped sail on top.",
  body: (cell) => (cell.row === 2 ? "snow" : "cocoa"),
  details: (f) => [
    // The prow is still a road vehicle: lamps, grille and bumper.
    ...carNose(f, 0, 0),
    ...f.tyreFronts(),
    // The ship's wheel above.
    ...ring(f, 0, 1, [0.2, 0.2, 0.8, 0.8], "bun", "cocoa", 0.6),
    // Its spokes cross over the hub, a layer above it.
    f.front(0, 1, [0.47, 0.12, 0.53, 0.88], "bun", "flat", layers(3)),
    f.front(0, 1, [0.12, 0.47, 0.88, 0.53], "bun", "flat", layers(3)),
    // Cannon ports in the stern castle.
    f.front(1, 1, [0.18, 0.3, 0.42, 0.54], "charcoal", "round"),
    f.front(1, 1, [0.58, 0.3, 0.82, 0.54], "charcoal", "round"),
    f.front(1, 1, [0.06, 0.76, 0.94, 0.86], "bun"),
    // The sail, with a red band.
    f.front(1, 2, [0.06, 0.4, 0.94, 0.6], "cherry"),
    f.side(1, 2, "left", [0.2, 0.4, 2.8, 0.6], "cherry"),
    f.side(1, 2, "right", [0.2, 0.4, 2.8, 0.6], "cherry"),
    // Planking lines down the hull.
    ...[0.66, 0.36].flatMap((v) => [
      f.side(0, 1, "left", [0, v, 3, v + 0.04], "bun"),
      f.side(1, 1, "right", [0, v, 3, v + 0.04], "bun"),
    ]),
    f.side(0, 0, "left", [0, 0.66, 3, 0.7], "bun"),
    ...stripesAcross([0.4, 0.3, 2.6, 0.54], 5)
      .filter((_, i) => i % 2 === 0)
      .map((rect) => f.side(1, 1, "right", rect, "charcoal", "flat", OVERLAY)),
    f.back(1, 1, [0.15, 0.3, 0.85, 0.7], "glass"),
    f.back(1, 2, [0.35, 0.1, 0.65, 0.3], "headlight", "round"),
    ...f.wheels(),
  ],
};

export const Z_VEHICLES = { Z0: breadWinner, Z1: landGalleon } as const satisfies Record<string, VehicleDesign>;
