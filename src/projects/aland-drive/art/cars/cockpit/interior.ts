import { buildBareShell, type CarSpec } from "../build";
import { SURFACES, type Point, type Soup } from "../mesh";
import { CockpitBuilder, KIND, axes, normalize, pillow, weldKey, type CockpitSoup, type FaceLook, type Paint, type Uv } from "./builder";
import { cabinShade, cockpitFrame, opennessAt, SKIN_M, type CabinShade, type CockpitFrame } from "./frame";
import { GLYPH_ASPECT, SLOT, SOURCE, cellUv, readoutParam, type Source } from "./atlas";
import type { InteriorStyle } from "./style";

/*
 * A car's cockpit, all of it one mesh in the car's own frame: the inside of the
 * shell's pillars and roof, the dash with its instrument pod, the wheel, the
 * centre stack and console, the seats, the door cards and floor, the mirror and
 * visors, and a rally car's cage. Every number comes from the cabin's frame and
 * the car's interior style, so any car gets one. The faces that turn with the
 * steering are marked to turn in the shader, and the dial faces, readouts and
 * lamps say what they read, so a moving needle or a changing figure costs no
 * extra draw. Each corner carries how open it is to the sky, baked from the
 * cabin's walls and roof.
 */

export interface DialSpec {
  slot: number;
  source: Source;
  /** Where the needle points at nothing, and how far it turns to full scale, anticlockwise, in degrees. */
  startDeg: number;
  sweepDeg: number;
}

export interface CockpitParts {
  frame: CockpitFrame;
  shade: CabinShade;
  soup: CockpitSoup;
  /** How open each vertex is to the sky, 0 to 1. */
  openness: Float32Array;
  /** The shell with nothing inside it, which the cockpit is drawn in. */
  shell: Soup;
  dials: DialSpec[];
  /** What the wheel turns about, in the car's frame. */
  wheel: { pivot: Point; axis: Point };
  /** The driver's eye in the car's frame. */
  eye: Point;
}

const finish = (token: string | null, mirror: number, gloss: number, extra: Partial<Paint> = {}): Paint => ({ token, mirror, gloss, metal: 0, glow: 0, ...extra });

function paintsOf(style: InteriorStyle, seat: string) {
  const { colours } = style;
  return {
    dash: finish(colours.dash, 0.012, 0.16),
    dashTop: finish(colours.dash, 0.004, 0.05, { shade: 0.72 }),
    under: finish(colours.dash, 0, 0.02, { shade: 0.55 }),
    trim: finish(colours.trim, 0.01, 0.14),
    insert: finish(colours.insert, 0.004, 0.06),
    headliner: finish(colours.headliner, 0, 0.02),
    pillar: finish(colours.headliner, 0, 0.03, { shade: 0.86 }),
    carpet: finish("car-cabin-carpet", 0, 0),
    panel: finish("car-cabin-panel", 0.01, 0.2),
    piano: finish("car-trim", 0.07, 0.85),
    accent: finish(colours.accent, 0.3, 0.6, { metal: 0.6 }),
    webbing: finish(colours.accent, 0.006, 0.08),
    chrome: finish("car-rim", 0.55, 0.9, { metal: 0.85 }),
    seat: finish(seat, 0.008, 0.12),
    seatSide: finish(seat, 0.006, 0.1, { shade: 0.78 }),
    seatInsert: finish(`${seat}-insert`, 0.004, 0.06),
    leather: finish("car-cabin-wheel", 0.02, 0.28),
    marker: finish("car-cabin-marker", 0.02, 0.25),
    rubber: finish("car-tyre", 0.005, 0.06),
    screen: finish("car-cabin-screen", 0.06, 1),
    dial: finish("car-cabin-screen", 0.04, 0.9),
    vent: finish("car-grille", 0.01, 0.2),
    paint: finish(null, 0.05, 0.6),
    cage: finish("car-cabin-cage", 0.06, 0.5, { metal: 0.3 }),
    wood: finish("car-cabin-wood", 0.05, 0.6),
    mirror: finish("car-cabin-mirror", 0.85, 1, { metal: 1 }),
    switchLit: finish("car-cabin-panel", 0.01, 0.3, { glow: 0.9 }),
    lampGreen: finish("car-cabin-lamp-green", 0.02, 0.8),
    lampAmber: finish("car-cabin-lamp-amber", 0.02, 0.8),
    lampRed: finish("car-cabin-lamp-red", 0.02, 0.8),
    glowLamp: finish(style.colours.glow, 0.02, 0.8),
  };
}
type Paints = ReturnType<typeof paintsOf>;

const flat = (paint: Paint, kind: FaceLook["kind"] = KIND.plain, param = 0): FaceLook => ({ paint, kind, param, group: 0 });
const smooth = (paint: Paint, kind: FaceLook["kind"] = KIND.plain): FaceLook => ({ paint, kind });

const add = (a: Point, b: Point, scale = 1): Point => [a[0] + b[0] * scale, a[1] + b[1] * scale, a[2] + b[2] * scale];
const cross = (a: Point, b: Point): Point => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const spow = (value: number, power: number) => Math.sign(value) * Math.abs(value) ** power;
const RIGHT: Point = [1, 0, 0];

type Frame = ReturnType<typeof axes>;

/** A disc in a frame's plane facing +c, its texture coordinates mapped across a cell of the sheet (or none). */
function disc(b: CockpitBuilder, frame: Frame, centre: readonly [number, number], radius: number, c: number, look: FaceLook, slot: number | null, sides = 40) {
  const uvOf = (x: number, y: number): Uv => {
    if (slot === null) return [0, 0];
    const cell = cellUv(slot);
    return [cell.u + (0.5 + (0.5 * x) / radius) * cell.width, cell.v + (0.5 + (0.5 * y) / radius) * cell.height];
  };
  const middle = frame(centre[0], centre[1], c);
  for (let side = 0; side < sides; side++) {
    const [from, to] = [(side / sides) * Math.PI * 2, ((side + 1) / sides) * Math.PI * 2];
    const [x0, y0, x1, y1] = [Math.cos(from) * radius, Math.sin(from) * radius, Math.cos(to) * radius, Math.sin(to) * radius];
    b.triangle(middle, frame(centre[0] + x0, centre[1] + y0, c), frame(centre[0] + x1, centre[1] + y1, c), look, [uvOf(0, 0), uvOf(x0, y0), uvOf(x1, y1)]);
  }
}

