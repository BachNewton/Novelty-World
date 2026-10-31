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
  const shoulders: [number, number][] = detail.spokes
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
  } else {
    // Far off, a pale disc in the dark rim says a wheel as well as spokes would.
    builder.rings([ring(faceX - 0.02, rim - 0.03, rimSides)], "rimDark");
    builder.rings([ring(faceX - 0.012, radius * 0.3, 6)], "rim");
  }
  return builder.finish(30);
}
