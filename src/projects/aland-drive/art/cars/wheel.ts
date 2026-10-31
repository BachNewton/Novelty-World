import { SoupBuilder, type Point, type Soup } from "./mesh";

/*
 * One wheel on its axle along x, its face towards +x: a tyre turned from a
 * profile, a dished rim and spokes, which are what shows it rolling.
 */

export interface WheelSpec {
  radiusM: number;
  widthM: number;
  rimShare: number;
  spokes: number;
  /** Paired spokes read as sportier, single ones as plainer. */
  twinSpokes: boolean;
}

interface WheelDetail {
  sides: number;
  spokes: boolean;
  /** Grooves in the tread, wheel nuts and a brake disc: a hero's. */
  fine: boolean;
}

const ring = (x: number, radius: number, sides: number): Point[] =>
  Array.from({ length: sides }, (_, at) => {
    const angle = (at / sides) * Math.PI * 2;
    return [x, Math.cos(angle) * radius, Math.sin(angle) * radius];
  });

function turned(builder: SoupBuilder, profile: [x: number, radius: number][], sides: number, surface: "tyre" | "rim") {
  const group = builder.newGroup();
  const rows = profile.map(([x, radius]) => ring(x, radius, sides));
  for (let row = 0; row + 1 < rows.length; row++) {
    for (let at = 0; at < sides; at++) {
      const next = (at + 1) % sides;
      builder.quad(rows[row][at], rows[row + 1][at], rows[row + 1][next], rows[row][next], surface, group);
    }
  }
}

function spoke(builder: SoupBuilder, angle: number, wide: number, hubRadius: number, rimRadius: number, faceX: number) {
  const [c, s] = [Math.cos(angle), Math.sin(angle)];
  const at = (radius: number, sideways: number, x: number): Point => [x, c * radius - s * sideways, s * radius + c * sideways];
  const hubWide = wide * 1.15;
  const rimWide = wide * 0.85;
  const depth = 0.035;
  builder.rings(
    [
      [at(hubRadius, -hubWide, faceX), at(hubRadius, -hubWide, faceX - depth), at(hubRadius, hubWide, faceX - depth), at(hubRadius, hubWide, faceX)],
      [at(rimRadius, -rimWide, faceX - 0.012), at(rimRadius, -rimWide, faceX - depth - 0.012), at(rimRadius, rimWide, faceX - depth - 0.012), at(rimRadius, rimWide, faceX - 0.012)],
    ],
    "rim",
  );
}

export function buildWheel(spec: WheelSpec, detail: WheelDetail): Soup {
  const builder = new SoupBuilder();
  const half = spec.widthM / 2;
  const radius = spec.radiusM;
  const rim = radius * spec.rimShare;
  const { sides } = detail;
  const groove = (at: number): [number, number][] => [
    [half * (at + 0.05), radius],
    [half * (at + 0.04), radius - 0.009],
    [half * (at - 0.04), radius - 0.009],
    [half * (at - 0.05), radius],
  ];
  const shoulders: [number, number][] = detail.fine
    ? [
        [half * 1.02, rim + (radius - rim) * 0.5],
        [half, radius * 0.9],
        [half * 0.96, radius * 0.95],
        [half * 0.9, radius * 0.985],
        [half * 0.8, radius],
        ...groove(0.42),
        ...groove(0),
        ...groove(-0.42),
        [-half * 0.8, radius],
        [-half * 0.93, radius * 0.975],
        [-half, radius * 0.9],
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
  // The dark behind the spokes, so they read against it from the road.
  builder.rings([ring(-half * 0.3, rim - 0.03, rimSides)], "rimDark");
  if (detail.spokes) {
    const hubRadius = radius * 0.13;
    const rimRadius = rim - 0.026;
    for (let at = 0; at < spec.spokes; at++) {
      const angle = (at / spec.spokes) * Math.PI * 2;
      if (spec.twinSpokes) {
        spoke(builder, angle - 0.1, 0.009, hubRadius, rimRadius, faceX - 0.018);
        spoke(builder, angle + 0.1, 0.009, hubRadius, rimRadius, faceX - 0.018);
      } else {
        spoke(builder, angle, 0.017, hubRadius, rimRadius, faceX - 0.018);
      }
    }
    builder.rings([ring(faceX - 0.012, radius * 0.16, 8), ring(faceX - 0.04, radius * 0.17, 8)], "rim");
    if (detail.fine) {
      builder.rings([ring(-half * 0.1, rim - 0.06, 20), ring(-half * 0.1 - 0.02, rim - 0.06, 20)], "disc");
      for (let nut = 0; nut < 5; nut++) {
        const angle = (nut / 5) * Math.PI * 2 + 0.3;
        const place = (r: number, a: number, x: number): Point => [x, Math.cos(angle) * radius * 0.1 + Math.cos(a) * r, Math.sin(angle) * radius * 0.1 + Math.sin(a) * r];
        const nutRing = (x: number): Point[] => [0, 1, 2, 3, 4, 5].map((step) => place(0.011, (step / 6) * Math.PI * 2, x));
        builder.rings([nutRing(faceX - 0.01), nutRing(faceX - 0.002)], "rimDark");
      }
    }
  } else {
    // Far off, a pale disc in the dark rim says a wheel as well as spokes would.
    builder.rings([ring(faceX - 0.02, rim - 0.03, rimSides)], "rimDark");
    builder.rings([ring(faceX - 0.012, radius * 0.3, 6)], "rim");
  }
  return builder.finish(30);
}
