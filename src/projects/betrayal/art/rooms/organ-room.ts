import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createRng } from "@/shared/lib/seeded-random";
import { animated } from "../animate";
import { candelabra, chair, chamberstick, cobweb, rug } from "../kit";
import { solidLathe } from "../kit/vessel";
import { paletteHex, RAMPS, type PaletteKey } from "../palette";
import { INNER, onWall, type RoomDefinition } from "../room";
import { batch, box, cylinder, flat, glow, group } from "../shapes";
import { shiny, SHINES } from "../shine";
import { marble, panelling, wallpaper } from "../textures";

const SEED = "organ-room";

/** How far the organ's back stands off the top wall, clear of the skirting. */
const ORGAN_OUT = 0.06;
/** The organ's case: width across, depth from its back, and the height of its lower case. */
const CASE = { width: 2.7, depth: 0.85, height: 1.05 };
/** Where the pipes stand: on the case's cap. */
const PIPE_FOOT = CASE.height + 0.06;
/** The front of the keydesk, from the organ's back. */
const CONSOLE_FRONT = 1.2;
/** How far a key goes down when it is played. */
const KEY_TRAVEL = 0.009;
/** The slow figure the organ plays to itself, over and over: seconds a round. */
const PHRASE = 4.8;
/** Keys of the lower manual (by white key, from the left) and when in the phrase each goes down: a chord, built note by note. */
const CHORD = [[12, 0], [14, 0.6], [16, 1.2], [19, 1.8]] as const;
/** Keys of the upper manual and when each goes down: a two-note tune over the chord. */
const TUNE = [[23, 0.3], [24, 2.7], [26, 3.9]] as const;

/** Whether a key cued `at` seconds into the phrase is down: each is held for half the phrase. */
function pressed(seconds: number, at: number): boolean {
  return (((seconds - at) % PHRASE) + PHRASE) % PHRASE < PHRASE / 2;
}

/** Many solids of one draw, each coloured by palette key: the organ's pipes are dozens of lathes. */
function painted(parts: [THREE.BufferGeometry, PaletteKey][]): THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial> {
  const geometries = parts.map(([geometry, colour]) => {
    const { r, g, b } = new THREE.Color(paletteHex(colour));
    const count = geometry.getAttribute("position").count;
    const colours = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) colours.set([r, g, b], i * 3);
    geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
    return geometry;
  });
  const merged = mergeGeometries(geometries);
  for (const geometry of geometries) geometry.dispose();
  return new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
}

interface Pipe {
  x: number;
  z: number;
  /** Length from toe to top. */
  length: number;
  radius: number;
}

/** One open flue pipe standing on its toe: a cone foot, then the body, capped. */
function pipeGeometry({ x, z, length, radius }: Pipe): THREE.BufferGeometry {
  const foot = Math.min(0.28, length * 0.22);
  const geometry = new THREE.LatheGeometry(
    [new THREE.Vector2(0.014, -0.01), new THREE.Vector2(radius, foot), new THREE.Vector2(radius, length), new THREE.Vector2(0, length)],
    8,
  );
  geometry.translate(x, PIPE_FOOT, z);
  return geometry;
}

/** The front rank: three towers, tallest in the middle, with flats dipping between them. */
function frontRank(): Pipe[] {
  const count = 17;
  return Array.from({ length: count }, (_, i) => {
    const t = Math.abs(i - (count - 1) / 2) / ((count - 1) / 2);
    const length = 0.8 + 0.85 * (1 - t) ** 2 + 0.6 * t ** 4;
    return { x: -1.08 + (2.16 * i) / (count - 1), z: 0.58, length, radius: 0.026 + 0.022 * length };
  });
}

/** The rank behind, smaller, rising where the front rank dips so the two read as a depth of pipes. */
function backRank(): Pipe[] {
  const count = 12;
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    const length = 0.75 + 0.5 * Math.abs(Math.sin(t * Math.PI * 2));
    return { x: -1.0 + 2.0 * t, z: 0.3, length, radius: 0.025 + 0.018 * length };
  });
}

/** Where each pipe's mouth opens on its front: just above its foot. */
function mouthOf({ x, z, length, radius }: Pipe): THREE.BufferGeometry {
  const foot = Math.min(0.28, length * 0.22);
  const geometry = new THREE.BoxGeometry(radius * 1.1, 0.09, 0.02);
  geometry.translate(x, PIPE_FOOT + foot + 0.065, z + radius * 0.93);
  return geometry;
}

