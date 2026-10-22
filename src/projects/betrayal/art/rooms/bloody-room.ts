import * as THREE from "three";
import { createRng } from "@/shared/lib/seeded-random";
import { animated } from "../animate";
import { chair, lantern, oilLamp, table } from "../kit";
import { strand, TWIST } from "../kit/rope";
import { vessel } from "../kit/vessel";
import { flickerOf } from "../lighting";
import { PALETTE, paletteHex, RAMPS, type PaletteKey } from "../palette";
import { crossLanes, onWall, TILE, type RoomDefinition } from "../room";
import { batch, cylinder, flat, group, lightMaterial } from "../shapes";
import { panelling, pixelTexture, TEXELS_PER_METRE, wallpaper, woodPlanks } from "../textures";

const SEED = "bloody-room";
/** The middle of the stain, in room metres. */
const STAIN: [number, number] = [-0.1, 0.05];
/** The signal the stain's glow and its light waver with. */
const STAIN_SIGNAL = 1;
/** The boards the room is floored with; the stain is drawn into the same planks. */
const PLANKS = { ramp: RAMPS.wood, plankPx: 8, size: 64, seed: SEED, glints: false };

/** How far the stain reaches from its middle, at an angle round it: a ragged round. */
function stainReach(angle: number): number {
  return 0.95 + 0.16 * Math.sin(3 * angle + 1) + 0.1 * Math.sin(5 * angle + 2.3) + 0.05 * Math.sin(9 * angle);
}

/** Drops thrown clear of the stain, each [x, z, radius] in room metres. */
const DROPS: [number, number, number][] = [
  [1.15, -0.62, 0.07],
  [1.3, -0.4, 0.04],
  [-1.3, 0.75, 0.06],
  [0.5, 1.25, 0.05],
];

/** How far inside the stain a point of the floor lies, in metres; negative outside it. */
function stainDepth(x: number, z: number): number {
  const [dx, dz] = [x - STAIN[0], z - STAIN[1]];
  const blob = stainReach(Math.atan2(dz, dx)) - Math.hypot(dx, dz);
  return Math.max(blob, ...DROPS.map(([px, pz, r]) => r - Math.hypot(x - px, z - pz)));
}

/** Each palette colour's key, to read a texture's pixels back as palette colours. */
const KEY_OF = new Map<string, PaletteKey>(Object.entries(PALETTE).map(([key, hex]) => [hex, key as PaletteKey]));

/** The plank colours the stain and the scrubbing turn each board colour into. */
const STAINED: Partial<Record<PaletteKey, PaletteKey>> = { woodDark: "bloodDark", wood: "bloodDark", woodMid: "blood", woodLight: "blood" };
const SOAKED: Partial<Record<PaletteKey, PaletteKey>> = { woodDark: "void", wood: "bloodDark", woodMid: "bloodDark", woodLight: "blood" };
const SCRUBBED: Partial<Record<PaletteKey, PaletteKey>> = { woodDark: "woodMid", wood: "woodLight", woodMid: "boneDark", woodLight: "boneDark" };
const WASHED: Partial<Record<PaletteKey, PaletteKey>> = { woodDark: "brick", wood: "brick", woodMid: "brickLight", woodLight: "brickLight" };
/** How far round the stain the boards were scrubbed pale (give or take, plank by plank), and the washed-out ring at its edge. */
const SCRUB = 0.7;
const WASH = 0.1;

let floorTexture: THREE.Texture | undefined;

/**
 * The room's boards, drawn for the whole tile at once, so the stain lies in
 * them as part of the floor: the planks soaked dark red in a ragged round,
 * the red running on along the cracks between them, a washed-out pink rim
 * where the scrubbing spread it, and round that the boards scrubbed pale.
 */