/** A flat rectangle in a frame's plane facing +c, with texture coordinates from `uv` at its corners. */
function plate(b: CockpitBuilder, frame: Frame, centre: readonly [number, number], size: readonly [number, number], c: number, look: FaceLook, uv: readonly [u0: number, v0: number, u1: number, v1: number] = [0, 0, 1, 1]) {
  const [x, y] = centre;
  const [w, h] = [size[0] / 2, size[1] / 2];
  b.quad(frame(x - w, y - h, c), frame(x + w, y - h, c), frame(x + w, y + h, c), frame(x - w, y + h, c), look, [
    [uv[0], uv[1]],
    [uv[2], uv[1]],
    [uv[2], uv[3]],
    [uv[0], uv[3]],
  ]);
}

/** A ring of tube round a centre in a frame's plane. */
function bezel(b: CockpitBuilder, frame: Frame, centre: readonly [number, number], radius: number, tube: number, c: number, look: FaceLook) {
  const path = Array.from({ length: 36 }, (_, at) => frame(centre[0] + Math.cos((at / 36) * Math.PI * 2) * radius, centre[1] + Math.sin((at / 36) * Math.PI * 2) * radius, c));
  b.tube(path, tube, 6, look, true);
}

/** The inside of the shell's pillars, rails and roof: its faces above the belt, a skin's depth in and turned to face in. */
function addInnerSkin(b: CockpitBuilder, f: CockpitFrame, shell: Soup, paints: Paints) {
  if (f.open) return;
  const g = f.ground;
  const bed = f.endZ < f.header.z + 1.4 && f.top(f.endZ + 0.4) < f.belt(f.endZ) + 0.1;
  let zTo = f.header.z;
  for (let z = f.header.z; z < f.endZ + 2.5; z += 0.02) if (f.top(z) - f.belt(z) > 0.14) zTo = z;
  if (bed) zTo = Math.min(zTo, f.endZ + 0.02);
  const keep = new Set(["paint", "trim"].map((surface) => SURFACES.indexOf(surface as (typeof SURFACES)[number])));
  const corner = (face: number, at: number): Point => {
    const from = (face * 3 + at) * 3;
    return [shell.positions[from], shell.positions[from + 1], shell.positions[from + 2]];
  };
  const inside = ([x, y, z]: Point) => z >= f.cowl.z - 0.03 && z <= zTo && y >= f.belt(z) + g - 0.004 && y <= f.top(z) + g + 0.004 && Math.abs(x) <= f.beltX(z) + 0.02;
  const faces: { corners: Point[]; normal: Point }[] = [];
  for (let face = 0; face < shell.triangles; face++) {
    if (!keep.has(shell.surfaces[face * 3])) continue;
    const corners = [0, 1, 2].map((at) => corner(face, at));
    if (!corners.every(inside)) continue;
    const [p, q, r] = corners;
    const raw = cross([q[0] - p[0], q[1] - p[1], q[2] - p[2]], [r[0] - p[0], r[1] - p[1], r[2] - p[2]]);
    faces.push({ corners, normal: raw });
  }
  // Each corner moves in along the mean of every face meeting it, so the skin stays closed where the shell creases.
  const key = ([x, y, z]: Point) => weldKey(x, y, z);
  const normals = new Map<number, Point>();
  for (const { corners, normal } of faces) {
    for (const point of corners) {
      const sum = normals.get(key(point)) ?? [0, 0, 0];
      normals.set(key(point), add(sum, normal));
    }
  }
  const moved = (point: Point) => add(point, normalize(normals.get(key(point)) ?? [0, 1, 0]), -SKIN_M);
  const group = b.newGroup();
  for (const { corners, normal } of faces) {
    const roof = normalize(normal)[1] > 0.55;
    b.triangle(moved(corners[0]), moved(corners[2]), moved(corners[1]), { paint: roof ? paints.headliner : paints.pillar, group });
  }
}

/** The dash: a loft across the cabin of one profile, from under the windscreen over the top, down its face and back under to the bulkhead. */
function addDash(b: CockpitBuilder, f: CockpitFrame, paints: Paints) {
  const { dash, floorH, ground: g, style } = f;
  const half = f.glassX(dash.rearZ) - 0.012;
  const profile: [z: number, h: number][] = [
    [dash.frontZ, dash.topH - 0.025],
    [dash.frontZ + 0.1, dash.topH],
    [dash.rearZ - 0.06, dash.topH + 0.008],
    [dash.rearZ - 0.014, dash.topH - 0.002],
    [dash.rearZ + 0.002, dash.topH - 0.03],
    [dash.lowZ, dash.lowH],
    [dash.lowZ - 0.03, dash.lowH - 0.035],
    [dash.frontZ + (dash.lowZ - dash.frontZ) * 0.5, dash.lowH - 0.08],
    [dash.frontZ + 0.18, floorH + 0.32],
    [dash.frontZ + 0.14, floorH + 0.03],
    [dash.frontZ - 0.03, floorH + 0.03],
  ];
  const stations = 15;
  const rows = Array.from({ length: stations }, (_, at) => {
    const x = -half + (2 * half * at) / (stations - 1);
    const across = x / half;
    const crown = 0.014 * (1 - across * across) - 0.02 * across ** 8;
    // Under an open car's scuttle, which falls away towards the sides, the dash keeps below it.
    const under = (z: number, h: number) => (f.opening === null ? h : Math.min(h, f.roofAt(Math.abs(x), z) - 0.018));
    return profile.map(([z, h], index): Point => [x, under(z, h + (index < 4 ? crown : 0)) + g, z]);
  });
  const face = style.paintedDash ? paints.paint : paints.dash;
  b.sheet(rows, smooth(paints.dash), true, (at) => ({ paint: at < 3 ? paints.dashTop : at < 6 ? face : paints.under }));

  // A strip of trim across the dash's face, from door to door, and the glovebox's lid on the passenger's side.
  const down = normalize([0, dash.lowH - (dash.topH - 0.03), dash.lowZ - (dash.rearZ + 0.002)]);
  const up: Point = [0, -down[1], -down[2]];
  const back = normalize(cross(RIGHT, up));
  const share = 0.35;
  const along: Point = [0, dash.topH - 0.03 + (dash.lowH - dash.topH + 0.03) * share + g, dash.rearZ + 0.002 + (dash.lowZ - dash.rearZ - 0.002) * share];
  const strip = style.paintedDash ? paints.chrome : style.gauges === "classic" ? paints.wood : paints.accent;
  const ends = half - 0.03;
  b.sheet(
    [-ends, ends].map((x) => {
      const at = axes([x, along[1], along[2]], RIGHT, up, back);
      return [at(0, -0.012, 0.002), at(0, -0.012, 0.009), at(0, 0.012, 0.009), at(0, 0.012, 0.002)];
    }),
    smooth(strip),
    true,
  );
  const glove = axes(add(along, up, -0.075), RIGHT, up, back);
  pillow(b, axes(glove(half * 0.5, 0, 0.004), RIGHT, up, back), [half * 0.32, 0.055, 0.008], 0.2, smooth(paints.dash), 6);
}

