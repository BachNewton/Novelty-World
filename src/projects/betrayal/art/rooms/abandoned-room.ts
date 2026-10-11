import * as THREE from "three";
import { animated } from "../animate";
import { chamberstick, cobweb } from "../kit";
import { strand } from "../kit/rope";
import { lightAnchor } from "../light-anchor";
import { shiny, shinyAll, SHINES } from "../shine";
import { paletteHex, RAMPS } from "../palette";
import type { Edge } from "../../types";
import { crossLanes, INNER, onWall, type PropPlacement, type RoomDefinition } from "../room";
import type { WallMark } from "../wall-marks";
import { batch, flat, group, lightMaterial, projectUvs, textured } from "../shapes";
import { panelling, TEXELS_PER_METRE, wallpaper, woodPlanks } from "../textures";

const SEED = "abandoned-room";
/** Where the rocking horse stands, alone on the ghost of its rug. */
const HORSE: [number, number] = [-1.3, -1.25];
/** The horse is a big one, built a size up from a child's. */
const SCALE = 1.25;
/** The boards' plank layout; a ghost patch draws the same planks paler. */
const PLANKS = { plankPx: 8, size: 64, seed: SEED, glints: false };

/**
 * Pale ghosts in the boards where furniture stood until it was carried out:
 * the same planks as the floor, unfaded, laid a centimetre over it. Each is
 * [x0, x1, z0, z1] in room metres.
 */
function ghostBoards(): THREE.Group {
  const texture = woodPlanks({ ramp: ["woodMid", "woodLight", "boneDark", "bone"], ...PLANKS });
  const material = textured(texture);
  const patches: [number, number, number, number][] = [
    // The rug the horse still stands on.
    [-2.3, -0.2, -2.15, -0.35],
    // A long piece against the bottom wall: a sideboard, or a piano.
    [0.85, 2.55, 2.05, 2.75],
    // A cabinet against the right wall.
    [2.15, 2.75, -2.2, -1.05],
  ];
  const result = group();
  const grime = flat("soot");
  const texel = 1 / TEXELS_PER_METRE;
  const strip = (x0: number, x1: number, z0: number, z1: number, material: THREE.Material, y: number) => {
    const piece = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, y, (z0 + z1) / 2), material);
    piece.userData.noShadow = true;
    result.add(piece);
    return piece;
  };
  for (const [x0, x1, z0, z1] of patches) {
    const patch = strip(x0, x1, z0, z1, material, 0.01);
    projectUvs(patch.geometry, texture);
    // A line of grime round it, where dust banked against the furniture's foot.
    strip(x0 - texel, x1 + texel, z0 - texel, z0, grime, 0.011);
    strip(x0 - texel, x1 + texel, z1, z1 + texel, grime, 0.011);
    strip(x0 - texel, x0, z0, z1, grime, 0.011);
    strip(x1, x1 + texel, z0, z1, grime, 0.011);
  }
  // Scratches where the long piece was dragged towards the bottom doorway.
  const scratch = flat("boneDark");
  for (const [z, from] of [[2.18, 0.6], [2.3, 0.68], [2.56, 0.64]] as const) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.8 - from, 1 / 16).rotateX(-Math.PI / 2).translate((from + 0.8) / 2, 0.012, z), scratch);
    line.userData.noShadow = true;
    result.add(line);
  }
  return result;
}

/**
 * A child's dapple rocking horse on red bow rockers, the one thing left in
 * the room, rocking by itself. Faces +z, its rockers running along z. It
 * casts no shadow, as a baked one would stand still while it rocks.
 */
