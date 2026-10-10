import * as THREE from "three";
import { animated } from "../animate";
import { chair, cobweb, lantern } from "../kit";
import { crossCorners } from "../kit/wall-mass";
import { paletteHex, RAMPS } from "../palette";
import { crossLanes, INNER, type RoomDefinition } from "../room";
import { batch, group, lightMaterial, pixelPlane, type Batch } from "../shapes";
import { panelling, pixelTexture, TEXELS_PER_METRE, wallpaper, woodPlanks } from "../textures";

const SEED = "dusty-hallway";
/** The corridors run this far either side of the middle; the corners are solid wall. */
const ARM = 1.3;
const SURFACES = {
  wall: () => wallpaper({ ground: "boneDark", stripe: "stoneDark", motif: "stone", seed: SEED }),
  wainscot: () => panelling({ ramp: RAMPS.stone, seed: SEED }),
  trim: "ash",
} satisfies Pick<RoomDefinition, "wall" | "wainscot" | "trim">;

/** Where the lantern was set down, in the corner of the crossing, and the footprints end. */
const LANTERN: [number, number] = [-1.0, 1.0];

/** A dust sheet thrown over a block of furniture: the draped block, a skirt
 *  flaring where it reaches the floor, and a few folds down its faces. */
function drape(b: Batch, [w, h, d]: [number, number, number], [x, y, z]: [number, number, number], { skirt = true } = {}) {
  b.block([w, h, d], "bone", [x, y, z]);
  b.block([w - 0.06, 0.03, d - 0.06], "boneLight", [x, y + h - 0.005, z]);
  if (skirt && y === 0) b.block([w + 0.05, 0.14, d + 0.05], "boneDark", [x, 0, z]);
  for (const along of [-0.3, 0.12, 0.36]) {
    b.block([0.035, h * 0.7, 0.02], "boneLight", [x + along * w, y + h * 0.05, z + d / 2 + 0.008]);
    b.block([0.02, h * 0.6, 0.03], "boneDark", [x + w / 2 + 0.008, y + h * 0.1, z + along * d]);
  }
}

/** An armchair under a dust sheet, facing +z. */
function sheetedArmchair(): THREE.Group {
  const b = batch();
  drape(b, [0.78, 0.46, 0.72], [0, 0, 0]);
  drape(b, [0.78, 0.5, 0.22], [0, 0.46, -0.25], { skirt: false });
  for (const x of [-0.32, 0.32]) drape(b, [0.15, 0.2, 0.6], [x, 0.46, 0.04], { skirt: false });
  return group(b.mesh());
}

/** A long sideboard under a dust sheet, with a covered vase on it, facing +z. */
function sheetedSideboard(): THREE.Group {
  const b = batch();
  drape(b, [1.05, 0.84, 0.38], [0, 0, 0]);
  drape(b, [0.2, 0.3, 0.18], [0.25, 0.84, 0], { skirt: false });
  return group(b.mesh());
}

/** A longcase clock under a dust sheet, its hood a little wider, facing +z. */
function sheetedClock(): THREE.Group {
  const b = batch();
  drape(b, [0.46, 1.42, 0.34], [0, 0, 0]);
  drape(b, [0.54, 0.34, 0.4], [0, 1.42, 0], { skirt: false });
  return group(b.mesh());
}

/** A hall bench under a dust sheet, facing +z. */
function sheetedBench(): THREE.Group {
  const b = batch();
  drape(b, [0.95, 0.42, 0.36], [0, 0, 0]);
  return group(b.mesh());
}

/** A dust sheet that has slid off the chair beside it into a heap on the floor. */
function fallenSheet(): THREE.Group {
  const b = batch();
  // Its folds' tops stay out of the planes of the house's choice glow, which they would fight.
  b.block([0.62, 0.048, 0.44], "bone", [0, 0, 0]);
  b.block([0.4, 0.09, 0.3], "boneLight", [0.06, 0.04, -0.03]);
  b.block([0.22, 0.12, 0.2], "bone", [-0.12, 0.08, 0.04]);
  b.block([0.5, 0.027, 0.12], "boneDark", [0.02, 0, 0.26]);
  return group(b.mesh());
}

/** One footprint, toes towards +x: the heel, a gap, the ball of the foot. */
const PRINT = [".##..###", "###.####", ".##..###"];

/**
 * A trail of footprints through the dust, in from the left doorway to where
 * the lantern stands, ending in a pair side by side: whoever left them
 * stopped there, and never walked on. A decal on the floor, in room metres.
 */
