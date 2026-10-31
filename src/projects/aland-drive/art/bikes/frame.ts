import type { Point } from "../cars/mesh";
import { add, mix } from "./mat";
import { CRANK_M, type Part } from "./rig";
import { piece, type Piece } from "./shapes";
import { layoutOf, type BikeLayout, type BikeSpec } from "./specs";

/*
 * A bicycle's rigid parts. `frame` and `steer` are drawn where they stand, so
 * the rig's pivots are in the bike's own frame; a wheel, the cranks and the
 * pedals are built round their own centres.
 */

export type Pieces = Partial<Record<Part, Piece>>;

const SIDES = [1, -1] as const;

const wide = ([x, y, z]: Point, out: number): Point => [x + out, y, z];
const gripOn = ({ grip }: BikeLayout, side: number): Point => [side * grip[0], grip[1], grip[2]];

function wheelNear(spec: BikeSpec, isRear: boolean) {
  return piece((p) => {
    const half = spec.tyreM / 2;
    p.hoop({ radius: spec.wheelRadiusM - half, sectionR: half * 1.2, sectionX: half * 1.2, segments: 18, sections: 4, slot: "tyre", phase: Math.PI / 4 });
    const rim = spec.wheelRadiusM - spec.tyreM - 0.008;
    p.hoop({ radius: rim, sectionR: 0.012, sectionX: 0.012, segments: 18, sections: 3, slot: "metal" });
    for (let at = 0; at < spec.spokes; at++) {
      const angle = (at / spec.spokes) * Math.PI * 2;
      const lean = at % 2 === 0 ? 0.32 : -0.32;
      const hubX = at % 2 === 0 ? 0.03 : -0.03;
      p.tube(
        [
          [hubX, Math.cos(angle + lean) * 0.03, Math.sin(angle + lean) * 0.03],
          [0, Math.cos(angle) * rim, Math.sin(angle) * rim],
        ],
        0.0035,
        3,
        "metal",
      );
    }
    p.tube(
      [
        [-0.04, 0, 0],
        [0.04, 0, 0],
      ],
      0.022,
      6,
      "dark",
    );
    if (isRear) {
      p.tube(
        [
          [0.03, 0, 0],
          [0.052, 0, 0],
        ],
        [0.06, 0.035],
        6,
        "metal",
      );
    }
  });
}

function barPath({ bar, barHalfM }: BikeSpec, l: BikeLayout, side: number): Point[] {
  const out = (x: number, y: number, z: number): Point => add(l.barCentre, [side * x, y, z]);
  if (bar === "upright") return [l.barCentre, out(0.06, 0.002, 0), out(0.15, 0.03, 0.015), out(barHalfM - 0.03, 0.055, 0.08), gripOn(l, side), out(barHalfM + 0.005, 0.06, 0.2)];
  if (bar === "flat") return [l.barCentre, out(0.04, 0, 0), out(0.12, 0.012, 0.005), out(barHalfM + 0.02, 0.016, 0.035)];
  return [l.barCentre, out(barHalfM - 0.05, 0, 0), out(barHalfM - 0.005, 0.002, -0.05), out(barHalfM, -0.03, -0.105), out(barHalfM + 0.005, -0.1, -0.095), out(barHalfM + 0.01, -0.145, -0.03), out(barHalfM + 0.01, -0.13, 0.03)];
}

function basket(p: Piece, l: BikeLayout) {
  const floor = add(l.headTop, [0, 0.085, -0.17]);
  const [halfX, halfZ] = [0.17, 0.12];
  const top = add(floor, [0, 0.17, 0]);
  p.box(add(floor, [0, -0.015, 0]), [halfX, 0.012, halfZ], "basket");
  const corner = (x: number, z: number, level: number) => add(mix(floor, top, level), [x * (halfX + 0.02 * level), 0, z * (halfZ + 0.02 * level)]);
  const corners = [
    [1, 1],
    [-1, 1],
    [-1, -1],
    [1, -1],
  ] as const;
  for (const [x, z] of corners) p.tube([corner(x, z, 0), corner(x, z, 1)], 0.009, 3, "basket");
  for (const level of [0.55, 1]) {
    p.tube([...corners.map(([x, z]) => corner(x, z, level)), corner(1, 1, level)], 0.009, 3, "basket");
  }
  p.tube([add(floor, [0, -0.03, 0.12]), add(l.headTop, [0, 0.06, -0.02])], 0.008, 4, "metal");
}