function rockingHorse(): THREE.Group {
  const b = batch();
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  // The bow rockers: lengths of one arc, a little long so they overlap at the joints.
  const radius = 1.6;
  const reach = Math.asin(0.62 / radius);
  const steps = 8;
  const arc = (2 * reach) / steps;
  for (const x of [-0.2, 0.2]) {
    for (let i = 0; i < steps; i++) {
      const at = -reach + (i + 0.5) * arc;
      const centre = v(x, radius + 0.01 - (radius - 0.04) * Math.cos(at), (radius - 0.04) * Math.sin(at));
      // Every other length a hair narrower, so the overlapping lengths' sides never share a plane.
      b.add([i % 2 ? 0.046 : 0.05, 0.08, radius * arc + 0.02], "blood", new THREE.Matrix4().compose(centre, new THREE.Quaternion().setFromEuler(new THREE.Euler(-at, 0, 0)), v(1, 1, 1)));
    }
  }
  // Slats across the rockers, and the turned stand rail they carry.
  const rockerTop = (z: number) => radius + 0.01 - radius * Math.cos(Math.asin(z / radius)) + 0.08;
  for (const z of [-0.5, 0.5]) b.block([0.48, 0.04, 0.09], "bloodDark", [0, rockerTop(z) - 0.02, z]);
  // The legs, splayed from the slats up to the belly.
  for (const [z, top] of [[-0.5, -0.24], [0.5, 0.22]] as const) {
    for (const x of [-0.17, 0.17]) strand(b, v(x, rockerTop(z) + 0.01, z), v(x * 0.5, 0.52, top), 0.05, "bone");
    for (const x of [-0.175, 0.175]) b.block([0.07, 0.05, 0.08], "soot", [x, rockerTop(z) + 0.015, z]);
  }
  // The barrel of the body, rounded by a second block, and the chest.
  b.block([0.26, 0.26, 0.64], "bone", [0, 0.49, -0.02]);
  b.block([0.21, 0.32, 0.54], "boneLight", [0, 0.46, -0.02]);
  b.block([0.23, 0.24, 0.16], "bone", [0, 0.53, 0.28]);
  // Dapples on its flanks, standing proud of them.
  for (const [x, y, z] of [[1, 0.62, -0.14], [1, 0.56, 0.06], [-1, 0.6, -0.04], [-1, 0.55, 0.18], [1, 0.66, 0.2]] as const) {
    b.block([0.012, 0.05, 0.06], "stoneLight", [x * 0.135, y, z]);
  }
  // Neck, head and ears.
  strand(b, v(0, 0.68, 0.24), v(0, 0.98, 0.42), 0.15, "bone");
  strand(b, v(0, 1.02, 0.4), v(0, 0.86, 0.64), 0.12, "bone", Math.PI / 2);
  strand(b, v(0, 0.82, 0.66), v(0, 0.86, 0.7), 0.09, "boneDark", Math.PI / 2);
  for (const x of [-0.04, 0.04]) strand(b, v(x, 1.05, 0.38), v(x * 1.3, 1.15, 0.35), 0.035, "boneDark");
  // The mane down the neck, the forelock, and the tail.
  strand(b, v(0, 0.78, 0.18), v(0, 1.08, 0.36), 0.07, "soot", Math.PI / 4);
  strand(b, v(0, 0.69, -0.32), v(0, 0.42, -0.48), 0.08, "soot", Math.PI / 4);
  // The saddle, its cloth hanging down the flanks, and the bridle's reins.
  b.block([0.32, 0.13, 0.22], "blood", [0, 0.64, -0.04]);
  b.block([0.22, 0.05, 0.26], "bloodDark", [0, 0.79, -0.04]);
  strand(b, v(0, 0.83, 0.07), v(0, 0.87, 0.55), 0.02, "bloodDark");
  // Its glass eyes, standing proud of the head.
  for (const x of [-1, 1]) b.block([0.03, 0.03, 0.04], "void", [x * 0.06, 0.93, 0.5]);
  // Painted wood, its gloss dulled by the dust.
  const body = b.mesh();
  shiny(body.material, SHINES.polishedWood);
  const horse = group(body);
  horse.traverse((child) => {
    child.userData.noShadow = true;
  });
  horse.scale.setScalar(SCALE);
  return group(
    animated(horse, (seconds) => {
      // It rolls on its bows: a turn about the centre of their curve, which lies this far above the floor.
      const turn = 0.11 * Math.sin(seconds * 1.4);
      horse.rotation.x = turn;
      horse.position.set(0, SCALE * radius * (1 - Math.cos(turn)), -SCALE * radius * Math.sin(turn));
    }),
  );
}

/**
 * The light of the lamp that stood by the horse, still falling though the
 * lamp is gone: a steady amber pool on the rug's ghost, with nothing above
 * it to give it. It never wavers, as no flame does.
 */
function lamplessPool(): THREE.Group {
  const reach = 1.15;
  const geometry = new THREE.CircleGeometry(reach, 24).rotateX(-Math.PI / 2).translate(0, 0.02, 0);
  // Brightest under the horse, fading out to nothing at its rim.
  const amber = new THREE.Color(paletteHex("amber"));
  const position = geometry.getAttribute("position");
  const colours: number[] = [];
  for (let i = 0; i < position.count; i++) colours.push(...amber.clone().multiplyScalar(1 - Math.hypot(position.getX(i), position.getZ(i)) / reach).toArray());
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
  const pool = new THREE.Mesh(geometry, lightMaterial(0.4, { vertexColors: true }));
  pool.userData.noShadow = true;
  return group(pool, lightAnchor({ colour: "amber", intensity: 8, range: 7 }, [0, 1.9, 0]));
}

