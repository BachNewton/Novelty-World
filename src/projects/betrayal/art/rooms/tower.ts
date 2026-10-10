import * as THREE from "three";
import { createRng, pick } from "@/shared/lib/seeded-random";
import { animated } from "../animate";
import { strand } from "../kit";
import { lightAnchor } from "../light-anchor";
import { flickerOf, flickerSignal } from "../lighting";
import { RAMPS, type PaletteKey } from "../palette";
import type { RoomDefinition } from "../room";
import { batch, box, cylinder, flat, glow, group, lathe, lightMaterial } from "../shapes";
import { flagstones } from "../textures";

/** The fallen belfry lies along z, across the way between the two gates:
 *  this far either side of x = 0. */
const RAMPART = 0.62;
/** Half the low saddle in the rubble where the way over is, about z = 0. */
const SADDLE = 0.45;
/** Where the bell lies, and the stump that carries the beacon. */
const BELL_Z = -1.3;
const STUMP_Z = -2.42;
const STUMP_HEIGHT = 0.95;
/** The beacon's fire wavers with this signal; its glows follow it. */
const FIRE_SIGNAL = 2;

const STONES: PaletteKey[] = ["ash", "stoneDark", "stoneDark", "stone", "sootLight"];

/** Worn roof flags, dark enough that the open sky doesn't flatten them. */
function roofFlags(): THREE.Texture {
  return flagstones({ ramp: ["void", "soot", "sootLight", "ash"], mortar: "void", stonePx: 12, seed: "tower" });
}

/**
 * The belfry's fallen masonry, heaped along the line of the rampart from
 * `z0` to `z1`: dressed blocks tumbled on each other, highest in the middle
 * of the run and lower towards its ends, with broken beams of the bell frame
 * jutting from it.
 */
function rubbleBank(z0: number, z1: number, seed: string): THREE.Group {
  const rng = createRng(`tower-${seed}`);
  const b = batch();
  const mid = (z0 + z1) / 2;
  const half = (z1 - z0) / 2;
  const tumble = (size: [number, number, number], at: THREE.Vector3, tilt: number, colour: PaletteKey) =>
    b.add(size, colour, new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromEuler(new THREE.Euler((rng.next() - 0.5) * tilt, rng.next() * Math.PI, (rng.next() - 0.5) * tilt)), new THREE.Vector3(1, 1, 1)));
  // The bed: big blocks lying on the roof.
  for (let z = z0 + 0.2; z < z1 - 0.15; z += 0.26) {
    for (const x of [-0.4, -0.12, 0.15, 0.42]) {
      const w = 0.32 + rng.next() * 0.16;
      const h = 0.2 + rng.next() * 0.16;
      tumble([w, h, 0.28 + rng.next() * 0.1], new THREE.Vector3(x + (rng.next() - 0.5) * 0.08, h / 2 + 0.035, z + (rng.next() - 0.5) * 0.06), 0.12, pick(rng, STONES));
    }
  }
  // Blocks fallen on the bed, piled highest mid-run.
  for (let k = 0; k < (z1 - z0) * 9; k++) {
    const z = z0 + 0.25 + rng.next() * (z1 - z0 - 0.5);
    const rise = 1 - Math.abs(z - mid) / half;
    const s = 0.22 + rng.next() * 0.16;
    tumble([s * 1.4, s, s], new THREE.Vector3((rng.next() - 0.5) * 0.7, 0.32 + rise * 0.3 + rng.next() * 0.12, z), 0.7, pick(rng, STONES));
  }
  // Snapped timbers of the bell frame, leaning out of the heap.
  for (const [x, z, lean, turn] of [[-0.2, mid - half * 0.4, 0.55, 0.4], [0.25, mid + half * 0.3, -0.6, -0.3]] as const) {
    b.add([0.16, 1.15, 0.16], "woodDark", new THREE.Matrix4().compose(new THREE.Vector3(x, 0.55, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, turn, lean)), new THREE.Vector3(1, 1, 1)));
  }
  return group(b.mesh());
}

