import * as THREE from "three";
import { animated } from "../animate";
import { cobweb, strand, TWIST } from "../kit";
import { solidLathe } from "../kit/vessel";
import { lightAnchor } from "../light-anchor";
import { paletteHex, type PaletteKey } from "../palette";
import { CUT_HEIGHT, WALL_HEIGHT, onWall, type RoomDefinition } from "../room";
import { shiny, SHINES } from "../shine";
import { batch, box, cylinder, flat, glow, group, lightMaterial, type Batch } from "../shapes";
import { panelling, plaster, woodPlanks } from "../textures";

const SEED = "gymnasium";

/** The vaulting horse's middle on the floor, and its turn. */
const HORSE = { at: [-0.45, 0.25] as [x: number, z: number], turn: 14 };
const ROPE = { thick: 0.045, colour: "boneDark" as PaletteKey };
/**
 * The climbing ropes: where each hangs from the ceiling, in room metres, how
 * far above the boards its knotted end hangs, and how far behind the first it
 * swings, in seconds.
 */
const ROPES: { at: [x: number, z: number]; end: number; lag: number }[] = [
  { at: [-2.0, -1.45], end: 0.3, lag: 0 },
  { at: [-1.45, -1.95], end: 0.45, lag: 1.1 },
  { at: [-0.95, -1.55], end: 0.22, lag: 2.3 },
];
/**
 * The draught no one feels that swings the ropes: one heading for all three,
 * a slow, heavy period, and how far, in radians, it swings a rope at its
 * strongest; it swells and slackens over a longer breath. Indoors the air is
 * still (`wind.ts`), so nothing else in the room stirs.
 */
const DRAUGHT = { heading: 0.6, period: 7.5, swing: 0.075, breath: 23 };
/**
 * The unseen presence among the ropes: where it stands on the boards, in room
 * metres (between the three ropes, a little towards the room from the
 * corner's bonus badge), and the height its teal light falls from. Nothing
 * there is drawn: only its light on the ropes and the boards shows it.
 */
const PRESENCE = { at: [-1.45, -1.6] as [x: number, z: number], height: 1.15 };
const WALL_BARS = { along: -1.05, bays: 2, bay: 0.9, top: 2.6, rung: 0.15 };

/** The ceiling's iron eye a rope hangs from, its origin at the ceiling. */
function ceilingEye(b: Batch): void {
  b.block([0.14, 0.03, 0.14], "soot", [0, WALL_HEIGHT - 0.035, 0]);
  b.block([0.06, 0.06, 0.06], "soot", [0, WALL_HEIGHT - 0.09, 0]);
}

/** A rope hanging straight down `length` from the origin, as a run of short twisted lengths, its knot at the bottom. */
function ropeLength(length: number, knot: boolean): THREE.Mesh {
  const b = batch();
  const steps = Math.max(1, Math.round(length / 0.35));
  for (let i = 0; i < steps; i++) strand(b, new THREE.Vector3(0, -(length * i) / steps, 0), new THREE.Vector3(0, -(length * (i + 1)) / steps, 0), ROPE.thick, ROPE.colour, (i % 2) * TWIST);
  if (knot) b.block([0.09, 0.11, 0.09], ROPE.colour, [0, -length - 0.04, 0]);
  return b.mesh();
}

/**
 * A climbing rope hung from the ceiling, ending in a knot above the boards,
 * swinging slowly in a draught that stirs nothing else: hinged at the ceiling,
 * its lower half hinged again a beat behind, so its foot swings furthest and
 * it bends as a heavy rope does. Origin on the floor under its ceiling eye.
 */
