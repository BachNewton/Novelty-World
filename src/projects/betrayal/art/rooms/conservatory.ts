import * as THREE from "three";
import { createRng } from "@/shared/lib/seeded-random";
import { GLAZING } from "../glazing";
import { flowerPot, LEAVES, palm, rosette } from "../kit/plants";
import { solidLathe } from "../kit/vessel";
import { lightAnchor } from "../light-anchor";
import type { PaletteKey } from "../palette";
import { INNER, TILE, onWall, type RoomDefinition } from "../room";
import { batch, box, cylinder, flat, glow, group } from "../shapes";
import { shiny, shinyBatch, SHINES } from "../shine";
import { bricks, pixelTexture } from "../textures";

const SEED = "conservatory";

/** The plant theatre in the middle of the floor: where it stands, and its three tiers' radii and heights. */
const THEATRE = { at: [-0.25, 0.1] as [number, number], tiers: [[0.82, 0.3], [0.58, 0.62], [0.32, 0.94]] as [radius: number, height: number][] };
/** The paraffin stove on the left wall, and the light standing just out from its glowing window. */
const STOVE = { along: -0.6, out: 0.28 };

/** A piece holding a light, or glowing, must not throw a shadow over it. */
function noShadows<T extends THREE.Object3D>(object: T): T {
  object.traverse((child) => {
    child.userData.noShadow = true;
  });
  return object;
}

/** Encaustic floor tiles: a chequer of terracotta and black, a small buff square set at every meeting of four. */
function encaustic(): THREE.Texture {
  const size = 32;
  const tile = 8;
  const rows = Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => {
      const [u, v] = [x % tile, y % tile];
      if ((u === 0 || u === tile - 1) && (v === 0 || v === tile - 1)) return "b";
      if (u === 0 || v === 0) return "g";
      return (Math.floor(x / tile) + Math.floor(y / tile)) % 2 ? "r" : "k";
    }).join(""),
  );
  return pixelTexture(rows, { g: "soot", b: "ash", r: "brick", k: "sootLight" }, true);
}

/** A withered fern in a clay pot, a handful of broad fronds collapsed over the rim. Base at the origin. */
function deadFern(seed: string, { radius = 0.09, height = 0.16, spread = 0.36, fronds = 6, droop = 1 } = {}): THREE.Group {
  const { pot, soilTop } = flowerPot({ radius, height });
  const fern = rosette({ fronds, length: spread, width: spread * 0.36, rise: 50, droop, leaf: LEAVES.withered, wither: 0.7, seed });
  fern.position.y = soilTop;
  return group(pot, fern);
}

/**
 * The plant theatre: a round painted stand of three tiers stepping up to a
 * stone urn, every tier ringed with clay pots of dead ferns, and the urn's
 * great fern dead too. Round, so it faces every way.
 */
function plantTheatre(): THREE.Group {
  const paint = flat("boneDark");
  const stand = group();
  for (const [radius, height] of THEATRE.tiers) {
    stand.add(cylinder(radius, 0.03, flat("woodMid"), [0, height - 0.03, 0], { sides: 16 }));
    stand.add(cylinder(radius + 0.02, 0.06, paint, [0, height - 0.075, 0], { top: radius + 0.02, sides: 16 }));
  }
  stand.add(cylinder(0.06, THEATRE.tiers[2][1] - 0.04, paint, [0, 0, 0], { sides: 8 }));
  const legs = batch();
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    for (const [radius, height] of THEATRE.tiers.slice(0, 2)) {
      legs.block([0.04, height - 0.07, 0.04], "boneDark", [Math.cos(angle) * (radius - 0.06), 0, Math.sin(angle) * (radius - 0.06)]);
    }
  }
  stand.add(legs.mesh());
  const rings: [radius: number, count: number][] = [[0.68, 9], [0.44, 6]];
  rings.forEach(([radius, count], tier) => {
    for (let i = 0; i < count; i++) {
      const angle = ((i + tier * 0.5) / count) * Math.PI * 2;
      const fern = deadFern(`theatre-${tier}-${i}`, { radius: 0.11 - tier * 0.01, height: 0.19, spread: 0.28 - tier * 0.04 });
      fern.position.set(Math.cos(angle) * radius, THEATRE.tiers[tier][1], Math.sin(angle) * radius);
      stand.add(fern);
    }
  });
  const urn = solidLathe([[0.1, 0], [0.12, 0.04], [0.07, 0.1], [0.09, 0.16], [0.2, 0.3], [0.22, 0.34]], flat("stone"), 12);
  urn.position.y = THEATRE.tiers[2][1];
  const top = rosette({ fronds: 7, length: 0.62, width: 0.15, rise: 55, droop: 0.9, leaf: LEAVES.withered, wither: 0.6, seed: "theatre-crown" });
  top.position.y = THEATRE.tiers[2][1] + 0.33;
  stand.add(urn, top);
  return stand;
}