/** Flat sherds of stone strewn over the saddle in the heap, where the way
 *  over is: low enough to walk across, so it reads as the scramble. */
function saddleScree(): THREE.Group {
  const rng = createRng("tower-scree");
  const b = batch();
  for (let k = 0; k < 18; k++) {
    const at = new THREE.Vector3((rng.next() - 0.5) * RAMPART * 2, 0.012 + k * 0.0012, (rng.next() - 0.5) * SADDLE * 1.7);
    b.add([0.14 + rng.next() * 0.16, 0.022, 0.1 + rng.next() * 0.12], pick(rng, STONES), new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.next() * Math.PI), new THREE.Vector3(1, 1, 1)));
  }
  return group(b.mesh());
}

/** The belfry's great bell, green with age, crashed down and lying on its
 *  side, its mouth turned to the left gate, bright scars where it struck, a crack up its waist and the stump of its
 *  headstock still on its crown. Its axis runs along x. */
function fallenBell(): THREE.Group {
  const height = 1.0;
  const profile: [number, number][] = [
    [0, height],
    [0.24, height],
    [0.31, 0.92],
    [0.33, 0.62],
    [0.4, 0.3],
    [0.54, 0.07],
    [0.57, 0],
    [0.5, 0],
    [0.46, 0.06],
    [0.33, 0.28],
    [0.27, 0.6],
    [0.25, 0.88],
    [0, 0.93],
  ];
  const bronze = lathe(profile, flat("verdigrisLight"), 16);
  const bell = group(
    bronze,
    box([0.38, 0.06, 0.06], flat("void"), [0, 0.32, 0.35]),
    box([0.3, 0.16, 0.2], flat("woodDark"), [0, height - 0.02, 0]),
    box([0.06, 0.12, 0.08], flat("soot"), [0, height + 0.12, 0]),
  );
  // Scars of bright bronze down its waist, where it struck the stones.
  for (const turn of [0.4, 1.9, 3.3, 4.6]) {
    const streak = box([0.05, 0.42, 0.012], flat("brass"), [0, 0.45, 0]);
    const r = 0.355;
    streak.position.set(Math.sin(turn) * r, 0, Math.cos(turn) * r);
    streak.rotation.y = turn;
    streak.rotation.x = -0.18;
    bell.add(streak);
  }
  // Lying on its side: the crown to +x, the mouth to −x, rolled a little.
  bell.rotation.set(0.12, 0, -Math.PI / 2 + 0.1);
  bell.scale.setScalar(1.25);
  bell.position.set(-0.62, 0.7, 0);
  return group(bell);
}

/** The bell rope, trailing from the crown down the rubble to the roof. */
function bellRope(): THREE.Group {
  const b = batch();
  const points = [new THREE.Vector3(0, 0.62, 0), new THREE.Vector3(0.15, 0.45, 0.35), new THREE.Vector3(0.1, 0.04, 0.55), new THREE.Vector3(-0.3, 0.025, 0.62)];
  for (let i = 0; i < points.length - 1; i++) strand(b, points[i], points[i + 1], 0.035, "boneDark");
  return group(b.mesh());
}

/** A flame tongue that wavers with the beacon's signal. */
function tongue(x: number, z: number, height: number, radius: number, colour: PaletteKey, channel: 0 | 1 | 2 | 3): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 4).translate(0, height / 2, 0), glow(colour));
  mesh.position.set(x, 0, z);
  mesh.userData.noShadow = true;
  const signal = new THREE.Vector4();
  return animated(mesh, (seconds) => {
    flickerSignal(seconds, signal);
    mesh.scale.y = 1 + 0.45 * signal.getComponent(channel);
  });
}

/**
 * The stump of the belfry's corner pier, all that stands of it, with the
 * tower's beacon still burning on it: an iron fire basket of bars round a
 * bed of coals, flames licking out of it. Its light is the fire's.
 */
