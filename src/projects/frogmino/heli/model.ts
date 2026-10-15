import type { PartShape, Vec3 } from "../vehicles/parts";
import { LAYER } from "../vehicles/parts";

// An art prototype (`?heli`): a helicopter to start a course from instead of
// the overpass, carrying the two frogs side by side across the whole road and
// dropping them onto it. Nothing in the game uses it yet.
//
// The Lily Lifter is a twin-fuselage heavy lifter: an open deck spans the
// road, as the overpass's does, and everything else, the two fuselages, their
// rotors, tails and skids, flies beside the road on short wings. The gameplay
// camera rides over the middle of the road, so a ray from it through anything
// beyond the road's edges only ever meets the ground further out: nothing but
// the deck can hide a lane, a vehicle or a frog. The deck is as deep as the
// overpass's and as low as it can be while the traffic clears it.
//
// It is built in its own frame: x across the road in lanes, as the scene's,
// so lane k is centred on x = k; y up from the deck's top, where the frogs
// stand; and z along the road as the scene's, toward the camera, with the
// deck centred on z = 0. It flies down the road, nose first, toward +z.

export const HELI_PAINTS = ["body", "trim", "accent", "deck", "ink", "glass", "eye", "lamp"] as const;
export type HeliPaint = (typeof HELI_PAINTS)[number];

export function heliToken(paint: HeliPaint): string {
  return `--color-frogmino-heli-${paint}`;
}

// A box, or a disc or drum along an axis filling the box, as the fleet's
// parts are. Bordered boxes carry the world's faint cell border.
export interface HeliPart {
  shape: PartShape;
  min: Vec3;
  max: Vec3;
  paint: HeliPaint;
  bordered?: boolean;
}

// A rotor spins about its axis through `centre`; its parts are in its own
// frame, centred on the hub.
export interface Rotor {
  centre: Vec3;
  axis: "x" | "y";
  // Turns a second, and which way.
  speed: number;
  radius: number;
  parts: HeliPart[];
}

export interface HeliModel {
  body: HeliPart[];
  rotors: Rotor[];
}

// The deck: as deep along the road as the overpass's, and thick enough to be
// the wing spar it hangs from.
export const DECK_HALF_LENGTH = 1.5;
export const DECK_THICKNESS = 0.6;
// The striped lip along the deck's front edge, the edge the frogs jump from.
const LIP_DEPTH = 0.3;
const STRIPE = 0.5;
// The railing along the deck's back edge, the only thing over the lanes that
// stands above the deck, and low.
export const RAIL_TOP = 0.55;
const RAIL_DEPTH = 0.1;
const POST = 0.1;

// The wings reach this far beyond the road's edge to each fuselage.
const WING_REACH = 1.5;
const POD_WIDTH = 2;
const HULL_BOTTOM = -1.3;
const HULL_TOP = 0.7;
const HULL_FRONT = -2.2;
const HULL_BACK = 1.8;
const NOSE_RADIUS = (HULL_TOP - HULL_BOTTOM) / 2;
const NOSE_Y = (HULL_TOP + HULL_BOTTOM) / 2;
// The main rotors: as big as they can be with their tips still outside the
// road.
const ROTOR_CLEARANCE = 0.1;
const MAIN_ROTOR_RADIUS = WING_REACH + POD_WIDTH / 2 - ROTOR_CLEARANCE;
const MAST_Z = -0.6;
const MAST_TOP = 1.9;
const BLADE_WIDTH = 0.3;
const BLADE_THICKNESS = 0.08;
const TIP = 0.45;
const MAIN_SPEED = 1.6;
const TAIL_SPEED = 3.2;
// The tail boom runs up the road, ahead of the deck, to a fin and a tail rotor.
const BOOM_END = -6.4;
const TAIL_ROTOR_RADIUS = 0.6;

const sorted = (a: Vec3, b: Vec3): [Vec3, Vec3] => [
  [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])],
  [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])],
];

function part(shape: PartShape, a: Vec3, b: Vec3, paint: HeliPaint, bordered = false): HeliPart {
  const [min, max] = sorted(a, b);
  return { shape, min, max, paint, ...(bordered ? { bordered } : {}) };
}

