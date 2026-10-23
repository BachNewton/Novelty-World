import * as THREE from "three";
import { createRng, pick } from "@/shared/lib/seeded-random";
import { gardenUrn, groundFog, oilLamp, URN_BODY } from "../kit";
import { solidLathe, vessel } from "../kit/vessel";
import type { PaletteKey } from "../palette";
import type { RoomDefinition } from "../room";
import { batch, box, cylinder, flat, group, pixelPlane, textured } from "../shapes";
import { shiny, shinyBatch, SHINES } from "../shine";
import { earth, flagstones, pixelTexture } from "../textures";

/** Where the urn that fell came down, in the open flags between the gates. */
const IMPACT: [number, number] = [1.05, 1.1];
/** The iron table, out of the way of the walks between the three gates. */
const TABLE: [number, number] = [1.5, -1.05];
const TABLE_HEIGHT = 0.72;

/** The spray of earth flung out from where the urn burst on the flags, and the cracks it struck in them: a flat decal, centred on the impact. */
function burstEarth(): THREE.Mesh {
  const rng = createRng("patio-burst");
  const size = 72;
  const half = size / 2;
  const rays = Array.from({ length: 13 }, () => ({ angle: rng.next() * Math.PI * 2, reach: 0.45 + rng.next() * 0.55, width: 0.12 + rng.next() * 0.16 }));
  const grid = Array.from({ length: size }, () => Array.from({ length: size }, () => "."));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5 - half) / half;
      const dy = (y + 0.5 - half) / half;
      const r = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      const lump = ((x * 7 + y * 13) % 5) / 5;
      let soil = r < 0.2 + lump * 0.06;
      for (const ray of rays) {
        const off = Math.abs(Math.atan2(Math.sin(a - ray.angle), Math.cos(a - ray.angle)));
        if (r < ray.reach && off < ray.width * (1 - r / ray.reach) + 0.02) soil = true;
      }
      if (soil) grid[y][x] = r < 0.14 || lump < 0.4 ? "s" : "e";
      else if (r < 0.95 && lump > 0.85 && r > 0.3 && rng.next() < 0.18) grid[y][x] = "e";
    }
  }
  // Cracks run out from the heart of it through the flags, jagged and a texel wide.
  for (let crack = 0; crack < 5; crack++) {
    let angle = rng.next() * Math.PI * 2;
    let [cx, cy] = [half, half];
    for (let step = 0; step < half * (0.6 + rng.next() * 0.35); step++) {
      angle += (rng.next() - 0.5) * 0.7;
      cx += Math.cos(angle);
      cy += Math.sin(angle);
      const [gx, gy] = [Math.round(cx), Math.round(cy)];
      if (gx < 0 || gy < 0 || gx >= size || gy >= size) break;
      if (grid[gy][gx] === ".") grid[gy][gx] = "c";
    }
  }
  const decal = pixelPlane(pixelTexture(grid.map((row) => row.join("")), { s: "woodDark", e: "wood", c: "void" }), { alpha: true });
  decal.rotation.x = -Math.PI / 2;
  decal.position.y = 0.006;
  decal.userData.noShadow = true;
  return decal;
}

/**
 * The urn that fell: a stone garden urn like the terrace's own, burst on
 * the flags, its foot and stem rolled clear on their side, its bowl in shards
 * thrown wide, and the dead plant that was in it lying in its root ball.
 * Centred on the impact.
 */