function footprints(): THREE.Mesh {
  const [x0, x1, z0, z1] = [-2.8, -1.1, 0.0, 1.0];
  const width = Math.round((x1 - x0) * TEXELS_PER_METRE);
  const height = Math.round((z1 - z0) * TEXELS_PER_METRE);
  const grid = Array.from({ length: height }, () => Array.from({ length: width }, () => "."));
  const stamp = (x: number, z: number) => {
    const col = Math.round((x - x0) * TEXELS_PER_METRE) - 4;
    const row = Math.round((z - z0) * TEXELS_PER_METRE) - 1;
    PRINT.forEach((line, r) => {
      [...line].forEach((cell, c) => {
        if (cell === "#") grid[row + r][col + c] = "#";
      });
    });
  };
  const [from, to] = [new THREE.Vector2(-2.7, 0.18), new THREE.Vector2(-1.4, 0.66)];
  const steps = 4;
  const side = new THREE.Vector2(-(to.y - from.y), to.x - from.x).normalize().multiplyScalar(0.07);
  for (let i = 0; i < steps; i++) {
    const at = from.clone().lerp(to, i / steps).addScaledVector(side, i % 2 ? 1 : -1);
    stamp(at.x, at.y);
  }
  stamp(to.x + side.x, to.y + side.y);
  stamp(to.x - side.x, to.y - side.y);
  const decal = pixelPlane(pixelTexture(grid.map((row) => row.join("")), { "#": "sootLight" }), { alpha: true });
  decal.rotation.x = -Math.PI / 2;
  decal.position.set((x0 + x1) / 2, 0.01, (z0 + z1) / 2);
  decal.userData.noShadow = true;
  return decal;
}

/** The storm lantern set down on the floor, its hook up, in a haze of lit dust. */
function standingLantern(): THREE.Group {
  return group(lantern({ intensity: 6, range: 8, flicker: 0.1 }));
}

/**
 * The dust hanging in the lantern's light: soft shells of amber haze over
 * it, and motes turning slowly through them a texel at a time.
 */
function dustHaze(): THREE.Group {
  const haze = group();
  for (const [radius, opacity] of [[0.45, 0.1], [0.75, 0.08], [1.05, 0.05]] as const) {
    const shell = new THREE.Mesh(new THREE.SphereGeometry(radius, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.15, 1), lightMaterial(opacity));
    (shell.material as THREE.MeshBasicMaterial).color.set(paletteHex("amber"));
    shell.position.y = 0.012;
    shell.userData.noShadow = true;
    haze.add(shell);
  }
  const motes: THREE.Mesh[] = [];
  const mote = new THREE.BoxGeometry(1 / TEXELS_PER_METRE, 1 / TEXELS_PER_METRE, 1 / TEXELS_PER_METRE);
  // Light, not matter: a mote is dust catching the lantern's light.
  const glint = lightMaterial(0.45);
  glint.color.set(paletteHex("amber"));
  for (let i = 0; i < 12; i++) {
    const speck = new THREE.Mesh(mote, glint);
    speck.userData.noShadow = true;
    motes.push(speck);
  }
  const texel = (value: number) => Math.round(value * TEXELS_PER_METRE) / TEXELS_PER_METRE;
  const drift = animated(group(...motes), (seconds) => {
    motes.forEach((speck, i) => {
      const turn = i * 2.39 + seconds * (0.05 + (i % 5) * 0.012);
      const radius = 0.12 + ((i * 37) % 40) / 100;
      const rise = (((i * 0.53 + seconds * 0.03) % 1) + 1) % 1;
      speck.position.set(texel(Math.cos(turn) * radius), texel(0.35 + rise * 1.1), texel(Math.sin(turn) * radius));
    });
  });
  haze.add(drift);
  return haze;
}

/** The Dusty Hallway: a cross of corridors left under dust sheets, the floor
 *  grey with dust, and one trail of footprints walking in to a lantern set
 *  down in its haze, and no further. */
export const DUSTY_HALLWAY: RoomDefinition = {
  id: "dusty-hallway",
  floor: () => woodPlanks({ ramp: ["stoneDark", "stone", "stone", "stoneLight"], seed: SEED }),
  ...SURFACES,
  props: [
    ...crossCorners({ arm: ARM, ...SURFACES }),
    { build: footprints, at: [0, 0] },
    { build: standingLantern, at: LANTERN, y: 0.245 },
    { build: dustHaze, at: LANTERN },
    { build: sheetedSideboard, at: [ARM - 0.25, -2.0], turn: -90 },
    { build: sheetedArmchair, at: [1.75, 0.86], turn: 180 },
    { build: sheetedClock, at: [-ARM + 0.23, 2.05], turn: 90 },
    { build: sheetedBench, at: [-2.15, -ARM + 0.24] },
    { build: () => chair({ cushion: "bruise" }), name: "bared chair", at: [ARM - 0.3, 1.72], turn: -100 },
    { build: fallenSheet, at: [ARM - 0.4, 2.25], turn: -15 },
    { build: () => cobweb({ form: "slung" }), at: [-ARM + 0.29, -INNER + 0.29], y: 3.05, turn: -135, walls: ["top", "left"] },
    { build: () => cobweb({ form: "slung" }), at: [INNER - 0.29, ARM - 0.29], y: 3.05, turn: 45, walls: ["right", "bottom"] },
  ],
  focus: [-0.6, 0.4, 0.6],
  pawn: [0.45, 0.45],
  spots: [[0.45, -0.45], [-0.45, -0.45], [-0.45, 0.45], [-0.5, -1.8], [1.75, -0.45]],
  lanes: crossLanes(),
};