/** A dead palm in a great glazed pot, its fronds hanging brown round its trunk. Base at the origin. */
function deadPalm(): THREE.Group {
  const glaze = shiny(flat("verdigrisDark"), SHINES.glazedChina);
  const { pot, soilTop } = flowerPot({ radius: 0.3, height: 0.5, material: glaze });
  const tree = palm({ height: 1.55, fronds: 7, leaf: LEAVES.withered, wither: 0.9, seed: "corner-palm" });
  tree.position.y = soilTop;
  return group(pot, tree);
}

/**
 * The potting bench down the right wall: slatted boards on trestle legs, its
 * back to the wall, faced +z as built (along x), with rows of pots of dead
 * seedlings on it and spare pots stacked beneath.
 */
function pottingBench(): THREE.Group {
  const length = 2.6;
  const depth = 0.55;
  const height = 0.78;
  const wood = batch();
  for (let i = 0; i < 5; i++) wood.block([length, 0.03, depth / 5 - 0.012], i % 2 ? "woodMid" : "wood", [0, height - 0.03, -depth / 2 + (i + 0.5) * (depth / 5)]);
  for (const x of [-length / 2 + 0.08, 0, length / 2 - 0.08]) {
    for (const z of [-depth / 2 + 0.05, depth / 2 - 0.05]) wood.block([0.06, height - 0.03, 0.06], "woodDark", [x, 0, z]);
    wood.block([0.05, 0.05, depth - 0.07], "woodDark", [x, height - 0.09, 0]);
  }
  wood.block([length - 0.14, 0.025, depth - 0.12], "wood", [0, 0.16, 0]);
  wood.block([length, 0.12, 0.03], "woodDark", [0, height, -depth / 2 + 0.015]);
  const result = group(wood.mesh());
  const rng = createRng(`${SEED}:bench`);
  for (let i = 0; i < 6; i++) {
    const x = -length / 2 + 0.22 + i * 0.43 + (rng.next() - 0.5) * 0.06;
    const z = (rng.next() - 0.5) * 0.12;
    const plant = deadFern(`bench-${i}`, { radius: 0.075 + rng.next() * 0.03, height: 0.13 + rng.next() * 0.05, spread: 0.16 + rng.next() * 0.06, fronds: 5, droop: 1.2 });
    plant.position.set(x, height, z);
    result.add(plant);
  }
  // Empty pots stacked under the bench, mouths down, the top of each stack a little askew.
  for (const [x, count] of [[-0.75, 4], [0.5, 3]] as const) {
    for (let k = 0; k < count; k++) {
      const { pot } = flowerPot({ radius: 0.085, height: 0.13 });
      pot.rotation.x = Math.PI;
      pot.position.set(x, 0.185 + 0.13 + k * 0.045, 0.02);
      result.add(pot);
    }
  }
  return result;
}

/**
 * The paraffin stove: a squat iron heater on short legs, its round tank,
 * a burner chamber whose mica window glows amber, and a tall drum with a
 * pierced cap glowing orange from below. It burns still, keeping the dead
 * plants warm. Faces +z.
 */