function fallenUrn(): THREE.Group {
  const rng = createRng("patio-shards");
  const stone = flat("stoneLight");
  const foot = solidLathe(URN_BODY.slice(0, 5), stone, 12);
  foot.rotation.set(0, 0, Math.PI / 2);
  foot.position.set(-0.3, URN_BODY[4][0], 0.22);
  const shards = batch();
  const tones: PaletteKey[] = ["stoneLight", "stoneLight", "stone", "boneDark"];
  for (let k = 0; k < 18; k++) {
    const a = rng.next() * Math.PI * 2;
    const r = 0.2 + Math.abs(rng.next() - rng.next()) * 0.85;
    const [w, d] = [0.1 + rng.next() * 0.18, 0.08 + rng.next() * 0.12];
    const t = 0.025 + rng.next() * 0.015;
    const tilt = new THREE.Euler((rng.next() - 0.5) * 0.25, rng.next() * Math.PI, (rng.next() - 0.5) * 0.25);
    shards.add([w, t, d], pick(rng, tones), new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * r, 0.006 + t / 2 + 0.012, Math.sin(a) * r), new THREE.Quaternion().setFromEuler(tilt), new THREE.Vector3(1, 1, 1)));
  }
  // The rim's biggest piece, still curved, standing on its edge.
  const rim = group();
  for (let k = 0; k < 4; k++) {
    const a = k * 0.32;
    const piece = box([0.12, 0.13, 0.04], flat("stoneLight"), [0, 0, 0]);
    piece.position.set(Math.cos(a) * 0.25, 0.006, Math.sin(a) * 0.25 - 0.25);
    piece.rotation.y = -a;
    rim.add(piece);
  }
  rim.position.set(0.32, 0, -0.18);
  rim.rotation.y = 0.6;
  const rootBall = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 0).scale(1, 0.7, 1), textured(earth({ soil: ["void", "soot", "woodDark"], grass: [], seed: "patio-roots" })));
  rootBall.position.set(0.05, 0.09, 0.05);
  const stalks = batch();
  for (let k = 0; k < 7; k++) {
    const lean = new THREE.Euler(-1.1 + (rng.next() - 0.5) * 0.6, 0, (rng.next() - 0.5) * 0.8);
    const tall = 0.25 + rng.next() * 0.25;
    const at = new THREE.Vector3(0, tall / 2, 0).applyEuler(lean).add(new THREE.Vector3(0.05, 0.12, 0.05));
    stalks.add([0.016, tall, 0.016], rng.next() < 0.5 ? "woodDark" : "wood", new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromEuler(lean), new THREE.Vector3(1, 1, 1)));
  }
  return group(burstEarth(), foot, shards.mesh(), rim, rootBall, stalks.mesh());
}

const IRON = () => shiny(flat("soot"), SHINES.iron);

/** A round wrought-iron garden table on a single column and three splayed feet. Round, centred on its origin. */
function ironTable(): THREE.Group {
  const iron = IRON();
  const result = group(
    cylinder(0.42, 0.025, iron, [0, TABLE_HEIGHT - 0.025, 0], { sides: 16 }),
    cylinder(0.44, 0.02, iron, [0, TABLE_HEIGHT - 0.045, 0], { top: 0.43, sides: 16 }),
    cylinder(0.07, 0.07, iron, [0, 0, 0], { top: 0.04, sides: 8 }),
    cylinder(0.03, TABLE_HEIGHT - 0.1, iron, [0, 0.06, 0], { sides: 6 }),
    cylinder(0.08, 0.06, iron, [0, TABLE_HEIGHT - 0.11, 0], { top: 0.05, sides: 8 }),
  );
  for (let k = 0; k < 3; k++) {
    // Each foot starts in the hub, clear of the others, so their tops never overlap in one plane.
    const foot = box([0.33, 0.035, 0.035], iron, [0.195, 0, 0]);
    foot.rotation.y = (k / 3) * Math.PI * 2;
    result.add(foot);
  }
  return result;
}

/** A teacup on its saucer, glazed china. */
function teacup(): THREE.Group {
  const china = shiny(flat("boneLight"), SHINES.glazedChina);
  const cup = vessel(
    [
      [0.022, 0],
      [0.036, 0.02],
      [0.042, 0.055],
    ],
    china,
    { wall: 0.005, depth: 0.045, sides: 10 },
  );
  cup.position.y = 0.008;
  return group(cylinder(0.068, 0.008, china, [0, 0, 0], { top: 0.072, sides: 12 }), cup);
}