function steerNear(spec: BikeSpec, l: BikeLayout) {
  return piece((p) => {
    const crown = add(l.headBottom, [0, -0.03, 0.01]);
    p.tube([crown, l.headBottom], 0.022, 6, "frame");
    for (const side of SIDES) {
      const top = wide(crown, side * 0.05);
      const low = mix(top, wide(l.frontAxle, side * 0.055), 0.65);
      p.tube([crown, top, add(low, [0, 0, -0.012]), wide(l.frontAxle, side * 0.055)], [0.017, 0.009], 6, "frame");
      p.tube(barPath(spec, l, side), 0.012, 6, "dark");
      const grip = gripOn(l, side);
      if (spec.bar === "upright") p.tube([add(grip, [0, 0, -0.05]), add(grip, [0, 0, 0.07])], 0.0165, 6, "saddle");
      if (spec.bar === "flat") p.tube([add(grip, [-side * 0.05, 0, 0]), add(grip, [side * 0.05, 0, 0])], 0.0165, 6, "dark");
      if (spec.bar === "drop") p.tube([add(grip, [0, -0.015, 0.04]), add(grip, [0, 0.008, -0.03]), add(grip, [0, 0.02, -0.055])], [0.021, 0.015], 6, "dark");
    }
    p.tube([l.headTop, l.stemTop], 0.015, 6, "metal");
    p.tube([l.stemTop, l.barCentre], [0.017, 0.015], 6, spec.bar === "drop" ? "dark" : "metal");
    if (spec.mudguards) p.hoop({ radius: spec.wheelRadiusM + 0.022, sectionR: 0.012, sectionX: spec.tyreM / 2 + 0.012, segments: 7, sections: 3, slot: "frame", centre: l.frontAxle, arc: [-1.7, 0.75] });
    if (spec.lamp) {
      const at = add(l.headBottom, [0, 0.09, -0.05]);
      p.tube([add(at, [0, 0, 0.03]), add(at, [0, 0, -0.03])], [0.028, 0.036], 6, "lamp");
    }
    if (spec.basket) basket(p, l);
  });
}

function saddle(p: Piece, spec: BikeSpec, l: BikeLayout) {
  const [, y, z] = l.saddle;
  const broad = spec.bar === "upright" ? 0.1 : spec.bar === "flat" ? 0.085 : 0.07;
  const stations = [
    [-0.15, 0.024, 0.014],
    [-0.04, broad * 0.45, 0.018],
    [0.05, broad * 0.9, 0.022],
    [0.12, broad, 0.024],
  ] as const;
  p.rings(
    stations.map(([along, half, tall]): Point[] => [
      [half * 0.65, y + tall, z + along],
      [-half * 0.65, y + tall, z + along],
      [-half, y - tall, z + along],
      [half, y - tall, z + along],
    ]),
    "saddle",
  );
}

function drivetrain(p: Piece, spec: BikeSpec, l: BikeLayout) {
  const x = 0.053;
  const chainring = 0.09;
  const sprocket = 0.045;
  const top = (at: Point, r: number) => add(at, [x, r, 0]);
  const low = (at: Point, r: number) => add(at, [x, -r, 0]);
  p.tube([top(l.bb, chainring), top(l.rearAxle, sprocket)], 0.006, 3, "dark");
  p.tube([low(l.bb, chainring), low(l.rearAxle, sprocket)], 0.006, 3, "dark");
  if (spec.chainguard) {
    const out = 0.012;
    p.tube([wide(top(l.bb, chainring + 0.02), out), wide(top(l.rearAxle, sprocket + 0.025), out)], 0.022, 4, "frame", 0.35);
    p.hoop({ radius: chainring + 0.02, sectionR: 0.02, sectionX: 0.01, segments: 6, sections: 3, slot: "frame", centre: wide(l.bb, x + out), arc: [-2.6, -0.2] });
  }
}