/** The case: a panelled lower case on a plinth, with a moulded cap the pipes stand on. Faces +z, its back at z = 0. */
function organCase(b: ReturnType<typeof batch>) {
  const { width, depth, height } = CASE;
  b.block([width + 0.04, 0.12, depth + 0.01], "woodDark", [0, 0, depth / 2]);
  b.block([width, height - 0.11, depth], "wood", [0, 0.11, depth / 2]);
  b.block([width + 0.06, 0.06, depth + 0.04], "woodDark", [0, height, depth / 2]);
  // Raised panels on the front either side of the keydesk, and down each side.
  for (const x of [-1.07, 1.07]) b.block([0.42, 0.42, 0.02], "woodMid", [x, 0.2, depth + 0.009]);
  for (const x of [-width / 2 - 0.009, width / 2 + 0.009]) {
    for (const z of [0.22, 0.62]) b.block([0.02, 0.62, 0.3], "woodMid", [x, 0.22, z]);
  }
  // Two tall end towers frame the pipes, so the case keeps an organ's outline from behind too.
  for (const side of [-1, 1]) {
    const x = side * (width / 2 - 0.07);
    b.block([0.14, 1.5, 0.7], "wood", [x, height + 0.05, 0.4]);
    b.block([0.2, 0.08, 0.76], "woodDark", [x, height + 1.55, 0.4]);
    b.block([0.1, 0.16, 0.1], "woodDark", [x, height + 1.63, 0.4]);
  }
}

/** The keydesk standing out of the case: two manuals, their cheeks, stop knobs to either side, and a music desk. */
function keydesk(b: ReturnType<typeof batch>, rng: ReturnType<typeof createRng>): THREE.Object3D[] {
  const front = CONSOLE_FRONT;
  const back = CASE.depth - 0.01;
  b.block([1.4, 0.68, front - back], "wood", [0, 0.004, (front + back) / 2]);
  b.block([1.44, 0.03, front - back + 0.02], "woodDark", [0, 0.65, (front + back) / 2]);
  const keys = 1.06;
  const white = keys / 35;
  const playing: THREE.Object3D[] = [];
  /** A manual of 35 white keys on a dark bed, with its sharps; the keys in `played` go down and up by themselves. */
  const manual = (y: number, z0: number, z1: number, played: readonly (readonly [key: number, at: number])[]) => {
    const depth = z1 - z0;
    b.block([keys + 0.01, 0.012, depth], "soot", [0, y, (z0 + z1) / 2]);
    const keyMaterial = flat("boneLight");
    for (let i = 0; i < 35; i++) {
      const x = -keys / 2 + (i + 0.5) * white;
      const cue = played.find(([key]) => key === i);
      if (cue) {
        const key = box([white - 0.004, 0.024, depth - 0.006], keyMaterial, [x, y + 0.006, (z0 + z1) / 2 + 0.006]);
        key.userData.noShadow = true;
        playing.push(animated(key, (seconds) => {
          key.position.y = pressed(seconds, cue[1]) ? -KEY_TRAVEL : 0;
        }));
      } else {
        b.block([white - 0.004, 0.024, depth - 0.006], "boneLight", [x, y + 0.006, (z0 + z1) / 2 + 0.006]);
      }
      if ([0, 1, 3, 4, 5].includes(i % 7) && i < 34) {
        b.block([white * 0.55, 0.018, depth * 0.55], "soot", [-keys / 2 + (i + 1) * white, y + 0.028, z0 + depth * 0.36]);
      }
    }
  };
  manual(0.68, front - 0.17, front - 0.02, CHORD);
  b.block([keys + 0.02, 0.08, 0.17], "woodDark", [0, 0.68, back + 0.1]);
  manual(0.76, back + 0.03, back + 0.17, TUNE);
  for (const x of [-0.6, 0.6]) b.block([0.12, 0.22, front - back - 0.01], "woodDark", [x, 0.68, (front + back) / 2 - 0.005]);
  // The music desk, leaning back over the upper manual, with a sheet of music open on it.
  const desk = new THREE.Matrix4().makeRotationX(-0.28).setPosition(0, 1.08, back + 0.06);
  b.add([0.9, 0.42, 0.025], "woodDark", desk);
  b.add([0.62, 0.32, 0.01], "boneLight", desk.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.01, 0.017)));
  b.add([0.96, 0.04, 0.06], "woodDark", new THREE.Matrix4().makeRotationX(-0.28).setPosition(0, 0.87, back + 0.11));
  // The stop jambs: panels on the case front, each with three rows of knobs; some drawn out, some pushed home.
  for (const side of [-1, 1]) {
    const cx = side * 0.92;
    b.block([0.36, 0.32, 0.02], "woodDark", [cx, 0.72, CASE.depth + 0.01]);
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const drawn = rng.next() < 0.6;
        const reach = drawn ? 0.1 : 0.04;
        const x = cx + (col - 1) * 0.1;
        const y = 0.79 + row * 0.085;
        b.block([0.024, 0.024, reach], "woodMid", [x, y - 0.012, CASE.depth + 0.02 + reach / 2]);
        b.block([0.04, 0.04, 0.015], drawn ? "boneLight" : "bone", [x, y - 0.02, CASE.depth + 0.02 + reach]);
      }
    }
  }
  return playing;
}

