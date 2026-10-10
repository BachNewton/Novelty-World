import * as THREE from "three";
import { candle, cobweb } from "../kit";
import { wallMass, type MassBlock } from "../kit/wall-mass";
import { lightAnchor } from "../light-anchor";
import { RAMPS } from "../palette";
import { INNER, type RoomDefinition } from "../room";
import { box, flat, glow, group, lathe } from "../shapes";
import { marble, panelling, plaster, wallpaper } from "../textures";

const SEED = "statuary-corridor";
const SURFACES = {
  wall: () => wallpaper({ ground: "sootLight", stripe: "soot", motif: "ash", seed: SEED }),
  wainscot: () => panelling({ ramp: RAMPS.wood, seed: SEED }),
  trim: "woodDark",
} satisfies Pick<RoomDefinition, "wall" | "wainscot" | "trim">;

/** The corridor runs this far either side of the middle, between two thick walls of niches. */
const HALF = 1.3;
/** How far the niches go into the side walls, measured from the middle. */
const NICHE_BACK = 1.85;
const NICHE_WIDTH = 1.0;
const NICHE_TOP = 2.5;
/** The niches down each side, by their middle along z. */
const NICHES = [-1.75, 0, 1.75];
/** Where a statue's plinth stands in its niche, from the middle across x. */
const PLINTH_AT = 1.55;
const PLINTH = { width: 0.6, depth: 0.46, height: 0.3 };

/** One side wall of the corridor (`side` −1 for the left, 1 for the right),
 *  solid but for its niches, each lined in deep red plaster. */
function sideWall(side: -1 | 1): MassBlock[] {
  const across = (from: number, to: number): [number, number] => (side < 0 ? [-to, -from] : [from, to]);
  const front: MassBlock["dressed"] = [side < 0 ? "+x" : "-x"];
  const lining = () => plaster({ ramp: RAMPS.blood, seed: `${SEED}:niche` });
  const edges = [-INNER, ...NICHES.flatMap((z) => [z - NICHE_WIDTH / 2, z + NICHE_WIDTH / 2]), INNER];
  const blocks: MassBlock[] = [];
  for (let i = 0; i < edges.length; i += 2) blocks.push({ x: across(HALF, INNER), z: [edges[i], edges[i + 1]], dressed: front, wrap: false });
  for (const z of NICHES) {
    const span: [number, number] = [z - NICHE_WIDTH / 2, z + NICHE_WIDTH / 2];
    blocks.push({ x: across(NICHE_BACK, INNER), z: span, dressed: [], surface: lining });
    blocks.push({ x: across(HALF, NICHE_BACK), z: span, dressed: front, from: NICHE_TOP, wrap: false });
  }
  return blocks;
}

/** A plinth of grey stone with a pale cap. */
function plinth(): THREE.Group {
  const { width, depth, height } = PLINTH;
  return group(
    box([width, height - 0.05, depth], flat("stone"), [0, 0, 0]),
    box([width + 0.04, 0.05, depth + 0.04], flat("stoneLight"), [0, height - 0.05, 0]),
    box([width + 0.04, 0.06, depth + 0.04], flat("stoneDark"), [0, 0, 0]),
  );
}

type Pose = "torch" | "hooded" | "mourning" | "reaching";

/**
 * A marble figure in a long robe, about life size, facing +z, in one of a
 * few poses: holding up a cold torch, hooded with its hands folded, mourning
 * with its head bowed into one hand, or reaching out. Built from a lathe robe,
 * a round head and box arms, never sculpted.
 */
function figure(pose: Pose): THREE.Group {
  const marbleWhite = flat("stoneLight");
  const shade = flat("boneLight");
  const robe = lathe([[0, 0], [0.21, 0], [0.205, 0.08], [0.2, 0.5], [0.16, 0.95], [0.15, 1.12], [0.19, 1.24], [0.14, 1.32], [0, 1.34]], marbleWhite, 10);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 1), shade);
  head.position.set(0, 1.46, pose === "mourning" ? 0.05 : 0);
  const neck = box([0.08, 0.08, 0.08], marbleWhite, [0, 1.32, 0]);
  const result = group(robe, neck, head);
  /** An arm from the shoulder, hanging by default, swung forward by `lift` radians and in by `inward`. */
  const arm = (x: number, lift: number, inward = 0, length = 0.58) => {
    const limb = box([0.08, length, 0.08], marbleWhite, [0, -length, 0]);
    const shoulder = group(limb);
    shoulder.position.set(x, 1.27, 0);
    shoulder.rotation.set(-lift, 0, inward * Math.sign(x));
    result.add(shoulder);
    return shoulder;
  };
  if (pose === "torch") {
    arm(-0.2, 0.15);
    const raised = arm(0.2, 2.9, -0.15);
    raised.add(torch());
  } else if (pose === "hooded") {
    const hood = lathe([[0, 0], [0.15, 0], [0.13, 0.12], [0.07, 0.24], [0, 0.27]], marbleWhite, 8);
    hood.position.set(0, 1.36, -0.02);
    result.add(hood);
    arm(-0.19, 0.75, 0.45, 0.48);
    arm(0.19, 0.75, 0.45, 0.48);
  } else if (pose === "mourning") {
    arm(-0.19, 0.2);
    arm(0.19, 2.2, 0.55, 0.52);
    head.position.y = 1.43;
  } else {
    arm(-0.19, 1.25, 0.1);
    arm(0.19, 0.9, -0.05);
  }
  return result;
}