/** The instruments' pod on the dash's face in front of the driver: a backing, the dials or screen, and the hood over them. */
function addCluster(b: CockpitBuilder, f: CockpitFrame, paints: Paints): DialSpec[] {
  const { cluster, style, ground: g } = f;
  const { centre, facing, width: w, height: h } = cluster;
  const normal: Point = [0, facing[1], facing[0]];
  const up: Point = [0, facing[0], -facing[1]];
  const at = axes([centre.x, centre.h + g, centre.z], RIGHT, up, normal);
  plate(b, at, [0, 0], [w + 0.024, h + 0.024], 0, flat(paints.panel));

  // The hood: an arch over the face, its brow reaching out towards the driver.
  const arch = Array.from({ length: 25 }, (_, step) => {
    const t = Math.PI - (step / 24) * Math.PI;
    return [(w / 2 + 0.022) * spow(Math.cos(t), 0.3), -h / 2 - 0.014 + (h + 0.044) * spow(Math.sin(t), 0.3)] as const;
  });
  const rows = arch.map(([x, y], step) => {
    const [px, py] = arch[Math.min(step + 1, arch.length - 1)];
    const [qx, qy] = arch[Math.max(step - 1, 0)];
    const out = normalize([-(py - qy), px - qx, 0]);
    const inner = (depth: number, inset: number) => at(x - out[0] * inset, y - out[1] * inset, depth);
    return [inner(-0.06, 0), inner(0.055, 0), inner(0.05, 0.011), inner(-0.06, 0.011)];
  });
  // An open car's scuttle hoods its dials, so they sit flush in the dash with none of their own.
  if (f.opening === null) b.sheet(rows, smooth(style.paintedDash ? paints.dash : paints.dashTop), true);

  const dials: DialSpec[] = [];
  const dialLook = (slot: number) => flat(paints.dial, KIND.dial, slot);
  const ringLook = style.gauges === "classic" ? smooth(paints.chrome) : smooth(paints.accent);
  const big = (slot: number, source: Source, x: number, radius: number) => {
    disc(b, at, [x, 0], radius, 0.004, dialLook(slot), slot);
    bezel(b, at, [x, 0], radius + 0.003, style.gauges === "classic" ? 0.0045 : 0.0025, 0.005, ringLook);
    dials.push({ slot, source, startDeg: 225, sweepDeg: -270 });
  };
  const readout = (source: Source, glyphs: number, x: number, y: number, tall: number) => {
    const wide = tall * GLYPH_ASPECT * glyphs;
    plate(b, at, [x, y], [wide + tall * 0.25, tall * 1.25], 0.005, flat(paints.panel));
    plate(b, at, [x, y], [wide, tall], 0.008, flat(paints.screen, KIND.readout, readoutParam(source, glyphs)));
  };
  if (style.gauges === "analogue" || style.gauges === "classic") {
    const radius = style.gauges === "classic" ? 0.062 : 0.058;
    const apart = Math.min(w / 2 - radius - 0.006, 0.09);
    big(SLOT.speed, SOURCE.speed, -apart, radius);
    big(SLOT.revs, SOURCE.revs, apart, radius);
    if (style.gauges === "analogue" && style.centreDisplay) {
      readout(SOURCE.gear, 1, 0, 0.022, 0.026);
      readout(SOURCE.speed, 3, 0, -0.008, 0.014);
    } else if (style.gauges === "analogue") readout(SOURCE.gear, 1, 0, -0.03, 0.03);
  } else if (style.gauges === "tacho") {
    // The gear and the speed in figures sit in the dial's open foot, under the needle's sweep.
    big(SLOT.revs, SOURCE.revs, 0, 0.066);
    readout(SOURCE.gear, 1, 0, -0.024, 0.024);
    readout(SOURCE.speed, 3, 0, -0.049, 0.013);
    big(SLOT.speed, SOURCE.speed, -0.118, 0.044);
    disc(b, at, [0.118, -0.006], 0.036, 0.004, dialLook(SLOT.water), SLOT.water);
    bezel(b, at, [0.118, -0.006], 0.039, 0.0025, 0.005, ringLook);
    dials.push({ slot: SLOT.water, source: SOURCE.water, startDeg: 135, sweepDeg: -90 });
  } else if (style.gauges === "race") {
    big(SLOT.revs, SOURCE.revs, -0.02, 0.07);
    readout(SOURCE.speed, 3, -0.02, -0.036, 0.022);
    readout(SOURCE.gear, 1, 0.09, 0.005, 0.05);
    const lamps = [paints.lampGreen, paints.lampGreen, paints.lampAmber, paints.lampAmber, paints.lampRed, paints.lampRed, paints.lampRed];
    lamps.forEach((paint, index) => {
      const x = -0.02 + (index - 3) * 0.022;
      disc(b, at, [x, h / 2 + 0.002], 0.0065, 0.006, flat(paint, KIND.lamp, 0.8 + index * 0.028), null, 12);
    });
  } else {
    const cell = [cellUv(SLOT.digital), cellUv(SLOT.digital + 1)];
    plate(b, at, [0, 0], [w - 0.014, h - 0.014], 0.003, flat(paints.dial, KIND.dial, SLOT.digital), [cell[0].u, cell[0].v, cell[1].u + cell[1].width, cell[0].v + cell[0].height]);
    dials.push({ slot: SLOT.digital, source: SOURCE.none, startDeg: 0, sweepDeg: 0 });
    readout(SOURCE.speed, 3, 0, -0.004, 0.04);
    readout(SOURCE.gear, 1, w / 2 - 0.045, -0.025, 0.028);
    // The revs, or an electric car's power, as segments round an arc over the figures.
    const segments = 28;
    for (let index = 0; index < segments; index++) {
      const [from, to] = [Math.PI * (1.08 - (index / segments) * 1.16), Math.PI * (1.08 - ((index + 0.8) / segments) * 1.16)];
      const [inner, outer] = [0.062, 0.071];
      const arc = (angle: number, radius: number) => at(Math.cos(angle) * radius * 1.9, -0.035 + Math.sin(angle) * radius, 0.006);
      const paint = index / segments > 0.86 ? paints.lampRed : paints.glowLamp;
      b.quad(arc(from, inner), arc(to, inner), arc(to, outer), arc(from, outer), flat(paint, KIND.lamp, index / segments));
    }
  }
  return dials;
}