function paraffinStove(): THREE.Group {
  const iron = shiny(flat("soot"), SHINES.iron);
  const enamel = shiny(flat("verdigrisDark"), SHINES.lacquer);
  const body = group(
    cylinder(0.17, 0.17, enamel, [0, 0.06, 0], { sides: 14 }),
    cylinder(0.14, 0.2, iron, [0, 0.23, 0], { sides: 14 }),
    cylinder(0.12, 0.42, iron, [0, 0.43, 0], { sides: 14 }),
    cylinder(0.14, 0.03, iron, [0, 0.85, 0], { sides: 14 }),
    box([0.1, 0.07, 0.02], glow("amber"), [0, 0.29, 0.133]),
    box([0.12, 0.018, 0.03], iron, [0, 0.36, 0.132]),
    box([0.12, 0.018, 0.03], iron, [0, 0.272, 0.132]),
  );
  for (const angle of [0.6, 2.2, 3.8, 5.3]) body.add(box([0.03, 0.07, 0.03], iron, [Math.cos(angle) * 0.13, 0, Math.sin(angle) * 0.13]));
  const holes = pixelTexture(["e.e.e", ".e.e.", "e.e.e", ".e.e.", "e.e.e"], { e: "ember", ".": null });
  const cap = new THREE.Mesh(new THREE.CircleGeometry(0.1, 14).rotateX(-Math.PI / 2), glow("ember", holes));
  cap.position.y = 0.885;
  body.add(cap);
  noShadows(body);
  body.add(lightAnchor({ colour: "amber", intensity: 3.5, range: 5.5, flicker: 0.06, kind: "lamp" }, [0, 0.34, 0.24]));
  return body;
}

/** A galvanised watering can, its rose spout reaching out along +x. Base at the origin. */
function wateringCan(): THREE.Group {
  const zinc = shiny(flat("stone"), SHINES.pewter);
  const can = group(cylinder(0.11, 0.24, zinc, [0, 0, 0], { sides: 12 }), cylinder(0.112, 0.012, zinc, [0, 0.235, 0], { sides: 12 }));
  const spout = box([0.3, 0.025, 0.025], zinc, [0.15, -0.0125, 0]);
  spout.rotation.z = 0.7;
  spout.position.set(0.09, 0.06, 0);
  const rose = cylinder(0.035, 0.03, zinc, [0, 0, 0], { top: 0.02, sides: 10 });
  rose.rotation.z = -Math.PI / 2 + 0.7;
  rose.position.set(0.09 + 0.3 * Math.cos(0.7), 0.06 + 0.3 * Math.sin(0.7), 0);
  const handle = batch();
  handle.block([0.21, 0.025, 0.025], "stone", [-0.02, 0.33, 0]);
  handle.block([0.02, 0.1, 0.018], "stone", [-0.11, 0.235, 0]);
  handle.block([0.02, 0.1, 0.018], "stone", [0.07, 0.235, 0]);
  return group(can, spout, rose, shinyBatch(handle, SHINES.pewter));
}

/** The heights fallen leaves lie at: two that overlap never lie in one plane. */
const LEAF_LEVELS = Array.from({ length: 8 }, (_, k) => 0.003 + k * 0.0015);

