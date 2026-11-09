import { SoupBuilder, type Point, type Soup } from "./mesh";

/*
 * One wheel on its axle along x, its face towards +x: a tyre turned from a
 * profile with a sidewall that bulges and a rounded shoulder, a rim with a
 * polished lip and a dished face of spokes in one of a few designs, and behind
 * the spokes a brake disc. The caliper that grips the disc doesn't roll with
 * the wheel, so it is a part of its own (`buildCaliper`), hung where the wheel
 * steers.
 */

/**
 * The rim's design. "blade": single straight spokes. "split": the spokes in pairs. "turbine": many thin spokes
 * swept round, a hypercar's. "mesh": two sets of thin spokes crossing, a classic's. "aero": broad spokes with narrow
 * gaps, nearly a closed disc, an electric car's. "steel": a pressed steel disc in the body's paint, dished, with a ring of
 * small vents and a chrome hubcap over its middle, an old economy car's; `spokes` is how many vents.
 */
export type RimStyle = "blade" | "split" | "turbine" | "mesh" | "aero" | "steel";

export interface WheelSpec {
  radiusM: number;
  widthM: number;
  rimShare: number;
  spokes: number;
  /** Paired spokes read as sportier, single ones as plainer: what `style` is when it isn't given. */
  twinSpokes: boolean;
  style?: RimStyle;
}

interface WheelDetail {
  sides: number;
  spokes: boolean;
  /** Grooves in the tread, the sidewall's bulge, wheel nuts and a brake disc: a hero's. */
  fine: boolean;
}

const ring = (x: number, radius: number, sides: number): Point[] =>
  Array.from({ length: sides }, (_, at) => {
    const angle = (at / sides) * Math.PI * 2;
    return [x, Math.cos(angle) * radius, Math.sin(angle) * radius];
  });

function turned(builder: SoupBuilder, profile: [x: number, radius: number][], sides: number, surface: "tyre" | "rim" | "rimDark" | "paint") {
  const group = builder.newGroup();
  const rows = profile.map(([x, radius]) => ring(x, radius, sides));
  for (let row = 0; row + 1 < rows.length; row++) {
    for (let at = 0; at < sides; at++) {
      const next = (at + 1) % sides;
      builder.quad(rows[row][at], rows[row + 1][at], rows[row + 1][next], rows[row][next], surface, group);
    }
  }
}

/** A spoke from the hub out to the rim: its angle, width and face each move from the hub's end to the rim's, over `steps`. */
interface Spoke {
  angle: readonly [hub: number, rim: number];
  wide: readonly [hub: number, rim: number];
  radius: readonly [hub: number, rim: number];
  face: readonly [hub: number, rim: number];
  depth: number;
  steps: number;
}

function spoke(builder: SoupBuilder, { angle, wide, radius, face, depth, steps }: Spoke) {
  const sections = Array.from({ length: steps + 1 }, (_, step) => {
    const share = step / steps;
    const along = (pair: readonly [number, number]) => pair[0] + (pair[1] - pair[0]) * share;
    const [a, w, r, x] = [along(angle), along(wide), along(radius), along(face)];
    const [c, s] = [Math.cos(a), Math.sin(a)];
    const at = (sideways: number, depthX: number): Point => [depthX, c * r - s * sideways, s * r + c * sideways];
    return [at(-w, x), at(-w, x - depth), at(w, x - depth), at(w, x)];
  });
  builder.rings(sections, "rim");
}

/** The spokes of each design, as `Spoke`s, between the hub and the rim's inner edge, dished: the hub sits further in than the rim. */
function spokesOf(style: RimStyle, count: number, hub: number, rimInner: number, faceX: number): Spoke[] {
  const dish = { radius: [hub, rimInner] as const, face: [faceX - 0.032, faceX - 0.006] as const, depth: 0.03 };
  const around = (n: number) => Array.from({ length: n }, (_, at) => (at / n) * Math.PI * 2);
  switch (style) {
    case "blade":
      return around(count).map((a) => ({ ...dish, angle: [a, a], wide: [0.022, 0.016], steps: 1 }));
    case "split":
      // A pair meets at the hub, so one of it stands a little proud of the other there and no two faces share a plane.
      return around(count).flatMap((a) => [-0.11, 0.11].map((off, side): Spoke => ({ ...dish, face: [dish.face[0] - side * 0.005, dish.face[1] - side * 0.005], angle: [a + off * 0.3, a + off], wide: [0.011, 0.009], steps: 1 })));
    case "turbine":
      return around(count).map((a) => ({ ...dish, angle: [a, a + 0.42], wide: [0.013, 0.009], steps: 3 }));
    case "mesh":
      return around(count).flatMap((a) => [-0.32, 0.32].map((sweep, side): Spoke => ({ ...dish, face: [dish.face[0] - side * 0.006, dish.face[1] - side * 0.006], angle: [a, a + sweep], wide: [0.007, 0.006], steps: 2 })));
    case "aero":
      // Each as broad as it can be beside its neighbours without touching them, from the hub to the rim.
      return around(count).map((a) => ({ ...dish, angle: [a, a + 0.12], wide: [(Math.PI * hub) / count - 0.004, (Math.PI * rimInner) / count - 0.012], steps: 2 }));
    case "steel":
      return [];
  }
}

