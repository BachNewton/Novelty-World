import * as THREE from "three";
import { animated } from "../animate";
import { chair, chamberstick, pictureFrame, table } from "../kit";
import { lightAnchor } from "../light-anchor";
import { RAMPS, type PaletteKey } from "../palette";
import { WAINSCOT_DEPTH, WALL_HEIGHT, onWall, type RoomDefinition } from "../room";
import { shiny, SHINES } from "../shine";
import { batch, box, cylinder, flat, glow, group, lathe, textured } from "../shapes";
import { panelling, wallpaper, woodPlanks } from "../textures";

/** Where the billiard table stands, long along z: its centre on the floor. */
const TABLE_AT: [x: number, z: number] = [-0.2, -0.1];
const TABLE = { width: 1.45, length: 2.6, bed: 0.8, rail: 0.13, railTop: 0.87 };
const BALL = 0.032;
/** The playing field inside the cushions, from the table's centre. */
const FIELD = { x: TABLE.width / 2 - TABLE.rail, z: TABLE.length / 2 - TABLE.rail };

/** The cue ball, in the table's frame, which the cue lines up on. */
const CUE_BALL: [x: number, z: number] = [-0.2, 0.35];
const CUE = { length: 1.4, rise: (13 * Math.PI) / 180, gap: 0.03 };

/** A spade pip, the wallpaper's motif. */
const SPADE = ["...#...", "..###..", ".#####.", "#######", "##.#.##", "...#...", "..###.."];

/**
 * A full-size billiard table on six turned legs: a green baize bed inside
 * cushioned rails, with brass-capped corners and six pockets. Its long side
 * runs along z; the balls lie where a broken rack left them.
 */
function billiardTable(): THREE.Group {
  const { width, length, bed, rail, railTop } = TABLE;
  const wood = shiny(textured(woodPlanks({ ramp: RAMPS.wood, plankPx: 6, seed: "game-room-table", glints: false })), SHINES.polishedWood);
  const legWood = shiny(flat("woodDark"), SHINES.polishedWood);
  const result = group();
  for (const x of [-0.55, 0.55]) {
    for (const z of [-1.1, 0, 1.1]) {
      const leg = lathe(
        [
          [0, 0],
          [0.07, 0],
          [0.07, 0.05],
          [0.05, 0.08],
          [0.09, 0.22],
          [0.08, 0.36],
          [0.05, 0.46],
          [0.07, 0.6],
          [0, 0.6],
        ],
        legWood,
        8,
      );
      leg.position.set(x, 0, z);
      result.add(leg);
    }
  }
  // The carcass, its top under the bed and the rails.
  result.add(box([width - 0.06, 0.2, length - 0.06], wood, [0, 0.58, 0]));
  result.add(box([FIELD.x * 2 + 0.01, bed - 0.78, FIELD.z * 2 + 0.01], flat("verdigris"), [0, 0.78, 0]));
  const railWood = shiny(flat("woodMid"), SHINES.polishedWood);
  const railHeight = railTop - 0.78;
  result.add(
    box([width, railHeight, rail], railWood, [0, 0.78, length / 2 - rail / 2]),
    box([width, railHeight, rail], railWood, [0, 0.78, -length / 2 + rail / 2]),
    // The long rails stand between the end rails, so no two share a face's plane.
    box([rail, railHeight - 0.004, length - rail * 2 + 0.004], railWood, [width / 2 - rail / 2, 0.78, 0]),
    box([rail, railHeight - 0.004, length - rail * 2 + 0.004], railWood, [-width / 2 + rail / 2, 0.78, 0]),
  );
  const cushion = flat("verdigrisDark");
  const c = 0.04;
  result.add(
    box([FIELD.x * 2 - 0.01, 0.045, c], cushion, [0, bed, FIELD.z - c / 2 + 0.003]),
    box([FIELD.x * 2 - 0.01, 0.045, c], cushion, [0, bed, -FIELD.z + c / 2 - 0.003]),
    box([c, 0.043, FIELD.z * 2 - 0.09], cushion, [FIELD.x - c / 2 + 0.003, bed, 0]),
    box([c, 0.043, FIELD.z * 2 - 0.09], cushion, [-FIELD.x + c / 2 - 0.003, bed, 0]),
  );
  const brass = shiny(flat("brass"), SHINES.brass);
  const pocket = flat("void");
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      result.add(box([0.17, railHeight + 0.006, 0.17], brass, [sx * (width / 2 - 0.08), 0.776, sz * (length / 2 - 0.08)]));
      result.add(cylinder(0.065, 0.1, pocket, [sx * FIELD.x, railTop - 0.09, sz * FIELD.z], { sides: 8 }));
    }
    result.add(cylinder(0.06, 0.1, pocket, [sx * (FIELD.x + 0.02), railTop - 0.09, 0], { sides: 8 }));
  }
  // Ivory diamonds set into the rail tops, a centimetre proud so they read.
  const sights = batch();
  for (const sx of [-1, 1]) {
    for (const z of [-0.78, -0.39, 0.39, 0.78]) sights.block([0.03, 0.01, 0.03], "boneLight", [sx * (width / 2 - rail / 2), railTop - 0.004, z]);
  }
  for (const sz of [-1, 1]) {
    for (const x of [-0.3, 0, 0.3]) sights.block([0.03, 0.01, 0.03], "boneLight", [x, railTop - 0.004, sz * (length / 2 - rail / 2)]);
  }
  result.add(sights.mesh());
  const balls: [x: number, z: number, colour: PaletteKey][] = [
    [CUE_BALL[0], CUE_BALL[1], "boneLight"],
    [0.18, -0.42, "scarlet"],
    [0.27, -0.55, "gold"],
    [0.05, -0.62, "void"],
    [0.4, -0.2, "bruiseLight"],
    [-0.12, -0.8, "ember"],
    [0.33, -0.9, "moon"],
    [-0.35, -0.35, "bloodLight"],
    [0.1, 0.62, "gold"],
    [0.45, 0.95, "scarlet"],
  ];
  for (const [x, z, colour] of balls) {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL, 10, 7), shiny(flat(colour), SHINES.glazedChina));
    ball.position.set(x, bed + BALL, z);
    result.add(ball);
  }
  // A cube of blue chalk left on the rail.
  result.add(box([0.035, 0.03, 0.035], flat("moonLight"), [-width / 2 + rail / 2, railTop - 0.004, 0.62]));
  return result;
}