/** The wheel: its rim, spokes and hub turn with the steering; the column and its stalks stay put. */
function addWheel(b: CockpitBuilder, f: CockpitFrame, paints: Paints) {
  const { centre, tilt, radius: r, kind } = f.wheel;
  const g = f.ground;
  const back: Point = [0, Math.sin(tilt), Math.cos(tilt)];
  const up: Point = [0, Math.cos(tilt), -Math.sin(tilt)];
  const middle: Point = [centre.x, centre.h + g, centre.z];
  const at = axes(middle, RIGHT, up, back);
  const turning = (paint: Paint): FaceLook => ({ paint, kind: KIND.wheel });
  const tube = kind === "classic" ? 0.0085 : kind === "rally" ? 0.0175 : 0.016;
  const rimPaint = kind === "classic" ? paints.wood : paints.leather;

  // The rim's path round the wheel's plane, from the bottom anticlockwise.
  const steps = 64;
  const point = (angle: number): readonly [number, number] => {
    const [c, s] = [Math.cos(angle), Math.sin(angle)];
    if (kind === "flat") return [r * c * (s < -0.78 ? 1 + (-0.78 - s) * 0.6 : 1), r * Math.max(s, -0.84 + (s + 1) * 0.06)];
    if (kind === "yoke") return [r * 1.08 * spow(c, 0.55), r * 0.8 * spow(s, 0.6)];
    return [r * c, r * s];
  };
  const open = kind === "yoke";
  const angles = open ? Array.from({ length: steps + 1 }, (_, at) => Math.PI * 0.72 + (at / steps) * Math.PI * 1.56) : Array.from({ length: steps }, (_, at) => -Math.PI / 2 + (at / steps) * Math.PI * 2);
  const path = angles.map((angle) => {
    const [x, y] = point(angle);
    return at(x, y, 0);
  });
  const marked = (row: number) => kind === "rally" && Math.abs(Math.sin(angles[row]) - 1) < 0.006 && Math.cos(angles[row]) > -0.2;
  b.tube(path, tube, 10, turning(rimPaint), !open, (row) => turning(marked(row) || marked(Math.min(row + 1, angles.length - 1)) ? paints.marker : rimPaint));

  const dish = kind === "rally" ? 0.06 : kind === "classic" ? 0.03 : 0.012;
  const hub = (x: number, y: number) => at(x, y, -dish);
  const spokeAngles = kind === "classic" ? [Math.PI * 0.82, Math.PI * 0.18, Math.PI * 1.2, Math.PI * 1.8] : kind === "yoke" ? [Math.PI, 0, Math.PI * 1.5] : [Math.PI, 0, Math.PI * 1.5];
  for (const angle of spokeAngles) {
    const [rx, ry] = point(angle);
    const inner = 0.045;
    const [hx, hy] = [Math.cos(angle) * inner, Math.sin(angle) * inner];
    const direction = normalize([rx - hx, ry - hy, dish]);
    const side = normalize(cross([0, 0, 1], direction));
    const lower = angle > Math.PI * 1.3 && angle < Math.PI * 1.7;
    const [wideHub, wideRim] = kind === "classic" ? [0.008, 0.005] : lower ? [0.03, 0.022] : [0.022, 0.014];
    const thick = kind === "classic" ? 0.004 : 0.008;
    const section = (x: number, y: number, c: number, wide: number) => [at(x - side[0] * wide, y - side[1] * wide, c - thick), at(x + side[0] * wide, y + side[1] * wide, c - thick), at(x + side[0] * wide, y + side[1] * wide, c + thick), at(x - side[0] * wide, y - side[1] * wide, c + thick)];
    const end = 0.92;
    b.sheet([section(hx, hy, -dish, wideHub), section(rx * end, ry * end, -tube * 0.3, wideRim)], turning(kind === "classic" ? paints.chrome : paints.piano), true);
  }
  pillow(b, axes(hub(0, -0.004), RIGHT, up, back), [kind === "classic" ? 0.04 : 0.07, kind === "classic" ? 0.04 : 0.058, 0.026], 0.35, turning(kind === "classic" ? paints.chrome : paints.leather), 8);
  disc(b, at, [0, -0.004], 0.016, -dish + 0.027, turning(paints.accent), null, 16);

  // The column into the dash, and the stalks either side of it.
  const column = (along: number) => add(middle, back, -along);
  // Behind one big dial in the middle the column ends in a shroud just behind the hub, so it never crosses the dial.
  const columnLong = f.style.gauges === "tacho" ? 0.12 : 0.34;
  b.tube([column(dish + 0.02), column(columnLong)], 0.034, 12, smooth(paints.under));
  for (const side of [-1, 1]) {
    const root = add(column(dish + 0.07), RIGHT, side * 0.03);
    b.tube([root, add(add(root, RIGHT, side * 0.11), up, 0.015)], 0.0055, 6, smooth(paints.piano));
  }
}