/** A picture taken down and left leaning on the wall with its face turned to it: its canvas back and stretchers out. Back at z = 0. */
function turnedPicture(): THREE.Group {
  const b = batch();
  const [w, h] = [0.8, 0.66];
  b.block([w, h, 0.04], "woodMid", [0, 0, 0.02]);
  b.block([w - 0.1, h - 0.1, 0.02], "boneDark", [0, 0.05, 0.05]);
  b.block([w - 0.12, 0.05, 0.03], "wood", [0, h / 2 - 0.025, 0.06]);
  b.block([0.05, h - 0.12, 0.034], "wood", [0, 0.06, 0.06]);
  const picture = group(b.mesh());
  picture.rotation.x = -0.2;
  picture.position.z = 0.13;
  return group(picture);
}

/** The nail a picture hung from, left in the wall, a short end of its wire
 *  still twisted round it. Its point at the wall face (z = 0). */
function nail(): THREE.Group {
  const b = batch();
  b.block([0.012, 0.012, 0.05], "stoneDark", [0, -0.006, 0.005]);
  b.block([0.026, 0.026, 0.008], "stone", [0, -0.013, 0.032]);
  strand(b, new THREE.Vector3(0.004, -0.008, 0.024), new THREE.Vector3(0.05, -0.1, 0.022), 0.008, "brass");
  return group(b.mesh());
}

/** Where a picture hung until it was taken down: the paper it kept from
 *  fading, richer than the rest, with a nail above it. */
function pictureGhost(edge: Edge, along: number, y: number, [w, h]: [number, number]): { mark: WallMark; nail: PropPlacement } {
  return {
    mark: { edge, along, y, size: [w, h], change: { recolour: { woodDark: "wood", wood: "woodMid", brass: "gold" } }, soft: 0.09, seed: `${SEED}-${edge}-${along}` },
    nail: { build: nail, ...onWall(edge, along, { y: y + h + 0.12 }), contacts: [{ with: edge, because: "it is driven into the wall" }] },
  };
}

const GHOSTS = [pictureGhost("top", -1.6, 1.35, [0.7, 0.55]), pictureGhost("top", 1.6, 1.45, [0.4, 0.5]), pictureGhost("right", 1.4, 1.3, [0.9, 0.6])];

/** A chamberstick gone dull, left on the floor, its candle burnt almost down. */
function guttered(): THREE.Group {
  const piece = chamberstick({ height: 0.05, intensity: 3.5, range: 7 });
  const [brass, wax] = [new THREE.Color(paletteHex("brass")), new THREE.Color(paletteHex("bone"))];
  shinyAll(piece, SHINES.tarnishedBrass, (material) => material instanceof THREE.MeshLambertMaterial && material.color.equals(brass));
  shinyAll(piece, SHINES.wax, (material) => material instanceof THREE.MeshLambertMaterial && material.color.equals(wax));
  return piece;
}

/** The Abandoned Room: a parlour stripped bare, its furniture carried off
 *  and only pale ghosts of it left in the boards, and in the middle of what
 *  was its rug a child's rocking horse rocking by itself in the steady
 *  light of a lamp that is no longer there. */
export const ABANDONED_ROOM: RoomDefinition = {
  id: "abandoned-room",
  floor: () => woodPlanks({ ramp: RAMPS.wood, ...PLANKS }),
  wall: () => wallpaper({ ground: "woodDark", stripe: "wood", motif: "brass", seed: SEED }),
  wallMarks: GHOSTS.map((ghost) => ghost.mark),
  wainscot: () => panelling({ ramp: RAMPS.wood, seed: SEED, glints: false }),
  trim: "woodDark",
  props: [
    { build: ghostBoards, at: [0, 0] },
    { build: rockingHorse, at: HORSE, turn: 90 },
    { build: lamplessPool, at: HORSE },
    ...GHOSTS.map((ghost) => ghost.nail),
    { build: turnedPicture, ...onWall("left", -1.6) },
    { build: guttered, name: "chamberstick", at: [-2.3, 0.85] },
    { build: () => cobweb({ form: "slung" }), name: "cobweb", at: [-INNER + 0.29, -INNER + 0.29], y: 3.05, turn: -45, walls: ["top", "left"] },
    { build: () => cobweb({ form: "slung" }), name: "cobweb", at: [INNER - 0.29, INNER - 0.29], y: 3.05, turn: 135, walls: ["right", "bottom"] },
  ],
  focus: [-1.2, 0.6, -1.2],
  prime: [1.2, 1.0],
  lanes: crossLanes(),
};