/** What was left on the table: the hurricane lamp still burning, a cup on its saucer and another knocked over beside it. Built for the table's top. */
function tableSetting(): THREE.Group {
  const lamp = oilLamp({ metal: "ash", shine: SHINES.iron, intensity: 4.5, range: 7, flicker: 0.1 });
  lamp.position.set(-0.08, 0, -0.1);
  const cup = teacup();
  cup.position.set(0.2, 0, 0.12);
  const spilt = vessel(
    [
      [0.022, 0],
      [0.036, 0.02],
      [0.042, 0.055],
    ],
    shiny(flat("boneLight"), SHINES.glazedChina),
    { wall: 0.005, depth: 0.045, sides: 10 },
  );
  spilt.rotation.set(Math.PI / 2, 0, 0.9);
  spilt.position.set(-0.17, 0.042, 0.18);
  return group(lamp, cup, spilt);
}

/** A wrought-iron garden chair: a seat of slats on four legs, a barred back. Faces +z. */
function ironChair(): THREE.Group {
  const b = batch();
  const seat = 0.44;
  const half = 0.19;
  for (const [x, z] of [[-half, -half], [half, -half], [-half, half], [half, half]]) b.block([0.025, seat, 0.025], "soot", [x, 0, z]);
  for (let k = 0; k < 5; k++) b.block([0.42, 0.02, 0.05], "soot", [0, seat, -0.17 + k * 0.085]);
  for (const x of [-half, half]) b.block([0.03, 0.52, 0.03], "soot", [x, seat - 0.02, -half - 0.005]);
  for (const y of [seat + 0.2, seat + 0.46]) b.block([0.4, 0.03, 0.025], "soot", [0, y, -half - 0.005]);
  for (let k = -2; k <= 2; k++) b.block([0.018, 0.27, 0.018], "soot", [k * 0.065, seat + 0.215, -half - 0.005]);
  return group(shinyBatch(b, SHINES.iron));
}

/** The chair someone left in a hurry, knocked over backwards. Lying on its back, its seat towards +z. */
function toppledChair(): THREE.Group {
  const chair = ironChair();
  chair.rotation.x = -Math.PI / 2;
  chair.position.set(0, 0.205, -0.19);
  return group(chair);
}

/** The Patio: a flagged terrace walled by a low wall and a wooden lattice,
 *  a hurricane lamp still burning on its iron table among the tea things,
 *  a chair knocked over, and in the open flags a stone urn like the
 *  terrace's own, fallen from somewhere far above and burst in a spray
 *  of earth. */
export const PATIO: RoomDefinition = {
  id: "patio",
  floor: () => flagstones({ ramp: ["void", "soot", "sootLight", "ash"], mortar: "wraithDark", stonePx: 16, seed: "patio" }),
  wall: () => flagstones({ ramp: ["void", "soot", "ash", "stoneDark"], mortar: "void", stonePx: 6, size: 64, seed: "patio-wall" }),
  trim: "wood",
  edging: "trellis",
  props: [
    { build: fallenUrn, at: IMPACT },
    { build: ironTable, at: TABLE },
    { build: tableSetting, at: TABLE, y: TABLE_HEIGHT },
    { build: ironChair, at: [TABLE[0] - 0.05, TABLE[1] + 0.68], turn: 170 },
    { build: toppledChair, at: [TABLE[0] + 0.45, TABLE[1] - 0.72], turn: 210 },
    { build: () => gardenUrn({ seed: "patio-a" }), name: "gardenUrn", at: [2.3, -2.3] },
    { build: () => gardenUrn({ seed: "patio-b" }), name: "gardenUrn", at: [2.3, 2.3] },
    { build: () => gardenUrn({ seed: "patio-c" }), name: "gardenUrn", at: [-2.3, 2.3] },
    { build: () => groundFog({ seed: "patio-fog", layers: [[0.08, 0.4, "low"], [0.24, 0.2, "high"]] }), name: "groundFog", at: [0, 0] },
  ],
  focus: [IMPACT[0], 0.3, IMPACT[1]],
  prime: [-1.0, -1.1],
  // The burst urn, so no one stands on what fell.
  keepClear: [{ from: IMPACT, to: IMPACT, radius: 0.75 }],
};