/**
 * A pressed steel wheel's face: a disc in the body's paint, dished from the rim to a raised ring and down again under a
 * chrome hubcap's dome, with `vents` small dark slots round the dish. Each is turned from the middle out, which faces
 * it out of the wheel.
 */
function steelFace(builder: SoupBuilder, rim: number, faceX: number, vents: number, sides: number, fine: boolean) {
  const disc: [number, number][] = [
    [faceX - 0.05, rim * 0.4],
    [faceX - 0.04, rim * 0.5],
    [faceX - 0.026, rim * 0.6],
    [faceX - 0.03, rim * 0.68],
    [faceX - 0.04, rim * 0.78],
    [faceX - 0.03, rim * 0.9],
    [faceX - 0.016, rim - 0.031],
  ];
  turned(builder, disc, sides, "paint");
  const dome: [number, number][] = [
    [faceX - 0.046, rim * 0.47],
    [faceX - 0.012, rim * 0.46],
    [faceX + 0.008, rim * 0.4],
    [faceX + 0.02, rim * 0.28],
    [faceX + 0.026, rim * 0.14],
  ];
  turned(builder, [...dome].reverse(), sides, "rim");
  builder.rings([ring(faceX + 0.026, rim * 0.14, sides)], "rim");
  if (!fine) return;
  // The vents: short slots across the dish, each standing a few millimetres off the paint where the dish is deepest.
  // The disc's depth at a radius, along the same straight pieces it is turned from.
  const along = (radius: number) => {
    const next = disc.findIndex(([, r]) => r >= radius);
    const [[x0, r0], [x1, r1]] = [disc[next - 1], disc[next]];
    return x0 + ((x1 - x0) * (radius - r0)) / (r1 - r0);
  };
  for (let vent = 0; vent < vents; vent++) {
    const angle = ((vent + 0.5) / vents) * Math.PI * 2;
    const at = (radius: number, sideways: number): Point => {
      const [c, s] = [Math.cos(angle), Math.sin(angle)];
      return [along(radius) + 0.003, c * radius - s * sideways, s * radius + c * sideways];
    };
    const [inner, outer, wide] = [rim * 0.7, rim * 0.86, rim * 0.15];
    const slot = Array.from({ length: 8 }, (_, step) => {
      const turn = (step / 8) * Math.PI * 2;
      return at((inner + outer) / 2 + (Math.cos(turn) * (outer - inner)) / 2, (Math.sin(turn) * wide) / 2);
    });
    builder.rings([slot], "rimDark");
  }
}