// A drum or disc along `axis`, `radius` round its centre and `from`..`to`
// along the axis.
function drum(axis: "x" | "y" | "z", centre: Vec3, radius: number, from: number, to: number, paint: HeliPaint): HeliPart {
  const [x, y, z] = centre;
  if (axis === "x") return part("drumX", [from, y - radius, z - radius], [to, y + radius, z + radius], paint);
  if (axis === "y") return part("drumY", [x - radius, from, z - radius], [x + radius, to, z + radius], paint);
  return part("drumZ", [x - radius, y - radius, from], [x + radius, y + radius, to], paint);
}

// Two crossed blades with yellow tips and a hub, about the rotor's axis,
// in the plane through the hub.
function blades(axis: "x" | "y", radius: number, width: number, hub: number): HeliPart[] {
  const t = BLADE_THICKNESS / 2;
  const w = width / 2;
  const inner = radius - TIP;
  // On a y axis the blades lie along x and z; on an x axis along y and z.
  const place = (along: "u" | "v", from: number, to: number, paint: HeliPaint): HeliPart => {
    const [u0, u1, v0, v1] = along === "u" ? [from, to, -w, w] : [-w, w, from, to];
    return axis === "y" ? part("box", [u0, -t, v0], [u1, t, v1], paint) : part("box", [-t, u0, v0], [t, u1, v1], paint);
  };
  const parts: HeliPart[] = [];
  for (const along of ["u", "v"] as const) {
    parts.push(place(along, -inner, inner, "ink"), place(along, inner, radius, "trim"), place(along, -radius, -inner, "trim"));
  }
  parts.push(drum(axis, [0, 0, 0], hub, -t - 0.08, t + 0.08, "trim"));
  return parts;
}

// One fuselage, centred across on `xc`, its outer side toward `outward`.
function pod(xc: number, outward: 1 | -1): { body: HeliPart[]; main: Rotor; tail: Rotor } {
  const x = (dx: number) => xc + outward * dx;
  const [inner, outer] = [x(-POD_WIDTH / 2), x(POD_WIDTH / 2)];
  const body: HeliPart[] = [
    // The hull, rounded at both ends.
    part("box", [inner, HULL_BOTTOM, HULL_FRONT], [outer, HULL_TOP, HULL_BACK], "body", true),
    drum("x", [0, NOSE_Y, HULL_BACK], NOSE_RADIUS, Math.min(inner, outer), Math.max(inner, outer), "body"),
    drum("x", [0, NOSE_Y, HULL_FRONT], NOSE_RADIUS, Math.min(inner, outer), Math.max(inner, outer), "body"),
    // A yellow cheek stripe down each side.
    part("box", [inner - outward * LAYER, -0.75, HULL_FRONT], [inner, -0.4, HULL_BACK], "trim"),
    part("box", [outer, -0.75, HULL_FRONT], [outer + outward * LAYER, -0.4, HULL_BACK], "trim"),
    // The bubble canopy over the nose, glazed all round.
    part("box", [x(-0.8), HULL_TOP, 0.1], [x(0.8), HULL_TOP + 0.75, HULL_BACK], "glass"),
    drum("x", [0, HULL_TOP, HULL_BACK], 0.75, Math.min(x(-0.8), x(0.8)), Math.max(x(-0.8), x(0.8)), "glass"),
    // The canopy's frame: a body-coloured bar across its top.
    part("box", [x(-0.85), HULL_TOP + 0.75, 0.75], [x(0.85), HULL_TOP + 0.8, 1.05], "body"),
    // Two frog eyes on top of the canopy, looking back at the camera.
    ...[-0.42, 0.42].flatMap((dx) => [
      drum("z", [x(dx), HULL_TOP + 0.85, 0], 0.36, 0.15, 0.45, "body"),
      drum("z", [x(dx), HULL_TOP + 0.85, 0], 0.3, 0.3, 0.6, "eye"),
      drum("z", [x(dx), HULL_TOP + 0.88, 0], 0.13, 0.6, 0.6 + LAYER, "ink"),
    ]),
    // Headlamps low on the nose.
    ...[-0.5, 0.5].map((dx) => drum("z", [x(dx), -0.75, 0], 0.16, HULL_BACK + 0.8, HULL_BACK + 0.98, "lamp")),
    // The rotor mast.
    drum("y", [xc, 0, MAST_Z], 0.18, HULL_TOP, MAST_TOP, "ink"),
    // The tail boom, up the road, with a fin, a tailplane and a tail rotor.
    part("box", [x(-0.25), -0.15, BOOM_END], [x(0.25), 0.35, HULL_FRONT], "body", true),
    part("box", [x(-0.07), 0.35, BOOM_END], [x(0.07), 1.55, BOOM_END + 0.8], "accent"),
    part("box", [x(-0.9), 0.35, BOOM_END + 0.1], [x(0.9), 0.47, BOOM_END + 0.6], "accent"),
    // Skids: a runner each side on two struts.
    ...[-0.7, 0.7].flatMap((dx) => [
      part("box", [x(dx) - 0.07, HULL_BOTTOM - 0.5, HULL_FRONT + 0.2], [x(dx) + 0.07, HULL_BOTTOM - 0.38, HULL_BACK + 0.4], "ink"),
      part("box", [x(dx) - 0.05, HULL_BOTTOM - 0.38, -1.4], [x(dx) + 0.05, HULL_BOTTOM, -1.25], "ink"),
      part("box", [x(dx) - 0.05, HULL_BOTTOM - 0.38, 0.9], [x(dx) + 0.05, HULL_BOTTOM, 1.05], "ink"),
    ]),
  ];
  // The two rotors turn opposite ways, so the craft doesn't spin.
  const main: Rotor = {
    centre: [xc, MAST_TOP + BLADE_THICKNESS / 2, MAST_Z],
    axis: "y",
    speed: outward * MAIN_SPEED,
    radius: MAIN_ROTOR_RADIUS,
    parts: blades("y", MAIN_ROTOR_RADIUS, BLADE_WIDTH, 0.4),
  };
  const tail: Rotor = {
    centre: [x(0.07 + BLADE_THICKNESS / 2 + 0.02), 0.95, BOOM_END + 0.4],
    axis: "x",
    speed: TAIL_SPEED,
    radius: TAIL_ROTOR_RADIUS,
    parts: blades("x", TAIL_ROTOR_RADIUS, 0.16, 0.12),
  };
  return { body, main, tail };
}