/**
 * The cue no one holds, its tip at the origin aimed along +x at the cue
 * ball, its butt raised over the rail. It draws back, waggles through three
 * practice strokes and strikes, and stops a hair short of the ball. It casts
 * no shadow, and is lit by its probe as every moving piece is.
 */
function ghostCue(): THREE.Group {
  const shaft = new THREE.CylinderGeometry(0.014, 0.02, CUE.length * 0.62, 6);
  shaft.rotateZ(Math.PI / 2);
  shaft.translate(-CUE.length * 0.31, 0, 0);
  const butt = new THREE.CylinderGeometry(0.02, 0.028, CUE.length * 0.38, 6);
  butt.rotateZ(Math.PI / 2);
  butt.translate(-CUE.length * 0.81, 0, 0);
  const ferrule = new THREE.CylinderGeometry(0.0145, 0.0145, 0.03, 6);
  ferrule.rotateZ(Math.PI / 2);
  ferrule.translate(-0.01, 0, 0);
  const ring = new THREE.CylinderGeometry(0.022, 0.022, 0.03, 6);
  ring.rotateZ(Math.PI / 2);
  ring.translate(-CUE.length * 0.62, 0, 0);
  const stroke = group(
    new THREE.Mesh(shaft, shiny(flat("boneDark"), SHINES.polishedWood)),
    new THREE.Mesh(butt, shiny(flat("woodDark"), SHINES.polishedWood)),
    new THREE.Mesh(ferrule, flat("boneLight")),
    new THREE.Mesh(ring, shiny(flat("brass"), SHINES.brass)),
  );
  const ease = (t: number) => t * t * (3 - 2 * t);
  const tilt = group(
    animated(stroke, (seconds) => {
      const p = (seconds / 5) % 1;
      let back: number;
      if (p < 0.2) back = 0.08 * ease(p / 0.2);
      else if (p < 0.75) back = 0.08 + 0.06 * Math.sin(((p - 0.2) / 0.55) * Math.PI * 3) ** 2;
      else if (p < 0.82) back = 0.08 + 0.1 * ease((p - 0.75) / 0.07);
      else if (p < 0.845) back = 0.18 * (1 - (p - 0.82) / 0.025);
      else back = 0;
      stroke.position.x = -back;
    }),
  );
  tilt.rotation.z = -CUE.rise;
  // It moves, so a shadow baked where it was built would stay put while it strokes.
  tilt.traverse((child) => {
    child.userData.noShadow = true;
  });
  return group(tilt);
}

/**
 * A billiard lamp hung low on two rods from the ceiling (its origin on the
 * floor below it): a brass bar along z carrying two broad brass shades, each
 * with its lamp, throwing a pool of light down onto the baize.
 */