function rack(p: Piece, spec: BikeSpec, l: BikeLayout) {
  const y = spec.wheelRadiusM * 2 + 0.05;
  const nose: Point = [0, y, l.seatTop[2] + 0.02];
  const tail: Point = [0, y, l.rearAxle[2] + 0.2];
  for (const side of SIDES) {
    p.tube([wide(nose, side * 0.06), wide(tail, side * 0.06)], 0.006, 4, "metal");
    p.tube([wide(mix(nose, tail, 0.75), side * 0.065), wide(l.rearAxle, side * 0.075)], 0.006, 4, "metal");
    if (spec.panniers) {
      const bag = wide(add(l.rearAxle, [0, spec.wheelRadiusM * 0.72, 0.03]), side * 0.135);
      p.box(bag, [0.052, 0.14, 0.15], "bag");
      p.box(add(bag, [0, 0.13, 0]), [0.056, 0.03, 0.155], "dark");
      p.box(add(bag, [side * 0.055, -0.03, 0]), [0.008, 0.07, 0.1], "bag");
    }
  }
  p.tube([wide(tail, -0.06), wide(tail, 0.06)], 0.006, 4, "metal");
  if (spec.panniers) p.box(mix(nose, tail, 0.5), [0.075, 0.03, 0.17], "accent");
}

function frameNear(spec: BikeSpec, l: BikeLayout) {
  return piece((p) => {
    const headLow = mix(l.headBottom, l.headTop, 0.15);
    const headHigh = mix(l.headBottom, l.headTop, 0.85);
    p.tube([l.headBottom, l.headTop], 0.024, 6, "frame");
    p.tube([l.bb, l.seatTop], 0.016, 6, "frame");
    p.tube([wide(l.bb, -0.045), wide(l.bb, 0.045)], 0.024, 6, "frame");
    p.tube([l.seatTop, l.saddle], 0.013, 6, "metal");
    if (spec.frame === "step") {
      const foot = mix(l.bb, l.seatTop, 0.08);
      const bow = add(mix(headLow, foot, 0.62), [0, -0.075, 0]);
      p.tube([headLow, mix(headLow, bow, 0.65), bow, foot], 0.02, 6, "frame");
      const middle = mix(l.bb, l.seatTop, 0.42);
      const bowHigh = add(mix(headHigh, middle, 0.55), [0, -0.09, 0]);
      p.tube([headHigh, mix(headHigh, bowHigh, 0.7), bowHigh, middle], 0.015, 6, "frame");
    } else {
      p.tube([headLow, l.bb], 0.02, 6, "frame");
      p.tube([headHigh, mix(l.bb, l.seatTop, 0.96)], 0.016, 6, "frame");
      p.tube([mix(l.bb, l.seatTop, 0.75), mix(l.bb, l.seatTop, 0.8)], 0.019, 6, "accent");
    }
    p.tube([mix(l.bb, l.headBottom, 0.35), mix(l.bb, l.headBottom, 0.5)], 0.0215, 6, "accent");
    for (const side of SIDES) {
      const dropout = wide(l.rearAxle, side * 0.066);
      p.tube([wide(l.bb, side * 0.03), wide(mix(l.bb, l.rearAxle, 0.3), side * 0.045), dropout], [0.012, 0.008], 5, "frame");
      p.tube([wide(mix(l.bb, l.seatTop, 0.94), side * 0.012), dropout], [0.009, 0.007], 5, "frame");
    }
    saddle(p, spec, l);
    drivetrain(p, spec, l);
    if (spec.mudguards) p.hoop({ radius: spec.wheelRadiusM + 0.022, sectionR: 0.012, sectionX: spec.tyreM / 2 + 0.012, segments: 8, sections: 3, slot: "frame", centre: l.rearAxle, arc: [-0.5, 2.1] });
    if (spec.rack) rack(p, spec, l);
    if (spec.bottle) p.tube([add(mix(l.bb, l.headBottom, 0.25), [0, 0.045, 0]), add(mix(l.bb, l.headBottom, 0.47), [0, 0.045, 0])], 0.033, 6, "accent");
    if (spec.lamp) p.box(add(l.rearAxle, [0, spec.wheelRadiusM + 0.03, 0.205]), [0.03, 0.018, 0.008], "bag");
  });
}