export function heliModel(lanes: number): HeliModel {
  const [roadLeft, roadRight] = [-0.5, lanes - 0.5];
  const deckFront = -DECK_HALF_LENGTH;
  const deckBack = DECK_HALF_LENGTH;
  const lipBack = deckFront + LIP_DEPTH;
  const body: HeliPart[] = [];
  // A tile per lane, so the frogs can count their lanes before they jump.
  for (let lane = 0; lane < lanes; lane++) {
    body.push(part("box", [lane - 0.5, -DECK_THICKNESS, lipBack], [lane + 0.5, 0, deckBack], "deck", true));
  }
  // The lip: yellow and ink stripes set into the deck's front edge.
  const stripes = Math.round((roadRight - roadLeft) / STRIPE);
  for (let i = 0; i < stripes; i++) {
    const x0 = roadLeft + i * STRIPE;
    body.push(part("box", [x0, -DECK_THICKNESS, deckFront], [x0 + STRIPE, 0, lipBack], i % 2 === 0 ? "trim" : "ink"));
  }
  // The railing along the back edge, a post on every lane line.
  for (let i = 0; i <= lanes; i++) {
    const x = roadLeft + i;
    const [px0, px1] = [Math.max(roadLeft, x - POST / 2), Math.min(roadRight, x + POST / 2)];
    body.push(part("box", [px0, 0, deckBack - RAIL_DEPTH], [px1, RAIL_TOP - 0.1, deckBack], "trim"));
  }
  body.push(part("box", [roadLeft, RAIL_TOP - 0.1, deckBack - RAIL_DEPTH], [roadRight, RAIL_TOP, deckBack], "trim"));

  const rotors: Rotor[] = [];
  for (const outward of [-1, 1] as const) {
    const edge = outward < 0 ? roadLeft : roadRight;
    // The wing from the road's edge to the fuselage, level with the deck.
    body.push(part("box", [edge, -DECK_THICKNESS, deckFront], [edge + outward * WING_REACH, 0, deckBack], "body", true));
    const built = pod(edge + outward * (WING_REACH + POD_WIDTH / 2), outward);
    body.push(...built.body);
    rotors.push(built.main, built.tail);
  }
  return { body, rotors };
}