function stainedBoards(): THREE.Texture {
  if (floorTexture) return floorTexture;
  const base = woodPlanks(PLANKS).image as HTMLCanvasElement;
  const side = TILE * TEXELS_PER_METRE;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = side;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("2D canvas unavailable");
  for (let x = 0; x < side; x += base.width) for (let y = 0; y < side; y += base.height) context.drawImage(base, x, y);
  const image = context.getImageData(0, 0, side, side);
  const { data } = image;
  const rng = createRng(`${SEED}-stain`);
  // Each plank row, scrubbed along its grain: how far past the stain its crack carries the red, and how far out it was scrubbed.
  const planks = Array.from({ length: side / PLANKS.plankPx }, () => ({ crack: 0.1 + 0.6 * rng.next(), scrub: SCRUB - 0.2 + 0.45 * rng.next() }));
  // The floor's texture lies on the tile with u = x / 6 and v = −z / 6: column c is x = c / 32, row r is z = r / 32, both wrapping round the tile.
  const metre = (texel: number) => {
    const at = (texel + 0.5) / TEXELS_PER_METRE;
    return at >= TILE / 2 ? at - TILE : at;
  };
  for (let row = 0; row < side; row++) {
    const z = metre(row);
    for (let col = 0; col < side; col++) {
      const x = metre(col);
      const i = (row * side + col) * 4;
      const key = KEY_OF.get(`#${[data[i], data[i + 1], data[i + 2]].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`);
      if (!key) continue;
      const depth = stainDepth(x, z);
      const crack = row % PLANKS.plankPx === 0;
      const plank = planks[Math.floor(row / PLANKS.plankPx)];
      let next: PaletteKey | undefined;
      if (depth > 0.3) next = SOAKED[key];
      else if (depth > 0 || (crack && depth > -plank.crack)) next = STAINED[key];
      else if (crack) next = undefined;
      else if (depth > -WASH) next = WASHED[key];
      else if (depth > -plank.scrub) next = SCRUBBED[key];
      if (!next) continue;
      const hex = paletteHex(next);
      for (let channel = 0; channel < 3; channel++) data[i + channel] = parseInt(hex.slice(1 + channel * 2, 3 + channel * 2), 16);
    }
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  floorTexture = texture;
  return texture;
}

/**
 * The red welling up out of the stain, as if lit from under the boards:
 * light laid over it, brightest in its heart, out to a little past its rim,
 * pulsing with the stain's light. Lies flat, centred on the stain.
 */
function stainGlow(): THREE.Group {
  const steps = 48;
  // Rings out from the heart: how far out, as a share of the reach (or past it), and how bright.
  const rings: [share: number, past: number, bright: number][] = [
    [0, 0, 1],
    [0.55, 0, 0.75],
    [1, 0, 0.35],
    [1, 0.45, 0],
  ];
  const red = new THREE.Color(paletteHex("scarlet"));
  const positions: number[] = [];
  const colours: number[] = [];
  const index: number[] = [];
  rings.forEach(([share, past, bright], ring) => {
    for (let step = 0; step < (ring === 0 ? 1 : steps); step++) {
      const angle = (step / steps) * Math.PI * 2;
      const reach = stainReach(angle) * share + past;
      positions.push(Math.cos(angle) * reach, 0.015, Math.sin(angle) * reach);
      colours.push(...red.clone().multiplyScalar(bright).toArray());
    }
  });
  const at = (ring: number, step: number) => (ring === 0 ? 0 : 1 + (ring - 1) * steps + (step % steps));
  for (let step = 0; step < steps; step++) {
    index.push(0, at(1, step + 1), at(1, step));
    for (let ring = 1; ring < rings.length - 1; ring++) {
      index.push(at(ring, step), at(ring, step + 1), at(ring + 1, step), at(ring, step + 1), at(ring + 1, step + 1), at(ring + 1, step));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(index);
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
  const material = lightMaterial(0.35, { vertexColors: true });
  const glowing = new THREE.Mesh(geometry, material);
  glowing.userData.noShadow = true;
  return group(
    animated(glowing, (seconds) => {
      material.opacity = 0.3 + 0.08 * flickerOf(seconds, STAIN_SIGNAL);
    }),
  );
}

/** The pail's outside, foot to rim: [radius, height]. */
const PAIL: [number, number][] = [
  [0.12, 0],
  [0.15, 0.3],
];
const pailRadius = (y: number) => 0.12 + (0.03 / 0.3) * y;

/** A wooden scrubbing pail bound with two iron hoops, upright with clean water in it and its bail up, or tipped over and empty. Base at y = 0. */
function pail({ water = true }: { water?: boolean } = {}): THREE.Group {
  const result = group(vessel(PAIL, flat("woodMid"), { wall: 0.015, depth: 0.27 }));
  const iron = flat("soot");
  for (const y of [0.04, 0.22]) {
    result.add(cylinder(pailRadius(y) + 0.01, 0.03, iron, [0, y, 0], { top: pailRadius(y + 0.03) + 0.01, sides: 16 }));
  }
  if (water) {
    result.add(cylinder(pailRadius(0.26) - 0.03, 0.006, flat("tide"), [0, 0.26, 0], { sides: 10 }));
    const b = batch();
    const v = (x: number, y: number) => new THREE.Vector3(x, y, 0);
    const bail = [v(-0.162, 0.25), v(-0.1, 0.41), v(0.1, 0.41), v(0.162, 0.25)];
    for (let i = 0; i < bail.length - 1; i++) strand(b, bail[i], bail[i + 1], 0.012, "soot", (i % 2) * TWIST);
    result.add(b.mesh());
  }
  return result;
}

/** The pail standing up, casting no shadow: a small solid beside the lantern would black out its own inside and throw a long blot across the boards. */
function standingPail(): THREE.Group {
  const result = pail();
  result.traverse((child) => {
    child.userData.noShadow = true;
  });
  return result;
}

/** The second pail, kicked over on its side, its mouth to −x. */
function tippedPail(): THREE.Group {
  const lying = pail({ water: false });
  // On its side, tilted by its taper so the length of its side lies on the boards.
  lying.rotation.z = Math.PI / 2 - Math.atan(0.03 / 0.3);
  lying.position.y = 0.145;
  return group(lying);
}

/** A scrubbing brush lying bristles down, its bristles gone pink. Long along x. */
function scrubbingBrush(): THREE.Group {
  const b = batch();
  b.block([0.2, 0.03, 0.07], "brickLight", [0, 0, 0]);
  b.block([0.22, 0.04, 0.085], "woodLight", [0, 0.03, 0]);
  return group(b.mesh());
}

/** A folded sack to kneel on, and a wrung-out rag beside it, the rag washed pink. */
function kneelingSack(): THREE.Group {
  const b = batch();
  b.block([0.46, 0.025, 0.32], "boneDark", [0, 0, 0]);
  b.block([0.4, 0.02, 0.15], "bone", [0.02, 0.025, -0.07]);
  b.block([0.16, 0.04, 0.06], "brickLight", [0.36, 0, 0.1]);
  b.block([0.08, 0.025, 0.1], "bone", [0.41, 0.025, 0.125]);
  return group(b.mesh());
}

/** The spiral of a rolled rug's end, as pixels. */
const ROLL_END = ["..bbbbb..", ".brrrrrb.", "brbbbbbrb", "brbaaabrb", "brbasabrb", "brbaaabrb", "brbbbbbrb", ".brrrrrb.", "..bbbbb.."];

/** The rug that hid the stain, rolled up tight and pushed against a wall, two cords round it. Long along z, its middle at the origin. */
function rolledRug(): THREE.Group {
  const length = 1.8;
  const radius = 0.13;
  const lie = (geometry: THREE.CylinderGeometry) => geometry.rotateX(Math.PI / 2).translate(0, radius, 0);
  const end = new THREE.MeshLambertMaterial({ map: pixelTexture(ROLL_END, { ".": "bloodDark", b: "bloodDark", r: "blood", a: "amber", s: "soot" }) });
  const roll = new THREE.Mesh(lie(new THREE.CylinderGeometry(radius, radius, length, 12)), [flat("blood"), end, end]);
  const cord = flat("boneDark");
  const cords = [-0.5, 0.5].map((z) => {
    const ring = new THREE.Mesh(lie(new THREE.CylinderGeometry(radius + 0.008, radius + 0.008, 0.03, 16)), cord);
    ring.position.z = z;
    return ring;
  });
  return group(roll, ...cords);
}

/** A small table shoved into a corner with two chairs turned up on it, seats down and legs in the air, their backs hanging over its edges. */
function clearedTable(): THREE.Group {
  const result = group(table({ length: 0.9, width: 0.7 }));
  const top = 0.76;
  for (const [x, z, turn] of [[-0.24, 0.18, 0], [0.24, -0.18, Math.PI]] as const) {
    const upturned = chair();
    upturned.rotation.x = Math.PI;
    upturned.position.y = top + 0.51;
    const holder = group(upturned);
    holder.position.set(x, 0, z);
    holder.rotation.y = turn;
    result.add(holder);
  }
  return result;
}

/** The Bloody Room: a parlour cleared to its boards to scrub out a great dark
 *  stain, which has not come out. The rug that hid it is rolled against the
 *  wall, the chairs are up on the table, and the pails and brush are left at
 *  its rim, where the boards are scrubbed pale; the stain itself glows red,
 *  as if lit from under the floor. */
export const BLOODY_ROOM: RoomDefinition = {
  id: "bloody-room",
  floor: stainedBoards,
  wall: () => wallpaper({ ground: "stoneDark", stripe: "ash", motif: "blood", seed: SEED }),
  wainscot: () => panelling({ ramp: RAMPS.wood, seed: SEED, glints: false }),
  trim: "woodDark",
  props: [
    { build: stainGlow, at: STAIN },
    { build: standingPail, name: "pail", at: [-1.05, -0.9] },
    { build: tippedPail, at: [-1.45, -0.62], turn: 30 },
    { build: scrubbingBrush, at: [-0.7, -0.82], turn: 25 },
    { build: kneelingSack, at: [-0.75, -1.25], turn: -10 },
    { build: () => lantern({ intensity: 5, range: 8 }), name: "lantern", at: [-1.3, -1.25], y: 0.245 },
    { build: rolledRug, at: [-2.55, 1.6] },
    { build: clearedTable, at: [-2.15, -2.2], turn: -8 },
    { build: () => table({ length: 0.6, width: 0.42, height: 0.75 }), name: "sideTable", ...onWall("bottom", 1.6, { out: 0.26 }) },
    { build: () => oilLamp({ intensity: 3.5, range: 7 }), name: "oilLamp", at: [-1.52, 2.54], y: 0.75 },
  ],
  lights: [{ at: [STAIN[0], 0.45, STAIN[1]], colour: "scarlet", intensity: 3, range: 5.5, flicker: 0.12, signal: STAIN_SIGNAL, kind: "glow" }],
  focus: [-0.4, 0.3, -0.3],
  prime: [1.35, 1.25],
  keepClear: [{ from: STAIN, to: STAIN, radius: 0.75 }],
  lanes: crossLanes(),
};