function crankNear(spec: BikeSpec) {
  return piece((p) => {
    p.tube(
      [
        [-0.092, 0, 0],
        [0.092, 0, 0],
      ],
      0.014,
      6,
      "metal",
    );
    p.tube(
      [
        [0.05, 0, 0],
        [0.056, 0, 0],
      ],
      spec.bar === "drop" ? 0.095 : 0.08,
      12,
      "dark",
    );
    for (const side of SIDES) {
      p.tube(
        [
          [side * 0.09, 0, 0],
          [side * 0.09, 0, -side * CRANK_M],
        ],
        [0.015, 0.011],
        6,
        "metal",
        0.6,
      );
    }
  });
}

const pedalNear = () =>
  piece((p) => {
    p.box([0, 0, 0], [0.05, 0.009, 0.042], "dark");
  });

export function bikePieces(spec: BikeSpec): Pieces {
  const l = layoutOf(spec);
  return {
    frame: frameNear(spec, l),
    steer: steerNear(spec, l),
    wheelFront: wheelNear(spec, false),
    wheelRear: wheelNear(spec, true),
    crank: crankNear(spec),
    pedalLeft: pedalNear(),
    pedalRight: pedalNear(),
  };
}

const FAR_BAR_M = 0.027;

/** The few bars that still read a hundred metres off, thicker than they are so they survive being a pixel wide. */
export function bikePiecesFar(spec: BikeSpec): Pieces {
  const l = layoutOf(spec);
  const r = FAR_BAR_M;
  const wheel = () =>
    piece((p) => {
      p.hoop({ radius: spec.wheelRadiusM - spec.tyreM, sectionR: Math.max(spec.tyreM, 0.03), sectionX: 0.025, segments: 8, sections: 2, slot: "tyre", phase: 1.2 });
    });
  return {
    wheelFront: wheel(),
    wheelRear: wheel(),
    frame: piece((p) => {
      p.tube([l.bb, l.saddle], r, 3, "frame");
      p.tube([l.headBottom, l.bb], r, 3, "frame");
      p.tube(spec.frame === "step" ? [mix(l.headBottom, l.headTop, 0.7), mix(l.bb, l.seatTop, 0.4)] : [l.headTop, l.seatTop], r, 3, "frame");
      p.tube([l.bb, l.rearAxle], r * 0.7, 3, "frame");
      p.tube([l.seatTop, l.rearAxle], r * 0.7, 3, "frame");
      if (spec.panniers) p.box(add(l.rearAxle, [0, spec.wheelRadiusM * 0.72, 0.03]), [0.19, 0.13, 0.15], "bag");
    }),
    steer: piece((p) => {
      p.tube([l.frontAxle, l.headTop], r, 3, "frame");
      p.tube([l.headTop, l.barCentre], r, 3, "dark");
      p.tube([wide(l.barCentre, l.grip[0]), wide(l.barCentre, -l.grip[0])], r * 0.8, 3, "dark");
      if (spec.basket) p.box(add(l.headTop, [0, 0.16, -0.17]), [0.17, 0.09, 0.12], "basket");
    }),
    crank: piece((p) => {
      p.tube(
        [
          [0, 0, CRANK_M],
          [0, 0, -CRANK_M],
        ],
        0.02,
        3,
        "metal",
      );
    }),
  };
}