/** The torch a statue holds up, its flame carved in stone. */
function torch(): THREE.Mesh {
  const torch = lathe([[0, 0], [0.03, 0], [0.05, 0.18], [0, 0.2]], flat("stone"), 6);
  torch.rotation.x = Math.PI;
  torch.position.y = -0.6;
  return torch;
}

/** A bust on a fluted column, facing +z. */
function bustOnColumn(): THREE.Group {
  const stone = flat("stone");
  const pale = flat("stoneLight");
  const column = lathe([[0, 0], [0.2, 0], [0.2, 0.08], [0.13, 0.12], [0.11, 0.95], [0.16, 1.0], [0.16, 1.06], [0, 1.06]], stone, 10);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 1), flat("boneLight"));
  head.position.set(0, 1.47, 0.01);
  return group(
    column,
    box([0.42, 0.12, 0.22], pale, [0, 1.06, 0]),
    box([0.34, 0.12, 0.2], pale, [0, 1.18, 0]),
    box([0.09, 0.1, 0.09], pale, [0, 1.29, 0]),
    head,
  );
}

/** A statue on its plinth, facing +z. */
function onPlinth(pose: Pose): () => THREE.Group {
  return function statue() {
    const body = figure(pose);
    body.position.y = PLINTH.height;
    return group(plinth(), body);
  };
}

/**
 * The statue that has stepped down from its niche into the corridor, turned
 * to face whoever comes in, one hand reaching. Its eyes glow red, and it
 * throws a red light ahead of it: the danger here.
 */
function steppedDown(): THREE.Group {
  const result = figure("reaching");
  const eye = glow("scarlet");
  for (const x of [-0.035, 0.035]) result.add(box([0.03, 0.02, 0.02], eye, [x, 1.47, 0.09]));
  result.add(lightAnchor({ colour: "scarlet", intensity: 4.5, range: 6.5 }, [0, 1.5, 0.35]));
  return result;
}

/** A plinth left empty, scuffed pale where the statue's foot stood. */
function emptyPlinth(): THREE.Group {
  return group(plinth(), box([0.36, 0.012, 0.3], flat("boneLight"), [0, PLINTH.height, 0]));
}

/** A votive candle at the foot of a statue, lighting it from below. */
function votive(): THREE.Group {
  return group(candle({ height: 0.1, intensity: 1.4, range: 4 }));
}

/** The Statuary Corridor: a narrow gallery between two walls of red-lined
 *  niches, a marble figure in each, and one niche empty: its statue has
 *  stepped down into the corridor, eyes alight with red. */
export const STATUARY_CORRIDOR: RoomDefinition = {
  id: "statuary-corridor",
  floor: () => marble({ chequer: false, pale: "stone", paleVein: "stoneLight", grout: "stoneDark", seed: SEED }),
  ...SURFACES,
  props: [
    ...wallMass({ ...SURFACES, blocks: sideWall(-1), walls: ["left"], name: "left niches" }),
    ...wallMass({ ...SURFACES, blocks: sideWall(1), walls: ["right"], name: "right niches" }),
    { build: onPlinth("torch"), at: [-PLINTH_AT, NICHES[0]], turn: 90 },
    { build: bustOnColumn, at: [-PLINTH_AT, NICHES[1]], turn: 90 },
    { build: onPlinth("mourning"), at: [-PLINTH_AT, NICHES[2]], turn: 90 },
    { build: onPlinth("hooded"), at: [PLINTH_AT, NICHES[0]], turn: -90 },
    { build: emptyPlinth, at: [PLINTH_AT, NICHES[1]], turn: -90 },
    { build: onPlinth("torch"), at: [PLINTH_AT, NICHES[2]], turn: -90 },
    { build: steppedDown, at: [0.85, -0.35], turn: -15 },
    { build: votive, at: [-PLINTH_AT + 0.15, NICHES[0] + 0.25], y: PLINTH.height },
    { build: votive, at: [PLINTH_AT - 0.15, NICHES[2] - 0.25], y: PLINTH.height },
    { build: () => cobweb({ form: "slung" }), at: [-HALF + 0.29, -INNER + 0.29], y: 3.05, turn: -135, walls: ["top", "left"] },
  ],
  focus: [0.4, 1.0, -0.4],
  pawn: [-0.6, 0.45],
  spots: [[-0.8, 1.8], [0.7, 0.7], [0.8, -1.8], [0.15, -0.65], [-0.8, -1.8]],
  overflow: [[0.4, 1.65], [0.0, -1.45], [-0.95, -0.25], [-0.6, -0.95], [-0.1, 1.05]],
  // Past the statue.
  lanes: [[[0, -2.2], [-0.4, -1.0], [-0.4, 0.8], [0, 2.2]]],
};