function swayingRope(end: number, lag: number): THREE.Group {
  const top = WALL_HEIGHT - 0.08;
  const upper = (top - end) * 0.55;
  const lower = top - end - upper;
  const eye = batch();
  ceilingEye(eye);
  const foot = group(ropeLength(lower, true));
  foot.position.y = -upper;
  const rope = group(ropeLength(upper, false), foot);
  rope.position.y = top;
  const axis = new THREE.Vector3(Math.cos(DRAUGHT.heading), 0, -Math.sin(DRAUGHT.heading));
  const swing = (seconds: number, behind: number) => {
    const t = seconds - lag - behind;
    const strength = DRAUGHT.swing * (0.75 + 0.25 * Math.sin((2 * Math.PI * t) / DRAUGHT.breath));
    return strength * Math.sin((2 * Math.PI * t) / DRAUGHT.period);
  };
  animated(rope, (seconds) => {
    rope.quaternion.setFromAxisAngle(axis, swing(seconds, 0));
    foot.quaternion.setFromAxisAngle(axis, 0.6 * swing(seconds, 0.7));
  });
  // It moves, so a shadow baked where it hung when built would stay put while it swings.
  rope.traverse((child) => {
    child.userData.noShadow = true;
  });
  return group(eye.mesh(), rope);
}

/** Spectral teal on a geometry's vertices, `strength` of the full colour times `fall` of each vertex. */
function spectreColours(geometry: THREE.BufferGeometry, strength: number, fall: (x: number, y: number, z: number) => number): void {
  const position = geometry.getAttribute("position");
  const colour = new THREE.Color(paletteHex("spectre")).multiplyScalar(strength);
  const colours = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const f = fall(position.getX(i), position.getY(i), position.getZ(i));
    colours.set([colour.r * f, colour.g * f, colour.b * f], i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
}

/** A soft round pool of spectral teal on the boards under the presence, fading out from its middle; it has no source. Lies flat, its middle at the origin. */
function presencePool(): THREE.Mesh {
  const reach = 0.8;
  // A disc in rings, so the fall grades across it rather than from one middle vertex.
  const geometry = new THREE.RingGeometry(0, reach, 20, 6).rotateX(-Math.PI / 2).translate(0, 0.012, 0);
  spectreColours(geometry, 0.28, (x, _y, z) => Math.max(0, 1 - Math.hypot(x, z) / reach) ** 1.6);
  const mesh = new THREE.Mesh(geometry, lightMaterial(1, { vertexColors: true }));
  mesh.userData.noShadow = true;
  return mesh;
}

/**
 * A vaulting horse: a long leather barrel on four splayed legs braced by
 * stretchers, iron collars where the legs telescope, two wooden pommels on
 * its back and its leather split at one end. Long along x.
 */
function vaultingHorse(): THREE.Group {
  const length = 1.6;
  const [middle, radius, squash] = [1.0, 0.18, 0.83];
  const barrel = new THREE.CylinderGeometry(radius, radius, length, 10);
  barrel.rotateZ(Math.PI / 2);
  barrel.scale(1, squash, 1);
  barrel.translate(0, middle, 0);
  const top = middle + radius * squash;
  const result = group(new THREE.Mesh(barrel, flat("brick")));
  for (const sx of [-1, 1]) {
    const cap = new THREE.CylinderGeometry(radius * 0.86, radius * 0.86, 0.04, 10);
    cap.rotateZ(Math.PI / 2);
    cap.scale(1, squash, 1);
    cap.translate(sx * (length / 2 + 0.01), middle, 0);
    result.add(new THREE.Mesh(cap, flat("woodDark")));
  }
  const pommel = shiny(flat("woodMid"), SHINES.polishedWood);
  for (const x of [-0.22, 0.22]) {
    for (const z of [-0.09, 0.09]) result.add(box([0.035, 0.17, 0.035], pommel, [x, top - 0.05, z]));
    result.add(box([0.045, 0.045, 0.24], pommel, [x, top + 0.1, 0]));
  }
  // The leather split along the top at the near end, its horsehair stuffing showing.
  result.add(box([0.16, 0.02, 0.05], flat("boneDark"), [-0.6, top - 0.012, 0.02]));
  const b = batch();
  const footY = 0.035;
  const leg = (sx: number, sz: number, t: number) => new THREE.Vector3(sx * (0.55 + 0.11 * t), 0.9 - (0.9 - footY) * t, sz * (0.1 + 0.22 * t));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      strand(b, leg(sx, sz, 0), leg(sx, sz, 1), 0.07, "woodDark");
      strand(b, leg(sx, sz, 0.4), leg(sx, sz, 0.5), 0.09, "soot", TWIST);
    }
    // The stretcher across each end, between its pair of legs.
    const t = (0.9 - 0.3) / (0.9 - footY);
    strand(b, leg(sx, -1, t), leg(sx, 1, t), 0.05, "wood");
  }
  const t = (0.9 - 0.3) / (0.9 - footY);
  strand(b, new THREE.Vector3(-(0.55 + 0.11 * t), 0.32, 0), new THREE.Vector3(0.55 + 0.11 * t, 0.32, 0), 0.05, "wood", TWIST);
  result.add(b.mesh());
  return result;
}