/** The pedalboard on the floor under the keydesk: pale naturals, dark sharps, in a low frame. */
function pedalboard(b: ReturnType<typeof batch>) {
  const z0 = CONSOLE_FRONT - 0.02;
  const z1 = CONSOLE_FRONT + 0.52;
  b.block([1.24, 0.05, z1 - z0], "woodDark", [0, 0, (z0 + z1) / 2]);
  for (let i = 0; i < 13; i++) {
    const x = -0.57 + i * 0.095;
    b.block([0.05, 0.03, z1 - z0 - 0.06], "woodLight", [x, 0.048, (z0 + z1) / 2 + 0.02]);
    if ([0, 1, 3, 4, 5, 7, 8, 10, 11].includes(i) && i < 12) {
      b.block([0.04, 0.05, 0.18], "soot", [x + 0.0475, 0.06, z0 + 0.12]);
    }
  }
}

/**
 * The pipe organ, backed against a wall and facing +z: a panelled case with
 * its keydesk and pedalboard, two ranks of pale tin pipes standing open above
 * it, and a cold pale breath glowing in every pipe's mouth, as if it still sounds.
 * Its stops are drawn, its keydesk candles lit, and its keys go down and up
 * by themselves, playing a slow chord to an empty bench.
 */
function pipeOrgan(): THREE.Group {
  const rng = createRng(`${SEED}:stops`);
  const b = batch();
  organCase(b);
  const playing = keydesk(b, rng);
  pedalboard(b);
  const front = frontRank();
  const back = backRank();
  const pipes = painted([
    ...[...back, ...front].map((pipe): [THREE.BufferGeometry, PaletteKey] => [pipeGeometry(pipe), "stoneLight"]),
  ]);
  shiny(pipes.material, SHINES.silver);
  const mouths = new THREE.Mesh(mergeGeometries([...front, ...back].map(mouthOf)), glow("moonLight"));
  mouths.userData.noShadow = true;
  const result = group(b.mesh(), pipes, mouths, ...playing);
  for (const x of [-0.6, 0.6]) {
    const stick = chamberstick({ height: 0.1, intensity: 1.6, range: 5 });
    stick.position.set(x, 0.9, (CASE.depth + CONSOLE_FRONT) / 2);
    result.add(stick);
  }
  return result;
}

/** The organ bench, knocked over backwards as whoever sat there sprang up: its four legs reach for the organ, its seat faces the room. */
function toppledBench(): THREE.Group {
  const wood = flat("wood");
  const dark = flat("woodDark");
  const upright = group(box([1.15, 0.05, 0.38], wood, [0, 0.45, 0]), box([1.0, 0.08, 0.3], dark, [0, 0.38, 0]));
  for (const x of [-0.48, 0.48]) {
    for (const z of [-0.13, 0.13]) upright.add(box([0.06, 0.4, 0.06], dark, [x, 0, z]));
  }
  // Tipped back about its seat's edge: the seat stands on edge, the legs out level above the floor.
  upright.rotation.x = Math.PI / 2;
  upright.position.set(0, 0.19, -0.5);
  return group(upright);
}

/** Sheets of music blown out across the floor from the keydesk, as if by the organ's last blast. */
function scatteredMusic(): THREE.Mesh {
  const rng = createRng(`${SEED}:sheets`);
  const b = batch();
  for (let i = 0; i < 14; i++) {
    const angle = -0.9 + rng.next() * 1.8;
    const reach = 0.3 + rng.next() * 1.7;
    const at = new THREE.Vector3(Math.sin(angle) * reach, 0.009 + i * 0.0035, Math.cos(angle) * reach);
    const turn = new THREE.Matrix4().makeRotationY(rng.next() * Math.PI);
    b.add([0.22, 0.003, 0.3], i % 3 === 0 ? "bone" : "boneLight", turn.setPosition(at));
  }
  return b.mesh();
}