function billiardLamp(): THREE.Group {
  const brass = shiny(flat("brass"), SHINES.brass);
  const shadeBottom = 1.45;
  const barY = shadeBottom + 0.26;
  const result = group(box([0.04, 0.04, 1.5], brass, [0, barY, 0]));
  for (const z of [-0.5, 0.5]) {
    result.add(cylinder(0.008, WALL_HEIGHT - barY - 0.03, brass, [0, barY + 0.02, z], { sides: 4 }));
    result.add(cylinder(0.04, 0.02, brass, [0, WALL_HEIGHT - 0.02, z], { sides: 6 }));
  }
  for (const z of [-0.6, 0.6]) {
    result.add(
      cylinder(0.012, 0.06, brass, [0, shadeBottom + 0.2, z], { sides: 4 }),
      // Amber glass, lit from inside: from above, the lamp reads by its shades.
      cylinder(0.24, 0.2, shiny(glow("ember"), SHINES.glass), [0, shadeBottom, z], { top: 0.07, sides: 10 }),
      cylinder(0.08, 0.03, brass, [0, shadeBottom + 0.19, z], { top: 0.05, sides: 10 }),
      cylinder(0.25, 0.025, brass, [0, shadeBottom - 0.005, z], { top: 0.235, sides: 10 }),
      cylinder(0.22, 0.01, glow("amber"), [0, shadeBottom - 0.015, z], { sides: 10 }),
      cylinder(0.06, 0.06, glow("flame"), [0, shadeBottom - 0.07, z], { top: 0.04, sides: 6 }),
    );
  }
  result.traverse((child) => {
    child.userData.noShadow = true;
  });
  for (const z of [-0.6, 0.6]) {
    result.add(lightAnchor({ colour: "amber", intensity: 6, range: 8, flicker: 0.05 }, [0, shadeBottom - 0.12, z]));
  }
  return result;
}

/** A card table's top dealt for four, one hand turned face up and fanned at
 *  the empty place (+z), the deck squared in the middle. Lies on the table top. */
function dealtCards(): THREE.Mesh {
  const b = batch();
  const backs: [x: number, z: number][] = [
    [0, -0.27],
    [-0.27, 0],
    [0.27, 0],
  ];
  for (const [x, z] of backs) {
    for (let i = 0; i < 3; i++) b.block([0.07, 0.004, 0.1], "bloodDark", [x + (i - 1) * 0.05 * (z === 0 ? 0 : 1), 0.001 + i * 0.005, z + (i - 1) * 0.05 * (z === 0 ? 1 : 0)]);
  }
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Matrix4()
      .makeTranslation(0, 0.003 + i * 0.005, 0.25)
      .multiply(new THREE.Matrix4().makeRotationY((i - 2) * 0.28))
      .multiply(new THREE.Matrix4().makeTranslation(0, 0, -0.03));
    b.add([0.07, 0.004, 0.1], "boneLight", m);
    b.add([0.025, 0.003, 0.03], "void", m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.0035, 0)));
  }
  b.block([0.072, 0.03, 0.102], "bloodDark", [0, 0.001, 0]);
  return b.mesh();
}

/** A wall rack of cues, origin at its bottom on the wall: a back board, a
 *  cupped ledge and a notched top bar, one slot standing empty. */
function cueRack(): THREE.Group {
  const result = group(
    // Deeper than the panelling and shallower than the chair rail, so its face lies in neither's plane.
    box([0.62, 1.4, WAINSCOT_DEPTH + 0.015], flat("woodDark"), [0, 0, (WAINSCOT_DEPTH + 0.015) / 2]),
    box([0.66, 0.06, 0.12], flat("woodMid"), [0, 0.04, 0.09]),
    box([0.66, 0.05, 0.08], flat("woodMid"), [0, 1.18, 0.07]),
  );
  const cues = batch();
  [-0.24, -0.12, 0, 0.12, 0.24].forEach((x, i) => {
    if (i === 2) return;
    cues.block([0.022, 1.36, 0.022], i % 2 === 0 ? "boneDark" : "woodLight", [x, 0.1, 0.09]);
    cues.block([0.03, 0.5, 0.03], "woodDark", [x, 0.1, 0.09]);
  });
  result.add(cues.mesh());
  return result;
}

/** A marking board for the score, origin at its bottom on the wall: two
 *  brass rods of ivory beads in a wooden frame. */
function scoreBoard(): THREE.Group {
  const result = group(
    box([0.9, 0.5, 0.03], flat("woodMid"), [0, 0, 0.015]),
    box([0.8, 0.4, 0.02], flat("soot"), [0, 0.05, 0.03]),
  );
  const beads = batch();
  for (const [y, count] of [
    [0.16, 7],
    [0.34, 3],
  ] as const) {
    beads.block([0.76, 0.012, 0.012], "brass", [0, y - 0.006, 0.055]);
    for (let i = 0; i < 10; i++) {
      const x = i < count ? -0.35 + i * 0.045 : 0.35 - (9 - i) * 0.045;
      beads.block([0.035, 0.04, 0.035], i < count ? "boneLight" : "boneDark", [x, y - 0.02, 0.055]);
    }
  }
  result.add(beads.mesh());
  return result;
}