export function buildWheel(spec: WheelSpec, detail: WheelDetail): Soup {
  const builder = new SoupBuilder();
  const half = spec.widthM / 2;
  const radius = spec.radiusM;
  const rim = radius * spec.rimShare;
  const wall = radius - rim;
  const { sides } = detail;
  const groove = (at: number): [number, number][] => [
    [half * (at + 0.05), radius],
    [half * (at + 0.04), radius - 0.009],
    [half * (at - 0.04), radius - 0.009],
    [half * (at - 0.05), radius],
  ];
  const shoulders: [number, number][] = detail.fine
    ? [
        // The sidewall bulges past the rim's lip, then rolls over a rounded shoulder into the tread.
        [half * 1.0, rim + wall * 0.18],
        [half * 1.05, rim + wall * 0.45],
        [half * 1.04, rim + wall * 0.7],
        [half * 0.99, rim + wall * 0.86],
        [half * 0.93, radius * 0.978],
        [half * 0.84, radius * 0.996],
        ...groove(0.42),
        ...groove(0),
        ...groove(-0.42),
        [-half * 0.84, radius * 0.996],
        [-half * 0.93, radius * 0.978],
        [-half * 1.03, rim + wall * 0.6],
      ]
    : detail.spokes
    ? [
        [half, radius * 0.9],
        [half * 0.93, radius * 0.975],
        [half * 0.78, radius],
        [-half * 0.78, radius],
        [-half * 0.93, radius * 0.975],
        [-half, radius * 0.9],
      ]
    : [
        [half * 0.9, radius],
        [-half * 0.9, radius],
      ];
  turned(builder, [[half * 0.86, rim + 0.002], ...shoulders, [-half * 0.86, rim]], sides, "tyre");
  const faceX = half * 0.9;
  const rimSides = Math.max(8, Math.round(sides * 0.8));
  if (detail.fine) {
    // The lip, polished, then the barrel inside it, dark.
    turned(
      builder,
      [
        [faceX - 0.06, rim - 0.034],
        [faceX - 0.004, rim - 0.026],
        [faceX + 0.004, rim - 0.012],
        [faceX + 0.002, rim + 0.004],
      ],
      rimSides,
      "rim",
    );
    turned(
      builder,
      [
        [-half * 0.3, rim - 0.036],
        [faceX - 0.06, rim - 0.036],
      ],
      rimSides,
      "rimDark",
    );
  } else {
    turned(
      builder,
      [
        [-half * 0.3, rim - 0.034],
        [faceX - 0.06, rim - 0.034],
        [faceX, rim - 0.018],
        [faceX, rim + 0.004],
      ],
      rimSides,
      "rim",
    );
  }
  // The dark behind the spokes, so they read against it from the road.
  builder.rings([ring(-half * 0.3, rim - 0.03, rimSides)], "rimDark");
  if (detail.spokes && spec.style === "steel") {
    steelFace(builder, rim, faceX, spec.spokes, rimSides, detail.fine);
  } else if (detail.spokes) {
    const hubRadius = radius * 0.13;
    const style = spec.style ?? (spec.twinSpokes ? "split" : "blade");
    for (const one of spokesOf(style, spec.spokes, hubRadius, rim - 0.03, faceX)) spoke(builder, one);
    builder.rings([ring(faceX - 0.026, radius * 0.15, 10), ring(faceX - 0.05, radius * 0.165, 10)], "rim");
    if (detail.fine) {
      // The brake disc behind the spokes, with its dark hat in the middle.
      const discX = faceX - 0.085;
      builder.rings([ring(discX + 0.012, rim - 0.045, 24), ring(discX - 0.012, rim - 0.045, 24)], "disc");
      builder.rings([ring(discX + 0.03, radius * 0.24, 10), ring(discX + 0.004, radius * 0.24, 10)], "rimDark");
      for (let nut = 0; nut < 5; nut++) {
        const angle = (nut / 5) * Math.PI * 2 + 0.3;
        const place = (r: number, a: number, x: number): Point => [x, Math.cos(angle) * radius * 0.1 + Math.cos(a) * r, Math.sin(angle) * radius * 0.1 + Math.sin(a) * r];
        const nutRing = (x: number): Point[] => [0, 1, 2, 3, 4, 5].map((step) => place(0.011, (step / 6) * Math.PI * 2, x));
        builder.rings([nutRing(faceX - 0.034), nutRing(faceX - 0.022)], "rimDark");
      }
    }
  } else if (spec.style === "steel") {
    // Far off, the painted disc and its hubcap.
    builder.rings([ring(faceX - 0.02, rim - 0.03, rimSides)], "paint");
    builder.rings([ring(faceX - 0.008, rim * 0.42, 6)], "rim");
  } else {
    // Far off, a pale disc in the dark rim says a wheel as well as spokes would.
    builder.rings([ring(faceX - 0.02, rim - 0.03, rimSides)], "rimDark");
    builder.rings([ring(faceX - 0.012, radius * 0.3, 6)], "rim");
  }
  return builder.finish(30);
}

/** How far round from the top towards the back the caliper's middle sits, in radians. */
const CALIPER_AT = 0.95;
const CALIPER_SPAN = 0.62;

/**
 * The caliper on the right wheel's disc, in the wheel's frame: it steers with the wheel but doesn't roll, so it hangs
 * on the steering knuckle, towards the back of the disc, between the disc and the spokes.
 */
export function buildCaliper(spec: WheelSpec): Soup {
  const builder = new SoupBuilder();
  const half = spec.widthM / 2;
  const rim = spec.radiusM * spec.rimShare;
  const faceX = half * 0.9;
  const [inner, outer] = [rim - 0.1, rim - 0.035];
  const [front, back] = [faceX - 0.05, faceX - 0.112];
  const steps = 5;
  const sections = Array.from({ length: steps + 1 }, (_, step) => {
    const angle = CALIPER_AT - CALIPER_SPAN / 2 + (CALIPER_SPAN * step) / steps;
    const at = (r: number, x: number): Point => [x, Math.cos(angle) * r, Math.sin(angle) * r];
    // Its ends round off, so it reads as a cast part and not a bar.
    const end = step === 0 || step === steps ? 0.012 : 0;
    return [at(inner + end, back), at(inner + end, front), at(outer - end, front), at(outer - end, back)];
  });
  builder.rings(sections, "caliper");
  return builder.finish(40);
}
