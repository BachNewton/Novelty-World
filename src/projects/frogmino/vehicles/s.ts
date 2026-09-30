import { bumper, carNose, headlight, ring, sidePorthole, windscreen } from "./kit";
import { OVERLAY, windowsAlong, type VehicleDesign } from "./parts";

export const happyCamper: VehicleDesign = {
  name: "Happy Camper",
  archetype: "Camper van",
  blurb: "A peachy camper van whose pop-top pod has slid off sideways, surfboard strapped to the cab.",
  body: (cell) => (cell.row === 0 ? "peach" : "cream"),
  details: (f) => [
    bumper(f, 0, 0),
    bumper(f, 1, 0),
    headlight(f, 0, 0, "left"),
    headlight(f, 1, 0, "right"),
    f.front(0, 0, [0.6, 0.34, 0.94, 0.52], "charcoal"),
    f.front(1, 0, [0.06, 0.34, 0.4, 0.52], "charcoal"),
    windscreen(f, 0, 0, [0.08, 0.62, 0.92, 0.9]),
    windscreen(f, 1, 0, [0.08, 0.62, 0.92, 0.9]),
    ...f.tyreFronts(),
    // The pod: a wood-trim stripe and curtained windows.
    ...[1, 2].flatMap((col) => [
      f.front(col, 1, [0.06, 0.1, 0.94, 0.24], "cocoa"),
      f.front(col, 1, [0.14, 0.38, 0.86, 0.84], "glass"),
      f.front(col, 1, [0.14, 0.38, 0.3, 0.84], "bubblegum", "flat", OVERLAY),
      f.front(col, 1, [0.7, 0.38, 0.86, 0.84], "bubblegum", "flat", OVERLAY),
    ]),
    f.side(1, 1, "left", [0, 0.1, 3, 0.24], "cocoa"),
    f.side(2, 1, "right", [0, 0.1, 3, 0.24], "cocoa"),
    ...windowsAlong(3, 0.4, 0.84).flatMap((rect) => [
      f.side(1, 1, "left", rect, "glass"),
      f.side(2, 1, "right", rect, "glass"),
    ]),
    f.side(0, 0, "left", [0.9, 0.62, 2.1, 0.94], "glass"),
    // A surfboard lying on the cab roof.
    f.top(0, 0, [0.3, 0.2, 0.7, 2.8], "sky", 0.03),
    f.top(0, 0, [0.46, 0.2, 0.54, 2.8], "snow", 0.04),
    f.top(1, 1, [0.3, 1, 0.7, 2], "chrome"),
    f.back(0, 0, [0.1, 0.5, 0.35, 0.75], "cherry"),
    f.back(1, 0, [0.65, 0.5, 0.9, 0.75], "cherry"),
    ...f.wheels(),
  ],
};

export const subStandard: VehicleDesign = {
  name: "Sub Standard",
  archetype: "Road submarine",
  blurb: "A submarine that took a wrong turn onto the road: portholes, rivets, periscope and propeller.",
  body: (cell) => (cell.col === 1 ? "teal" : "sunflower"),
  details: (f) => [
    ...carNose(f, 1, 0),
    ...f.tyreFronts(),
    f.front(1, 0, [0.2, 0.62, 0.8, 0.9], "glass"),
    ...ring(f, 1, 1, [0.18, 0.18, 0.82, 0.82], "chrome", "glass", 0.7),
    ...ring(f, 0, 1, [0.18, 0.18, 0.82, 0.82], "chrome", "glass", 0.7),
    // Rivets in the corners of the portholed cells.
    ...[0, 1].flatMap((col) =>
      [
        [0.06, 0.06],
        [0.84, 0.06],
        [0.06, 0.84],
        [0.84, 0.84],
      ].map(([u, v]) => f.front(col, 1, [u, v, u + 0.1, v + 0.1], "chrome", "round")),
    ),
    // The periscope: a tube up, then an elbow out to its lens.
    f.front(0, 2, [0.56, 0.08, 0.72, 0.8], "charcoal"),
    f.front(0, 2, [0.2, 0.62, 0.72, 0.84], "charcoal", "flat", OVERLAY),
    f.front(0, 2, [0.24, 0.64, 0.42, 0.82], "chrome", "round", 0.05),
    ...[0.3, 1.3, 2.3].flatMap((from) => [
      ...sidePorthole(f, 1, 1, "right", from),
      ...sidePorthole(f, 0, 1, "left", from),
      ...sidePorthole(f, 0, 2, "left", from),
      ...sidePorthole(f, 0, 2, "right", from),
    ]),
    f.side(1, 0, "right", [0, 0.62, 3, 0.74], "sunflower"),
    f.side(1, 0, "left", [0, 0.62, 3, 0.74], "sunflower"),
    // The propeller.
    f.back(1, 0, [0.2, 0.2, 0.8, 0.8], "chrome", "round"),
    f.back(1, 0, [0.44, 0.1, 0.56, 0.9], "charcoal", "flat", OVERLAY),
    f.back(1, 0, [0.1, 0.44, 0.9, 0.56], "charcoal", "flat", OVERLAY),
    ...f.wheels(),
  ],
};

export const S_VEHICLES = { S0: happyCamper, S1: subStandard } as const satisfies Record<string, VehicleDesign>;