/** A tall brass torchère: a turned stand carrying a three-armed candelabra at head height. */
function torchere(): THREE.Group {
  const brass = shiny(flat("brass"), SHINES.brass);
  const stand = group(
    cylinder(0.2, 0.04, flat("woodDark"), [0, 0, 0], { top: 0.16, sides: 8 }),
    solidLathe([[0.05, 0], [0.04, 0.2], [0.025, 0.4], [0.03, 1.1], [0.07, 1.16], [0, 1.18]], brass, 8),
  );
  stand.children[1].position.y = 0.04;
  const top = candelabra({ arms: 3, intensity: 5 });
  top.position.y = 1.21;
  return group(stand, top);
}

/** A low music cabinet against a wall, facing +z, with bound scores stacked on top. */
function musicCabinet(): THREE.Group {
  const b = batch();
  b.block([0.9, 0.08, 0.42], "woodDark", [0, 0, 0]);
  b.block([0.86, 0.72, 0.4], "wood", [0, 0.07, 0]);
  b.block([0.94, 0.04, 0.45], "woodDark", [0, 0.79, 0]);
  for (const x of [-0.21, 0.21]) b.block([0.36, 0.56, 0.02], "woodMid", [x, 0.15, 0.205]);
  const rng = createRng(`${SEED}:scores`);
  let y = 0.83;
  for (let i = 0; i < 4; i++) {
    const turn = new THREE.Matrix4().makeRotationY((rng.next() - 0.5) * 0.4);
    const h = 0.03 + rng.next() * 0.02;
    b.add([0.3, h, 0.38], (["blood", "verdigrisDark", "woodMid", "bruise"] as const)[i], turn.setPosition(-0.15, y + h / 2, 0));
    y += h;
  }
  return group(b.mesh());
}

const SURFACES = {
  wall: () => wallpaper({ ground: "sootLight", stripe: "tideDark", motif: "moon", seed: SEED }),
  wainscot: () => panelling({ ramp: RAMPS.wood, seed: SEED, glints: false }),
  trim: "woodDark",
} satisfies Pick<RoomDefinition, "wall" | "wainscot" | "trim">;

const organ = onWall("top", 0, { out: ORGAN_OUT });
/** The organ's front, in room metres. */
const ORGAN_Z = -INNER + ORGAN_OUT;

/** The Organ Room: a music room in slate-blue damask, a pipe organ filling the
 *  wall opposite the door, breathing cold out of its pipes and playing itself:
 *  the bench lies overturned and the music is blown across the floor. */
export const ORGAN_ROOM: RoomDefinition = {
  id: "organ-room",
  floor: () => marble({ chequer: false, pale: "stoneDark", grout: "stoneDark", veins: 0, seed: SEED }),
  ...SURFACES,
  props: [
    { build: pipeOrgan, at: organ.at, turn: organ.turn },
    { build: () => rug({ width: 2.6, length: 2.2, field: "blood", border: "bloodDark", motif: "brass", fringe: "boneDark" }), name: "rug", at: [0, -0.35] },
    { build: toppledBench, at: [0.1, ORGAN_Z + 2.3], turn: -10 },
    { build: scatteredMusic, at: [0, ORGAN_Z + 1.9] },
    { build: torchere, at: [2.3, -1.2] },
    { build: torchere, at: [-2.25, 2.05] },
    { build: musicCabinet, ...onWall("left", 1.75, { out: 0.27 }) },
    { build: () => chamberstick({ height: 0.14, intensity: 1.8, range: 5 }), name: "cabinet candle", ...onWall("left", 2.05, { out: 0.27, y: 0.83 }) },
    { build: () => chair(), at: [1.9, 1.5], turn: 200 },
    { build: () => chair(), at: [1.1, 1.9], turn: 165 },
    { build: () => cobweb({ form: "slung" }), at: [INNER - 0.29, -INNER + 0.29], y: 3.05, turn: -45, walls: ["top", "right"] },
  ],
  lights: [
    // The cold breathing out of the pipe mouths.
    { at: [0, 1.6, ORGAN_Z + 0.9], colour: "moonLight", intensity: 4, range: 6 },
  ],
  focus: [0, 1.1, -1.6],
  prime: [1.2, 0.2],
};