function beaconStump(): THREE.Group {
  const stone = flat("stone");
  const pier = group(
    box([0.56, STUMP_HEIGHT - 0.12, 0.5], stone, [0, 0, 0]),
    box([0.42, 0.14, 0.38], flat("stoneDark"), [0.04, STUMP_HEIGHT - 0.14, -0.02]),
  );
  const iron = flat("soot");
  const basket = group(cylinder(0.24, 0.03, iron, [0, 0, 0], { top: 0.22, sides: 8 }));
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const bar = box([0.025, 0.3, 0.025], iron, [0, 0, 0]);
    bar.position.set(Math.cos(a) * 0.22, 0.02, Math.sin(a) * 0.22);
    bar.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25);
    basket.add(bar);
  }
  basket.add(new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.015, 3, 12).rotateX(Math.PI / 2).translate(0, 0.3, 0), iron));
  const coals = cylinder(0.2, 0.08, glow("ember"), [0, 0.03, 0], { top: 0.18, sides: 8 });
  coals.userData.noShadow = true;
  const heat = new THREE.Mesh(new THREE.SphereGeometry(0.33, 8, 6).translate(0, 0.25, 0), lightMaterial(0.25));
  (heat.material as THREE.MeshBasicMaterial).color.set(flat("ember").color);
  heat.userData.noShadow = true;
  animated(heat, (seconds) => {
    (heat.material as THREE.MeshBasicMaterial).opacity = 0.18 + 0.12 * flickerOf(seconds, FIRE_SIGNAL);
  });
  basket.add(
    coals,
    heat,
    tongue(-0.07, 0.03, 0.38, 0.08, "ember", 0),
    tongue(0.08, -0.04, 0.34, 0.07, "ember", 1),
    tongue(0, 0.07, 0.3, 0.07, "amber", 3),
    tongue(0.02, -0.01, 0.48, 0.06, "amber", FIRE_SIGNAL),
    tongue(-0.02, 0.01, 0.26, 0.04, "flame", 1),
  );
  basket.position.y = STUMP_HEIGHT;
  basket.traverse((child) => {
    child.userData.noShadow = true;
  });
  basket.add(lightAnchor({ colour: "ember", intensity: 14, range: 9, flicker: 0.32, signal: FIRE_SIGNAL }, [0, 0.62, 0.05]));
  return group(pier, basket);
}

/** The Tower: the open top of the tower, its belfry fallen in a bank of
 *  masonry right across the roof between the two gates, the great bell
 *  lying in it on its side, all lit orange by the beacon still burning on
 *  the belfry's broken pier. */
export const TOWER: RoomDefinition = {
  id: "tower",
  floor: roofFlags,
  wall: () => flagstones({ ramp: RAMPS.stone, stonePx: 8, size: 64, seed: "tower-wall" }),
  trim: "soot",
  props: [
    { build: () => rubbleBank(SADDLE + 0.05, 2.55, "bottom"), name: "rubbleBank", at: [0, 0] },
    {
      build: () => rubbleBank(-2.3, -0.5, "under"),
      name: "rubbleBank",
      at: [0, 0],
      contacts: [
        { with: "fallenBell", because: "the bell lies half sunk in the masonry it brought down" },
        { with: "beaconStump", because: "the rubble is heaped round the stump's foot" },
      ],
    },
    { build: fallenBell, at: [0, BELL_Z] },
    { build: bellRope, at: [0.35, BELL_Z], contacts: [{ with: "fallenBell", because: "the rope is tied to the bell's crown" }, { with: "rubbleBank", because: "it trails down over the rubble" }] },
    { build: saddleScree, at: [0, 0] },
    { build: beaconStump, at: [0, STUMP_Z] },
  ],
  focus: [0, 0.6, -0.6],
  pawn: [-1.5, -1.0],
  spots: [[1.5, 1.0], [-1.55, 1.1], [1.5, -1.05], [-1.6, 2.15], [1.6, -2.15]],
};