/** The stack in the middle of the dash, with its screen or small dials, vents and knobs, and the console back between the seats. */
function addCentre(b: CockpitBuilder, f: CockpitFrame, paints: Paints): DialSpec[] {
  const { dash, ground: g, style, cushionH, floorH } = f;
  const dials: DialSpec[] = [];
  const faceDown = normalize([0, dash.lowH - (dash.topH - 0.03), dash.lowZ - dash.rearZ]);
  const up: Point = [0, -faceDown[1], -faceDown[2]];
  const back = normalize(cross(RIGHT, up));
  const bottomH = Math.max(cushionH + 0.1, floorH + 0.25);
  const topH = dash.topH - 0.05;
  const middleH = (topH + bottomH) / 2;
  const share = (dash.topH - 0.03 - middleH) / (dash.topH - 0.03 - dash.lowH);
  const faceZ = dash.rearZ + (dash.lowZ - dash.rearZ) * share;
  const halfTall = (topH - bottomH) / 2;
  const centre: Point = [0, middleH + g, faceZ - 0.02];
  const at = axes(centre, RIGHT, up, back);
  const depth = 0.05;
  pillow(b, at, [0.14, halfTall, depth], 0.25, smooth(paints.trim), 10);
  const front = depth + 0.002;
  const screenY = halfTall - 0.085;
  if (style.screen) {
    plate(b, at, [0, screenY], [0.215, 0.13], front, flat(paints.piano));
    plate(b, at, [0, screenY], [0.2, 0.115], front + 0.003, flat(paints.screen, KIND.screen));
    plate(b, at, [-0.035, screenY + 0.022], [0.016 * GLYPH_ASPECT * 4, 0.016], front + 0.006, flat(paints.screen, KIND.readout, readoutParam(SOURCE.clock, 4)));
    plate(b, at, [0.05, screenY + 0.022], [0.016 * GLYPH_ASPECT * 3, 0.016], front + 0.006, flat(paints.screen, KIND.readout, readoutParam(SOURCE.outside, 3)));
  } else if (style.gauges === "classic") {
    ([SLOT.fuel, SLOT.water, SLOT.oil] as const).forEach((slot, index) => {
      const x = (index - 1) * 0.074;
      disc(b, at, [x, screenY], 0.031, front, flat(paints.dial, KIND.dial, slot), slot);
      bezel(b, at, [x, screenY], 0.033, 0.0035, front + 0.001, smooth(paints.chrome));
      dials.push({ slot, source: slot === SLOT.fuel ? SOURCE.fuel : slot === SLOT.water ? SOURCE.water : SOURCE.oil, startDeg: 135, sweepDeg: -90 });
    });
  } else {
    plate(b, at, [0, screenY], [0.2, 0.06], front, flat(paints.piano));
    for (const x of [-0.06, 0, 0.06]) plate(b, at, [x, screenY], [0.04, 0.012], front + 0.003, flat(paints.switchLit));
  }
  // Vents above the screen, and a row of knobs and switches under it.
  for (const x of [-0.06, 0.06]) {
    plate(b, at, [x, halfTall - 0.02], [0.1, 0.03], front, flat(paints.accent));
    plate(b, at, [x, halfTall - 0.02], [0.092, 0.024], front + 0.002, flat(paints.vent, KIND.vent));
  }
  const knobsY = screenY - 0.1;
  for (const x of [-0.07, 0, 0.07]) {
    pillow(b, axes(at(x, knobsY, front + 0.008), RIGHT, up, back), [0.019, 0.019, 0.01], 0.6, smooth(x === 0 ? paints.piano : paints.accent), 6);
  }
  for (const x of [-0.035, 0.035]) plate(b, at, [x, knobsY], [0.022, 0.008], front + 0.002, flat(paints.switchLit));

  // Vents at the dash's ends, on its face.
  const half = f.glassX(dash.rearZ) - 0.012;
  const endAt = axes([0, dash.topH - 0.075 + g, dash.rearZ + (dash.lowZ - dash.rearZ) * 0.2], RIGHT, up, back);
  for (const side of [-1, 1]) {
    const x = side * (half - 0.11);
    plate(b, endAt, [x, 0], [0.105, 0.045], 0.004, flat(paints.accent));
    plate(b, endAt, [x, 0], [0.095, 0.037], 0.007, flat(paints.vent, KIND.vent));
  }

  // The console: from under the stack back between the seats, an armrest at its end.
  const fromZ = faceZ - 0.02 + depth * 0.4;
  const lever = f.seatZ - 0.36;
  const toZ = f.seatZ + 0.18;
  const heightAt = (z: number) => {
    if (z < lever - 0.12) return bottomH + (cushionH + 0.06 - bottomH) * Math.min(1, (z - fromZ) / Math.max(lever - 0.12 - fromZ, 0.01));
    if (z < f.seatZ - 0.16) return cushionH + 0.06;
    return cushionH + 0.06 + 0.13 * Math.min(1, (z - (f.seatZ - 0.16)) / 0.05);
  };
  const stations = [fromZ, fromZ + (lever - 0.12 - fromZ) * 0.5, lever - 0.12, lever + 0.1, f.seatZ - 0.16, f.seatZ - 0.11, toZ];
  const rows = stations.map((z) => {
    const top = heightAt(z) + g;
    const halfWide = z > f.seatZ - 0.14 ? 0.095 : 0.11;
    const bottom = floorH + g;
    return [[-halfWide, bottom, z], [halfWide, bottom, z], [halfWide, top - 0.025, z], [halfWide - 0.025, top, z], [-halfWide + 0.025, top, z], [-halfWide, top - 0.025, z]] as Point[];
  });
  b.sheet(rows, smooth(paints.trim), true, (index) => ({ paint: index === 3 ? paints.dash : paints.trim }));

  // The lever on the console.
  const base: Point = [0, cushionH + 0.06 + g, lever];
  if (style.shifter === "selector") {
    pillow(b, axes(add(base, [0, 1, 0], 0.012), RIGHT, [0, 0, -1], [0, 1, 0]), [0.032, 0.032, 0.014], 0.7, smooth(paints.accent), 10);
    pillow(b, axes(add(base, [0, 1, 0], 0.03), RIGHT, [0, 0, -1], [0, 1, 0]), [0.024, 0.024, 0.008], 0.6, smooth(paints.piano), 10);
  } else {
    const tall = style.shifter === "sequential" ? 0.2 : 0.12;
    const top = add(base, normalize([0, 1, 0.25]), tall);
    pillow(b, axes(add(base, [0, 1, 0], 0.01), RIGHT, [0, 0, -1], [0, 1, 0]), [0.045, 0.05, 0.022], 0.7, smooth(paints.rubber), 8);
    b.tube([add(base, [0, 1, 0], 0.01), top], style.shifter === "sequential" ? 0.009 : 0.007, 8, smooth(style.shifter === "sequential" ? paints.accent : paints.chrome));
    pillow(b, axes(top, RIGHT, [0, 1, 0], [0, 0, 1]), style.shifter === "sequential" ? [0.02, 0.035, 0.02] : [0.024, 0.022, 0.024], 0.8, smooth(style.shifter === "sequential" ? paints.piano : paints.leather), 8);
    if (style.shifter === "sequential") {
      // A rally car's handbrake, tall beside the lever.
      const root: Point = [0.06, cushionH + 0.06 + g, lever + 0.12];
      b.tube([root, add(root, normalize([0, 1, -0.35]), 0.3)], 0.011, 8, smooth(paints.marker));
    }
  }
  return dials;
}

/**
 * Quilted leather over a seat's face: a grid of small stitched pads standing out of the back's front and the cushion's
 * top, the seams between them the leather under, a shade apart.
 */