/** Swedish wall bars, one bay `bay` wide per bay: stiles off the wall and round rungs between them, from `from` up to `to` (heights above where it is placed). Faces +z, its back off the wall. */
function wallBarRun(from: number, to: number, firstRung: number, stile = 0.07): THREE.Mesh {
  const { bays, bay, rung } = WALL_BARS;
  const b = batch();
  for (let i = 0; i <= bays; i++) b.block([stile, to - from, stile], "woodMid", [(i - bays / 2) * bay, from, 0.1]);
  for (let y = firstRung; y < to - 0.02; y += rung) {
    for (let i = 0; i < bays; i++) b.block([bay - 0.06, 0.035, 0.035], "woodLight", [(i + 0.5 - bays / 2) * bay, y - 0.0175, 0.1]);
  }
  return b.mesh();
}

/** The wall bars' foot, up to the cut height: what stays when their wall is cut. Its stiles are a hair thinner, so where they lap into the stiles above no two faces share a plane. Faces +z. */
function wallBarsBase(): THREE.Mesh {
  return wallBarRun(0, CUT_HEIGHT + 0.003, WALL_BARS.rung, 0.064);
}

/** The wall bars above the cut height, hung on the wall. Faces +z. */
function wallBarsAbove(): THREE.Mesh {
  return wallBarRun(0, WALL_BARS.top - CUT_HEIGHT, 0.0);
}

/** An Indian club, turned and polished, standing on its broad end. Base at y = 0. */
function indianClub(colour: PaletteKey, scale = 1): THREE.Mesh {
  const profile: [number, number][] = [
    [0.035, 0],
    [0.05, 0.03],
    [0.058, 0.12],
    [0.05, 0.22],
    [0.03, 0.32],
    [0.018, 0.38],
    [0.018, 0.42],
    [0.03, 0.44],
    [0.02, 0.465],
  ];
  return solidLathe(
    profile.map(([r, y]) => [r * scale, y * scale]),
    shiny(flat(colour), SHINES.polishedWood),
    8,
  );
}

/**
 * A stand of Indian clubs against the wall: a low plinth, the clubs in pairs
 * of graded sizes on it, held at the neck by a rail between two posts; one
 * pair's places stand empty. Faces +z.
 */
function clubStand(): THREE.Group {
  const wood = flat("woodDark");
  const result = group(
    box([1.0, 0.08, 0.3], wood, [0, 0, 0.17]),
    box([0.05, 0.5, 0.05], wood, [-0.475, 0.08, 0.1]),
    box([0.05, 0.5, 0.05], wood, [0.475, 0.08, 0.1]),
    box([0.98, 0.04, 0.04], flat("wood"), [0, 0.42, 0.1]),
  );
  const pairs: [x: number, scale: number, colour: PaletteKey][] = [
    [-0.36, 1.05, "woodMid"],
    [-0.12, 0.95, "bloodLight"],
    [0.36, 0.8, "woodLight"],
  ];
  for (const [x, scale, colour] of pairs) {
    for (const dx of [-0.05, 0.05]) {
      const club = indianClub(colour, scale);
      club.position.set(x + dx, 0.08, 0.13);
      result.add(club);
    }
  }
  return result;
}

/** A leather medicine ball, its seams a darker band round it. Base at y = 0. */
function medicineBall(radius: number, leather: PaletteKey): THREE.Group {
  const ball = new THREE.Mesh(new THREE.SphereGeometry(radius, 10, 7), flat(leather));
  ball.position.y = radius;
  const seam = cylinder(radius + 0.006, 0.025, flat("woodDark"), [0, radius - 0.0125, 0], { sides: 10 });
  return group(ball, seam);
}