/** Dead leaves shed across the tiles, thickest round the plants. Built in room metres. */
function fallenLeaves(): THREE.Mesh {
  const rng = createRng(`${SEED}:leaves`);
  const leaves = batch();
  const tints: PaletteKey[] = ["brass", "stoneDark", "wood"];
  const placed: { x: number; z: number; level: number }[] = [];
  const near: [x: number, z: number, spread: number, count: number][] = [
    [THEATRE.at[0], THEATRE.at[1], 1.25, 22],
    [-2.0, -1.9, 0.8, 10],
    [2.0, -0.3, 1.0, 10],
  ];
  for (const [cx, cz, spread, count] of near) {
    for (let i = 0; i < count; i++) {
      const angle = rng.next() * Math.PI * 2;
      const r = Math.sqrt(rng.next()) * spread;
      const [x, z] = [cx + Math.cos(angle) * r, cz + Math.sin(angle) * r];
      if (Math.abs(x) > INNER - 0.1 || Math.abs(z) > INNER - 0.1) continue;
      // The doorway's lane and the prime place stay bare.
      if (Math.abs(x) < 0.75 && z < -1.9) continue;
      if (Math.hypot(x - PRIME[0], z - PRIME[1]) < 0.55) continue;
      const level = LEAF_LEVELS.findIndex((_, k) => placed.every((leaf) => leaf.level !== k || Math.hypot(leaf.x - x, leaf.z - z) > 0.11));
      if (level === -1) continue;
      placed.push({ x, z, level });
      const matrix = new THREE.Matrix4().compose(new THREE.Vector3(x, LEAF_LEVELS[level], z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng.next() * Math.PI, 0)), new THREE.Vector3(1, 1, 1));
      leaves.add([0.08 + rng.next() * 0.05, 0.005, 0.035 + rng.next() * 0.02], tints[Math.floor(rng.next() * tints.length)], matrix);
    }
  }
  return leaves.mesh();
}

/**
 * The glass roof's frame, which the camera looks down through and so is
 * never drawn: a ridge across the middle, rafters down both slopes to the
 * walls' top plates, and purlins along them. It only stops the moon in the
 * bake, laying its lattice of shadow over the floor (`bakeOnly`). Built in
 * room metres.
 */
function roofFrame(): THREE.Group {
  const frame = batch();
  const eaves = GLAZING.top;
  const ridge = 3.7;
  const half = TILE / 2 - 0.1;
  const slope = Math.atan2(ridge - eaves, half);
  const length = Math.hypot(ridge - eaves, half);
  frame.block([0.12, 0.14, TILE - 0.2], "soot", [0, ridge - 0.07, 0]);
  const tilt = (side: number, z: number, size: [number, number, number], along: number) => {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(side * (half - (Math.cos(slope) * along)), eaves + Math.sin(slope) * along, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -side * slope)),
      new THREE.Vector3(1, 1, 1),
    );
    frame.add(size, "soot", m);
  };
  for (const side of [-1, 1]) {
    for (let z = -half; z <= half + 1e-6; z += (half * 2) / 9) tilt(side, z, [length, 0.07, 0.07], length / 2);
    for (const along of [length * 0.33, length * 0.66]) tilt(side, 0, [0.06, 0.06, TILE - 0.2], along);
  }
  const mesh = frame.mesh();
  mesh.userData.bakeOnly = true;
  return group(mesh);
}

/** Where the active explorer stands: open tiles between the theatre and the front. */
const PRIME: [x: number, z: number] = [1.05, 1.65];

/** The Conservatory: a glasshouse on a low brick wall, every plant in it
 *  dead, round a tiered theatre of withered ferns, under the moon through its
 *  glass roof; and the paraffin stove still burning to keep them warm. */
export const CONSERVATORY: RoomDefinition = {
  id: "conservatory",
  floor: encaustic,
  wall: () => bricks({ seed: `${SEED}:wall`, wear: 0.25 }),
  trim: "stone",
  edging: "glazing",
  sheltered: true,
  props: [
    { build: plantTheatre, at: THEATRE.at },
    { build: deadPalm, at: [-2.05, -1.95] },
    { build: pottingBench, ...onWall("right", 0.35, { out: 0.3 }) },
    { build: paraffinStove, ...onWall("left", STOVE.along, { out: STOVE.out }) },
    { build: wateringCan, at: [-1.95, 1.25], turn: -30 },
    { build: fallenLeaves, at: [0, 0] },
    { build: roofFrame, at: [0, 0] },
  ],
  focus: [0, 0.8, THEATRE.at[1]],
  prime: PRIME,
  // Round the theatre's right, between it and the potting bench.
  lanes: [[PRIME, [1.4, 0.9], [1.4, -1.0], [0.35, -2.2]]],
};