function addQuilting(b: CockpitBuilder, paints: Paints, wide: number, middle: Point, tall: number, up: Point, back: Point, cushion: Point, cushionUp: Point, cushionBack: Point) {
  const pad = smooth(paints.seatInsert);
  const across = [-1, 0, 1].map((at) => at * wide * 0.27);
  const face = add(middle, back, -0.058);
  for (const a of across) {
    for (const along of [-0.6, -0.2, 0.2, 0.6]) pillow(b, axes(add(add(face, RIGHT, a), up, along * tall), RIGHT, up, back), [wide * 0.12, tall * 0.18, 0.012], 0.35, pad, 3);
    for (const along of [-0.13, 0, 0.13]) pillow(b, axes(add(add(add(cushion, RIGHT, a), cushionBack, along), cushionUp, 0.012), RIGHT, cushionUp, cushionBack), [wide * 0.12, 0.012, 0.058], 0.35, pad, 3);
  }
}

/** One seat at x, its cushion at `cushionH` and its back reclined from z. */
function addSeat(b: CockpitBuilder, f: CockpitFrame, paints: Paints, x: number, z: number, cushionH: number, kind: "comfort" | "sport" | "bucket" | "bench", wide: number, quilted = false) {
  const g = f.ground;
  const recline = ((kind === "bench" ? 22 : 16) * Math.PI) / 180;
  const up: Point = [0, Math.cos(recline), Math.sin(recline)];
  const back: Point = [0, -Math.sin(recline), Math.cos(recline)];
  const tilt = (4 * Math.PI) / 180;
  const cushionUp: Point = [0, Math.cos(tilt), Math.sin(tilt)];
  const cushionBack: Point = [0, -Math.sin(tilt), Math.cos(tilt)];
  const look = smooth(paints.seat);
  const side = smooth(paints.seatSide);
  pillow(b, axes([x, cushionH - 0.055 + g, z - 0.2], RIGHT, cushionUp, cushionBack), [wide, 0.065, 0.25], 0.3, look, 10);
  const hip: Point = [x, cushionH - 0.02 + g, z + 0.1];
  // Under the roof, or a fastback's glass, with a little room: what's above that is cut down to fit.
  const reach = Math.abs(x) + wide * 0.9;
  const room = (at: Point) => (f.open ? Infinity : f.roofAt(reach, at[2]) - SKIN_M - 0.03 + g);
  const natural = kind === "bucket" ? 0.4 : kind === "bench" ? 0.28 : 0.31;
  const fits = (half: number) => add(hip, up, half * 2)[1] <= room(add(hip, up, half * 2));
  let tall = natural;
  while (tall > 0.15 && !fits(tall)) tall -= 0.01;
  const middle = add(hip, up, tall);
  pillow(b, axes(middle, RIGHT, up, back), [wide * 0.95, tall, 0.065], 0.3, look, 10);
  // A panel down the middle of the back and the cushion, a shade apart, as stitched seats have.
  pillow(b, axes(add(middle, back, 0.056), RIGHT, up, back), [wide * 0.5, tall * 0.78, 0.014], 0.25, smooth(paints.seatInsert), 6);
  pillow(b, axes([x, cushionH + g - 0.003, z - 0.21], RIGHT, cushionUp, cushionBack), [wide * 0.52, 0.014, 0.2], 0.25, smooth(paints.seatInsert), 6);
  if (quilted) addQuilting(b, paints, wide, middle, tall, up, back, [x, cushionH + g, z - 0.21], cushionUp, cushionBack);
  if (kind !== "comfort" && kind !== "bench") {
    const bolster = kind === "bucket" ? 0.07 : 0.05;
    for (const s of [-1, 1]) {
      pillow(b, axes(add(add(middle, RIGHT, s * (wide * 0.95 - 0.01)), back, -0.04), RIGHT, up, back), [0.035, tall * 0.92, bolster], 0.4, side, 8);
      pillow(b, axes([x + s * (wide - 0.015), cushionH - 0.02 + g, z - 0.2], RIGHT, cushionUp, cushionBack), [0.035, 0.05, 0.23], 0.4, side, 8);
    }
  }
  if (kind === "bucket") return;
  const headrests = kind === "bench" ? [x - wide * 0.55, x + wide * 0.55] : [x];
  for (const at of headrests) {
    let rise = tall * 2 + 0.11;
    while (rise > tall * 2 + 0.05 && add(hip, up, rise + 0.085)[1] > room(add(hip, up, rise))) rise -= 0.01;
    if (add(hip, up, rise + 0.085)[1] > room(add(hip, up, rise))) continue;
    const top = add(add(hip, up, rise), RIGHT, at - x);
    pillow(b, axes(top, RIGHT, up, back), [0.125, 0.085, 0.055], 0.35, look, 8);
    for (const post of [-0.06, 0.06]) b.tube([add(add(top, RIGHT, post), up, -0.07), add(add(top, RIGHT, post), up, -0.13)], 0.0055, 6, smooth(paints.chrome));
  }
}

/** A four-point harness over a seat at x: two shoulder straps down the back, a lap belt across and its buckle. */
function addHarness(b: CockpitBuilder, f: CockpitFrame, paints: Paints, x: number, z: number, cushionH: number) {
  const g = f.ground;
  // The seat's own recline (`addSeat`), so the straps lie on its back.
  const recline = (16 * Math.PI) / 180;
  const up: Point = [0, Math.cos(recline), Math.sin(recline)];
  const back: Point = [0, -Math.sin(recline), Math.cos(recline)];
  const hip: Point = [x, cushionH - 0.02 + g, z + 0.1];
  const strap = smooth(paints.webbing);
  for (const s of [-1, 1]) pillow(b, axes(add(add(add(hip, up, 0.44), RIGHT, s * 0.075), back, -0.078), RIGHT, up, back), [0.024, 0.3, 0.005], 0.2, strap, 4);
  pillow(b, axes([x, cushionH + 0.06 + g, z - 0.04], RIGHT, [0, 1, 0], [0, 0, 1]), [0.2, 0.024, 0.005], 0.2, strap, 4);
  pillow(b, axes([x, cushionH + 0.06 + g, z - 0.05], RIGHT, [0, 1, 0], [0, 0, 1]), [0.035, 0.032, 0.008], 0.3, smooth(paints.chrome), 6);
}