/** An iron dumbbell along x: two balls on a short grip. Base at y = 0. */
function dumbbell(bell: number): THREE.Group {
  const iron = shiny(flat("ash"), SHINES.iron);
  const grip = new THREE.CylinderGeometry(0.016, 0.016, bell * 3, 6);
  grip.rotateZ(Math.PI / 2);
  grip.translate(0, bell, 0);
  const result = group(new THREE.Mesh(grip, iron));
  for (const sx of [-1, 1]) {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(bell, 8, 6), iron);
    ball.position.set(sx * bell * 1.6, bell, 0);
    result.add(ball);
  }
  return result;
}

/** A long gymnasium form against the wall, two medicine balls and a pair of dumbbells left on it. Faces +z. */
function form(): THREE.Group {
  const wood = flat("wood");
  const result = group(box([1.5, 0.05, 0.3], flat("woodMid"), [0, 0.42, 0.2]));
  for (const x of [-0.6, 0.6]) {
    result.add(box([0.05, 0.42, 0.26], wood, [x, 0, 0.2]));
    result.add(box([0.07, 0.06, 0.3], wood, [x, 0, 0.2]));
  }
  result.add(box([1.2, 0.05, 0.04], wood, [0, 0.16, 0.2]));
  const big = medicineBall(0.15, "woodMid");
  big.position.set(-0.45, 0.47, 0.2);
  const small = medicineBall(0.12, "brickDark");
  small.position.set(-0.13, 0.47, 0.22);
  const bells = [dumbbell(0.05), dumbbell(0.05)];
  bells[0].position.set(0.3, 0.47, 0.15);
  bells[1].position.set(0.42, 0.47, 0.27);
  bells[1].rotation.y = 0.5;
  result.add(big, small, ...bells);
  return result;
}

/** A low rack of graded dumbbells against the wall, on two shelves. Faces +z. */
function dumbbellRack(): THREE.Group {
  const wood = flat("woodDark");
  const result = group(
    box([0.86, 0.04, 0.36], wood, [0, 0.06, 0.2]),
    box([0.86, 0.04, 0.26], wood, [0, 0.3, 0.15]),
  );
  for (const x of [-0.43, 0.43]) result.add(box([0.04, 0.38, 0.37], wood, [x, 0, 0.2]));
  const sizes = [0.07, 0.065, 0.06, 0.05];
  sizes.forEach((bell, i) => {
    const low = dumbbell(bell);
    low.rotation.y = Math.PI / 2;
    low.position.set(-0.3 + i * 0.2, 0.1, 0.21);
    result.add(low);
  });
  [0.045, 0.04, 0.035].forEach((bell, i) => {
    const high = dumbbell(bell);
    high.rotation.y = Math.PI / 2;
    high.position.set(-0.25 + i * 0.2, 0.34, 0.15);
    result.add(high);
  });
  return result;
}

/** A gas pendant hung on a rod from the ceiling (its origin on the floor below): a brass gallery holding a frosted globe, lit. */
function gasPendant(): THREE.Group {
  const brass = shiny(flat("brass"), SHINES.brass);
  const globeY = 2.45;
  const result = group(
    cylinder(0.05, 0.02, brass, [0, WALL_HEIGHT - 0.02, 0], { sides: 8 }),
    cylinder(0.012, WALL_HEIGHT - globeY - 0.14, brass, [0, globeY + 0.12, 0], { sides: 4 }),
    cylinder(0.07, 0.05, brass, [0, globeY + 0.08, 0], { top: 0.03, sides: 8 }),
  );
  const globe = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 7), glow("flame"));
  globe.position.y = globeY;
  result.add(globe);
  result.traverse((child) => {
    child.userData.noShadow = true;
  });
  result.add(lightAnchor({ colour: "amber", intensity: 8, range: 10, flicker: 0.04, kind: "lamp" }, [0, globeY - 0.02, 0]));
  return result;
}

