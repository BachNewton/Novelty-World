import * as THREE from "three";
import { ball, roundBox, sculpt } from "../forms";
import { figureParts } from "../figure-parts";
import { group } from "../shapes";
import { SHINES } from "../shine";
import { assembled, itemModel, onPlate, piece } from "./item";

/*
 * The Dark Dice (item): three dice of a deep, bruised violet with bone-white
 * pips, a set somebody should not have kept, their colour the occult's. They
 * read as dice by their cubes and pips, held up about three times life-size
 * so the pips show: one in the fist, two perched on it, tumbled. Carried
 * upright; on the floor the three lie scattered on the plate, as rolled.
 */

/** A die's half-size and how round its edges are, and a pip's radius and its offset from a face's middle. */
const DIE = { half: 0.021, round: 0.0055 };
const PIP = { radius: 0.0039, off: 0.0102 };

/** Where each face's pips lie, [across, along] the face, in pip offsets. */
const FACES: Record<number, readonly (readonly [number, number])[]> = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [-1, 1], [1, -1], [1, 1]],
  5: [[-1, -1], [-1, 1], [0, 0], [1, -1], [1, 1]],
  6: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]],
};

/** Each face's outward axis and the number on it: opposite faces add to seven. */
const SIDES: readonly { axis: 0 | 1 | 2; sign: 1 | -1; pips: number }[] = [
  { axis: 1, sign: 1, pips: 1 },
  { axis: 1, sign: -1, pips: 6 },
  { axis: 2, sign: 1, pips: 2 },
  { axis: 2, sign: -1, pips: 5 },
  { axis: 0, sign: 1, pips: 3 },
  { axis: 0, sign: -1, pips: 4 },
];

/** A die round its middle: a rounded cube, its pips sunk in its faces and painted pale. */
function dieGeometry(): THREE.BufferGeometry {
  const shape = sculpt().add(roundBox([0, 0, 0], [DIE.half, DIE.half, DIE.half], DIE.round), "bruise");
  for (const { axis, sign, pips } of SIDES) {
    const [u, v] = ([0, 1, 2] as const).filter((other) => other !== axis);
    for (const [a, b] of FACES[pips]) {
      const at: [number, number, number] = [0, 0, 0];
      at[axis] = sign * (DIE.half + PIP.radius * 0.35);
      at[u] = a * PIP.off;
      at[v] = b * PIP.off;
      shape.carve(ball(at, PIP.radius), { blend: 0.0012, colour: "boneLight" });
    }
  }
  return shape.geometry(0.0011);
}

const PARTS = figureParts("item:dark-dice", () => ({ die: dieGeometry() }));

/** A die posed: where its middle lies and how it is turned, its yaw last, so a die tipped onto a face still lies flat. */
function die(name: string, at: THREE.Vector3Tuple, turn: THREE.Vector3Tuple): THREE.Mesh {
  const mesh = piece(PARTS.get().die, name, SHINES.lacquer);
  mesh.position.set(...at);
  mesh.rotation.set(...turn, "YXZ");
  return mesh;
}

/** In the hand: one die in the fist, two tumbled on top of it, clear of each other. */
function heldDice(): THREE.Group {
  const lower = die("dark die", [0, 0, 0], [0, 0.3, 0]);
  const left = die("dark die 2", [0.002, 0.048, -0.017], [0.18, -0.3, 0.1]);
  const right = die("dark die 3", [-0.004, 0.046, 0.039], [-0.22, 0.45, -0.15]);
  return assembled("dark dice", [lower, left, right], [
    { between: [lower, left], at: [0, 0.024, -0.01], radius: 0.024 },
    { between: [lower, right], at: [0, 0.024, 0.022], radius: 0.024 },
  ]);
}

/** On the floor: the three as they fell, each on a different face. */
function rolledDice(): THREE.Group {
  const y = DIE.half;
  return group(
    die("dark die", [-0.03, y, -0.022], [0, 0.4, 0]),
    die("dark die 2", [0.032, y, -0.012], [Math.PI / 2, -0.3, 0]),
    die("dark die 3", [0, y, 0.035], [0, 1.1, -Math.PI / 2]),
  );
}

export const DARK_DICE = itemModel({
  card: "dark-dice",
  parts: [PARTS],
  held: () => ({ object: heldDice(), handle: DIE.half * 1.08, carry: "upright" }),
  plate: { lie: new THREE.Euler(), spin: 0 },
  floor: () => onPlate(rolledDice(), { lie: new THREE.Euler(), spin: 0.3 }),
});