/** The door cards along each side, below the glass: a kick panel, an armrest, an insert and a cap where the glass starts. */
function addDoors(b: CockpitBuilder, f: CockpitFrame, paints: Paints) {
  const { ground: g, floorH, cushionH, style, dash } = f;
  const [fromZ, toZ] = [dash.rearZ - 0.06, f.endZ - 0.02];
  const armH = cushionH + 0.2;
  const stations = Math.max(2, Math.ceil((toZ - fromZ) / 0.08) + 1);
  const bare = style.cage;
  for (const side of [-1, 1]) {
    const rows = Array.from({ length: stations }, (_, at) => {
      const z = fromZ + ((toZ - fromZ) * at) / (stations - 1);
      const [card, glass, belt] = [f.cardX(z), f.glassX(z), f.belt(z)];
      const inward = (x: number, h: number): Point => [side * x, h + g, z];
      const arm = bare ? 0 : 0.075;
      const points = [
        inward(card + 0.012, floorH + 0.016),
        inward(card - 0.01, floorH + 0.12),
        inward(card - 0.018, armH - 0.08),
        inward(card - 0.018 - arm, armH - 0.04),
        inward(card - 0.022 - arm, armH),
        inward(card - 0.03, armH + 0.02),
        inward(card - 0.016, armH + 0.05),
        inward(card - 0.016, belt - 0.05),
        inward(card - 0.03, belt - 0.012),
        inward(glass - 0.008, belt + 0.004),
      ];
      return side < 0 ? points : points.reverse();
    });
    const lookAt = (index: number) => {
      const at = side < 0 ? index : rows[0].length - 2 - index;
      if (bare) return smooth(at === 7 ? paints.trim : paints.paint);
      return smooth(at < 1 ? paints.carpet : at < 2 ? paints.trim : at < 6 ? paints.trim : at < 7 ? paints.insert : paints.dash);
    };
    b.sheet(rows, smooth(paints.trim), false, lookAt);
    // A handle and a speaker on each door.
    const doorZ = Math.min(f.seatZ - 0.25, toZ - 0.3);
    const card = f.cardX(doorZ);
    const facing: Point = [-side, 0, 0];
    const handleAt = axes([side * (card - 0.03), armH + 0.1 + g, doorZ], [0, 0, side], [0, 1, 0], facing);
    pillow(b, handleAt, [0.06, 0.014, 0.012], 0.4, smooth(paints.accent), 6);
    if (!bare) {
      const speakerAt = axes([side * (card - 0.002), floorH + 0.2 + g, doorZ], [0, 0, side], [0, 1, 0], facing);
      disc(b, speakerAt, [0, 0], 0.07, 0.006, flat(paints.vent, KIND.vent), null, 24);
    }
  }
}

/** The floor, the bulkhead under the dash with the pedals, and the back of the cabin. */
function addFloor(b: CockpitBuilder, f: CockpitFrame, paints: Paints) {
  const { ground: g, floorH, dash, eye, cushionH } = f;
  const y = floorH + 0.015 + g;
  const [fromZ, toZ] = [dash.frontZ + 0.1, f.endZ];
  const halfAt = (z: number) => f.cardX(z) + 0.01;
  const steps = 8;
  for (let at = 0; at < steps; at++) {
    const [z0, z1] = [fromZ + ((toZ - fromZ) * at) / steps, fromZ + ((toZ - fromZ) * (at + 1)) / steps];
    b.quad([-halfAt(z0), y, z0], [-halfAt(z1), y, z1], [halfAt(z1), y, z1], [halfAt(z0), y, z0], flat(paints.carpet));
  }
  // The pedals, on the driver's side.
  const pedals = f.style.shifter === "selector" ? [0.03, -0.1] : [0.09, -0.02, -0.12];
  pedals.forEach((offset, index) => {
    const at = axes([eye.x + offset, floorH + 0.13 + g, dash.frontZ + 0.3], RIGHT, normalize([0, 0.85, -0.5]), normalize([0, 0.5, 0.85]));
    pillow(b, at, [index === pedals.length - 1 && f.style.shifter === "selector" ? 0.05 : 0.032, 0.045, 0.006], 0.3, smooth(paints.rubber), 6);
  });
  // The back: a shelf over the boot behind rear seats, or a bulkhead behind the front ones.
  const endHalf = f.cardX(f.endZ);
  if (f.rearSeatZ !== undefined) {
    let shelfH = f.belt(f.endZ) + 0.02;
    const from = f.rearSeatZ + 0.32;
    let to = from + 0.1;
    while (to < f.endZ + 0.45 && f.roofAt(endHalf, to + 0.02) - 0.04 > shelfH) to += 0.02;
    shelfH += g;
    b.quad([-endHalf, shelfH, from], [-endHalf, shelfH, to], [endHalf, shelfH, to], [endHalf, shelfH, from], flat(paints.trim));
  } else {
    const top = (f.open ? f.belt(f.endZ) + 0.05 : Math.max(cushionH + 0.6, f.belt(f.endZ) + 0.05)) + g;
    b.quad([endHalf, y, f.endZ], [-endHalf, y, f.endZ], [-endHalf, top, f.endZ], [endHalf, top, f.endZ], flat(paints.trim));
  }
}

/** The mirror at the top of the windscreen and the visors folded up beside it. */
function addMirrorAndVisors(b: CockpitBuilder, f: CockpitFrame, paints: Paints) {
  const { ground: g, header, open } = f;
  const z = header.z + 0.07;
  const roofY = (open ? header.h - 0.035 : f.roofAt(0, z) - SKIN_M) + g;
  const mount: Point = [0, roofY - 0.004, header.z + 0.035];
  const body: Point = [0, roofY - 0.07, z];
  b.tube([mount, add(body, [0, 1, 0], 0.02)], 0.007, 6, smooth(paints.piano));
  const facing = normalize([0.18, -0.08, 1]);
  const across = normalize(cross([0, 1, 0], facing));
  const at = axes(body, across, normalize(cross(facing, across)), facing);
  pillow(b, at, [0.12, 0.034, 0.018], 0.3, smooth(paints.piano), 8);
  plate(b, at, [0, 0], [0.22, 0.054], 0.0185, flat(paints.mirror));
  if (open) return;
  for (const side of [-1, 1]) {
    const visorZ = header.z + 0.13;
    const visorX = side * 0.29;
    const visorY = Math.min(f.roofAt(visorX - 0.16, visorZ), f.roofAt(visorX + 0.16, visorZ)) - SKIN_M - 0.022 + g;
    const slope = (f.top(visorZ + 0.05) - f.top(visorZ - 0.05)) / 0.1;
    const forward = normalize([0, slope, 1]);
    pillow(b, axes([visorX, visorY, visorZ], RIGHT, cross(forward, RIGHT), forward), [0.16, 0.01, 0.085], 0.3, smooth(paints.pillar), 6);
  }
}