/** A gas bracket on the wall, its origin at the backplate: an arm out to a small frosted globe, lit. Faces +z. */
function gasBracket(): THREE.Group {
  const brass = shiny(flat("brass"), SHINES.brass);
  const result = group(
    box([0.08, 0.14, 0.02], brass, [0, -0.07, 0.01]),
    box([0.025, 0.025, 0.24], brass, [0, -0.02, 0.13]),
    cylinder(0.035, 0.05, brass, [0, -0.01, 0.24], { sides: 8 }),
  );
  const globe = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), glow("flame"));
  globe.position.set(0, 0.1, 0.24);
  result.add(globe);
  result.traverse((child) => {
    child.userData.noShadow = true;
  });
  result.add(lightAnchor({ colour: "amber", intensity: 2.5, range: 6, flicker: 0.04, kind: "lamp" }, [0, 0.12, 0.3]));
  return result;
}

/** A pair of Indian clubs crossed on a board, a capping strip along its top, hung as a trophy, its origin at the board's foot against the wall. Faces +z. */
function clubTrophy(): THREE.Group {
  const result = group(box([0.36, 0.5, 0.025], flat("woodDark"), [0, 0, 0.0125]), box([0.26, 0.06, 0.03], flat("woodMid"), [0, 0.5, 0.015]));
  for (const [side, colour] of [
    [-1, "bloodLight"],
    [1, "woodLight"],
  ] as const) {
    const club = indianClub(colour, 1.1);
    club.rotation.z = side * 0.5;
    club.position.set(side * 0.13, 0.02, 0.07);
    result.add(club);
  }
  return result;
}

/** The Gymnasium: a worn leather vaulting horse under a frosted gas globe,
 *  climbing ropes beside it swinging slowly in a draught that stirs nothing
 *  else, and among them spectral teal falling on the ropes and the boards
 *  from nowhere, as if someone unseen stood there. */
export const GYMNASIUM: RoomDefinition = {
  id: "gymnasium",
  floor: () => woodPlanks({ ramp: ["woodDark", "wood", "woodMid", "woodLight"], plankPx: 5, seed: SEED, glints: false }),
  wall: () => plaster({ ramp: ["ash", "stoneDark", "stoneDark"], seed: SEED }),
  wainscot: () => panelling({ ramp: ["woodDark", "wood", "woodMid"], panelPx: 8, seed: SEED, glints: false }),
  trim: "woodDark",
  props: [
    { build: vaultingHorse, at: HORSE.at, turn: HORSE.turn },
    { build: gasPendant, at: HORSE.at },
    ...ROPES.map(({ at, end, lag }) => ({ build: () => swayingRope(end, lag), name: "climbing rope", at })),
    { build: presencePool, at: PRESENCE.at },
    { build: wallBarsBase, ...onWall("left", WALL_BARS.along) },
    { build: wallBarsAbove, ...onWall("left", WALL_BARS.along, { y: CUT_HEIGHT }) },
    { build: form, ...onWall("top", 0.15) },
    { build: gasBracket, ...onWall("top", 1.3, { y: 1.95 }) },
    { build: clubStand, ...onWall("bottom", 1.4) },
    { build: dumbbellRack, ...onWall("left", 0.75) },
    { build: clubTrophy, ...onWall("top", -0.9, { y: 1.3 }) },
    { build: () => cobweb({ form: "slung" }), name: "cobweb", at: [-2.55, -2.55], y: WALL_HEIGHT - 0.2, turn: 45, walls: ["left", "top"] },
  ],
  focus: [-0.6, 1.0, -0.6],
  prime: [1.3, -0.85],
  lights: [{ at: [PRESENCE.at[0], PRESENCE.height, PRESENCE.at[1]], colour: "spectre", intensity: 3.5, range: 5, flicker: 0.1, signal: 2, kind: "glow" }],
  // Under the swinging ropes, so no figure stands where they sweep.
  keepClear: [
    { from: ROPES[0].at, to: ROPES[2].at, radius: 0.45 },
    { from: ROPES[1].at, to: ROPES[1].at, radius: 0.4 },
  ],
};