/** A low leather settee for those watching the play, its back to the wall:
 *  it faces +z, buttoned along its back. */
function settee(): THREE.Group {
  const leather = flat("bloodDark");
  const legs = flat("woodDark");
  const length = 1.6;
  const result = group(
    box([length - 0.2, 0.16, 0.48], leather, [0, 0.12, 0.02]),
    box([length - 0.24, 0.08, 0.44], flat("blood"), [0, 0.28, 0.04]),
    box([length, 0.5, 0.14], leather, [0, 0.3, -0.18]),
  );
  for (const sx of [-1, 1]) {
    result.add(box([0.12, 0.5, 0.56], leather, [sx * (length / 2 - 0.055), 0.12, 0]));
    for (const z of [-0.2, 0.22]) result.add(box([0.06, 0.12, 0.06], legs, [sx * (length / 2 - 0.08), 0, z]));
  }
  const buttons = batch();
  for (let i = 0; i < 9; i++) {
    for (const y of [0.48, 0.66]) buttons.block([0.03, 0.03, 0.02], "void", [-0.64 + i * 0.16 + (y > 0.6 ? 0.08 : 0), y, -0.105]);
  }
  result.add(buttons.mesh());
  return result;
}

/** A playing card's spade, framed, to hang over the cue rack's wall. */
const SPADE_ART = {
  rows: [
    "bbbbbbbbbbbb",
    "bbbbbsbbbbbb",
    "bbbbsssbbbbb",
    "bbbsssssbbbb",
    "bbsssssssbbb",
    "bsssssssssbb",
    "bsssssssssbb",
    "bbsssssssbbb",
    "bbbbbsbbbbbb",
    "bbbbsssbbbbb",
    "bbbbbbbbbbbb",
    "bbbbbbbbbbbb",
    "bbbbbbbbbbbb",
    "bbbbbbbbbbbb",
  ],
  legend: { b: "boneDark", s: "void" },
} as const;

/** The Game Room: a green baize billiard table under a low pair of lamps, a
 *  game in play, with a cue that strokes and strikes on its own. */
export const GAME_ROOM: RoomDefinition = {
  id: "game-room",
  floor: () => woodPlanks({ seed: "game-room", glints: false }),
  wall: () => wallpaper({ ground: "brickDark", stripe: "bloodDark", motif: "brick", pattern: SPADE, seed: "game-room" }),
  wainscot: () => panelling({ ramp: RAMPS.wood, seed: "game-room", glints: false }),
  trim: "woodDark",
  props: [
    { build: billiardTable, at: TABLE_AT },
    { build: billiardLamp, at: TABLE_AT },
    {
      build: ghostCue,
      at: [TABLE_AT[0] + CUE_BALL[0] - BALL - CUE.gap, TABLE_AT[1] + CUE_BALL[1]],
      y: TABLE.bed + BALL,
    },
    { build: () => table({ length: 0.8, width: 0.8, height: 0.72 }), name: "card table", at: [2.05, 2.0] },
    { build: dealtCards, at: [2.05, 2.0], y: 0.72 },
    { build: () => chamberstick({ height: 0.05, intensity: 1.5, range: 5, lift: 0.25 }), name: "card candle", at: [2.3, 1.75], y: 0.72 },
    { build: () => chair({ cushion: "verdigrisDark" }), name: "card chair", at: [2.05, 1.38] },
    { build: () => chair({ cushion: "verdigrisDark" }), name: "card chair", at: [2.55, 2.0], turn: -90 },
    { build: () => chair({ cushion: "verdigrisDark" }), name: "pushed-back chair", at: [1.28, 2.4], turn: 65 },
    { build: cueRack, ...onWall("left", 1.2, { y: 0.7 }) },
    { build: settee, ...onWall("left", -1.3, { out: 0.32 }) },
    { build: scoreBoard, ...onWall("left", -1.3, { y: 1.4 }) },
    { build: () => pictureFrame({ picture: { name: "spade", shape: "rect", ...SPADE_ART }, frame: "woodMid" }), name: "spade picture", ...onWall("top", -1.7, { y: 1.35 }) },
  ],
  focus: [-0.2, 0.9, 0],
  prime: [1.7, -1.0],
  // Round the billiard table's right side, with a way in from each doorway,
  // and out along both ends to the left side, which the cue's butt crosses.
  lanes: [
    [[-1.6, -1.85], [0, -1.85], [1.0, -1.85], [1.0, 0], [1.0, 1.65], [0, 1.65], [-1.6, 1.65]],
    [[0, -2.2], [0, -1.85]],
    [[2.2, 0], [1.0, 0]],
    [[0, 2.2], [0, 1.65]],
  ],
};