/** A cage tube's sides: 30 degrees apart, under the cockpit's 38 degree crease. */
const CAGE_SIDES = 12;
/** How far under the belt the door bars' top ends sit. */
const DOOR_BAR_DROP_M = 0.07;

/** A rally car's cage: hoops behind the seats and up the pillars, bars along the roof and an X in each door. */
function addCage(b: CockpitBuilder, f: CockpitFrame, paints: Paints) {
  const { ground: g, floorH, header, dash } = f;
  const look = smooth(paints.cage);
  const radius = 0.019;
  // Enough sides that neighbouring faces meet under the builder's crease, so each tube shades round, not as flat bands.
  const tube = (path: Point[], r: number) => b.tube(path, r, CAGE_SIDES, look);
  const main = f.seatZ + 0.33;
  const sideAt = (z: number) => f.cardX(z) - 0.06;
  const railAt = (z: number) => f.glassX(z) - 0.18;
  const roofAt = (z: number) => f.roofAt(railAt(z), z) - SKIN_M - 0.026 + g;
  const floor = floorH + 0.02 + g;
  const beltAt = (z: number) => f.belt(z) + g;
  // The door bars' top ends sit down the door card, under the window line, as a real cage's do, and not across the view.
  const doorTopAt = (z: number) => beltAt(z) - DOOR_BAR_DROP_M;
  const hoop: Point[] = [
    [-sideAt(main), floor, main],
    [-sideAt(main), beltAt(main), main],
    [-railAt(main), roofAt(main), main],
    [railAt(main), roofAt(main), main],
    [sideAt(main), beltAt(main), main],
    [sideAt(main), floor, main],
  ];
  tube(hoop, radius);
  tube([[-sideAt(main), floor + 0.05, main], [railAt(main), roofAt(main) - 0.02, main]], radius * 0.9);
  const frontZ = header.z + 0.06;
  for (const s of [-1, 1]) {
    const foot: Point = [s * sideAt(dash.rearZ), floor, dash.rearZ];
    const corner: Point = [s * railAt(frontZ), roofAt(frontZ), frontZ];
    tube([foot, [s * sideAt(dash.rearZ), beltAt(dash.rearZ) + 0.05, dash.rearZ + 0.02], corner, [s * railAt(main), roofAt(main), main]], radius);
    tube([[s * sideAt(dash.rearZ), floor + 0.1, dash.rearZ + 0.03], [s * sideAt(main), doorTopAt(main), main]], radius * 0.85);
    tube([[s * sideAt(dash.rearZ), doorTopAt(dash.rearZ), dash.rearZ + 0.03], [s * sideAt(main), floor + 0.12, main]], radius * 0.85);
    tube([[s * railAt(main), roofAt(main), main], [s * sideAt(f.endZ) * 0.8, floor + 0.2, Math.max(f.endZ, main + 0.4)]], radius * 0.9);
  }
  tube([[-railAt(frontZ), roofAt(frontZ), frontZ], [railAt(frontZ), roofAt(frontZ), frontZ]], radius * 0.9);
}

export function buildCockpit(spec: CarSpec): CockpitParts {
  const frame = cockpitFrame(spec);
  const { style, cabin, cushionH } = frame;
  const paints = paintsOf(style, cabin.seatSurface === "seatTan" && !style.cage ? "car-cabin-seat-tan" : "car-cabin-seat");
  const b = new CockpitBuilder();
  const shell = buildBareShell(spec);
  addInnerSkin(b, frame, shell, paints);
  addDash(b, frame, paints);
  const dials = [...addCluster(b, frame, paints), ...addCentre(b, frame, paints)];
  addWheel(b, frame, paints);
  const seatKind = style.seats;
  for (const side of [-1, 1]) addSeat(b, frame, paints, side * cabin.seatX, frame.seatZ, cushionH, seatKind, seatKind === "comfort" ? 0.25 : 0.24, style.quilted);
  if (style.harness) for (const side of [-1, 1]) addHarness(b, frame, paints, side * cabin.seatX, frame.seatZ, cushionH);
  if (frame.rearSeatZ !== undefined) addSeat(b, frame, paints, 0, frame.rearSeatZ, cushionH - 0.03, "bench", Math.min(frame.cardX(frame.rearSeatZ) - 0.06, 0.62));
  addDoors(b, frame, paints);
  addFloor(b, frame, paints);
  if (style.rearMirror) addMirrorAndVisors(b, frame, paints);
  if (style.cage) addCage(b, frame, paints);
  const soup = b.finish(38);

  const shade = cabinShade(frame);
  // A corner is shared by the faces round it, so each place and facing is baked once.
  const openness = new Float32Array(soup.triangles * 3);
  const baked = new Map<number, number>();
  for (let vertex = 0; vertex < openness.length; vertex++) {
    const point = [soup.positions[vertex * 3], soup.positions[vertex * 3 + 1], soup.positions[vertex * 3 + 2]] as const;
    const normal = [soup.normals[vertex * 3], soup.normals[vertex * 3 + 1], soup.normals[vertex * 3 + 2]] as const;
    const facing = (Math.round(normal[0] * 8) + 8) * 289 + (Math.round(normal[1] * 8) + 8) * 17 + (Math.round(normal[2] * 8) + 8);
    // To 5 mm and a sixteenth of a turn, as one whole number well inside a double's exact range.
    const place = ((Math.round(point[0] * 200) + 2048) * 4096 + Math.round(point[1] * 200) + 2048) * 4096 + Math.round(point[2] * 200) + 2048;
    const key = place * 4913 + facing;
    const known = baked.get(key);
    const open = known ?? opennessAt(shade, [point[0] + normal[0] * 0.01, point[1] + normal[1] * 0.01, point[2] + normal[2] * 0.01], normal);
    baked.set(key, open);
    openness[vertex] = open;
  }

  const { centre, tilt } = frame.wheel;
  return {
    frame,
    shade,
    soup,
    openness,
    shell,
    dials,
    wheel: { pivot: [centre.x, centre.h + frame.ground, centre.z], axis: [0, Math.sin(tilt), Math.cos(tilt)] },
    eye: [frame.eye.x, frame.eye.h + frame.ground, frame.eye.z],
  };
}
