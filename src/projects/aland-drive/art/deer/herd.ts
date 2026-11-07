import { BufferAttribute, BufferGeometry, DynamicDrawUsage, InstancedBufferAttribute, InstancedBufferGeometry, Mesh } from "three/webgpu";
import { measuredSwapM } from "../lod-swaps";
import { GAIT_SHAPES, GAITS, SUMMER, type DeerSeason, type Gait } from "./gaits";
import { deerMaterial, deerShadowMaterial, SWAP_BAND, type DeerInputs } from "./material";
import { buildDeer, DEER_KINDS, deerSize, type DeerKind, type DeerMesh, type Detail } from "./shape";

/*
 * Roe deer as the game will have them: a few at a time, moved by the game round
 * the player as the cyclists are, never simulated bodies. Each kind is two lists,
 * near and far, and one list of shadows serves them all, so a herd is seven draws
 * at most however many deer are in it. Each frame the game hands over every deer
 * as it stands, its place, its gait and how fast it's going, and the herd keeps
 * each one's cycle running from frame to frame and blends a change of gait, so a
 * deer that breaks from a walk into a bound does so in a stride rather than a jump.
 */

/** Past this a deer isn't drawn: about a pixel and a half tall on the floor's screen, and it dissolves over the last of it. */
export const DEER_REACH_M = 700;
/** Where a kind swaps to its far version when the LOD check hasn't measured it. */
const UNMEASURED_SWAP_M = 40;
/** How far the lists reach past where the shader shows a version, for an eye that isn't quite the camera. */
const LIST_SLACK_M = 1;
/** How long a change of gait takes to blend. */
const BLEND_S = 0.3;

export interface HerdDeer {
  /** Stable while the deer is in the herd: its cycle is kept per id, and dropped when the id stops appearing. */
  id: string;
  /** Scene metres, on the ground. */
  x: number;
  y: number;
  z: number;
  /** Turns the deer's +z towards (sin yaw, cos yaw). */
  yaw: number;
  kind: DeerKind;
  gait: Gait;
  /** Metres a second it's moving at, so its feet keep pace with the ground; the gait's own speed if left out. */
  speed?: number;
  /** How far its head turns from straight ahead, to look at something, in radians, up to about a right angle. */
  turn?: number;
  /** The same seed is the same deer: its size and its own motions. */
  seed: number;
  /** Holds the deer at this point of its gait's cycle, in turns, rather than running it. */
  cycle?: number;
}

/** A kind's deer as a geometry with no instances yet: the rest pose and everything its vertices carry. */
export function deerGeometry(mesh: DeerMesh): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(mesh.positions, 3));
  geometry.setAttribute("joints", new BufferAttribute(mesh.joints, 4));
  geometry.setAttribute("outer", new BufferAttribute(mesh.outers, 3));
  geometry.setAttribute("paint", new BufferAttribute(mesh.paints, 4, true));
  geometry.setIndex(new BufferAttribute(mesh.indices, 1));
  return geometry;
}

/** The gait each kind is measured in by the LOD check, and the point of its cycle: square, mid-stride, and in flight. */
export const CHECKED_POSES: readonly { gait: Gait; cycle: number }[] = [
  { gait: "stand", cycle: 0 },
  { gait: "walk", cycle: 0.15 },
  { gait: "trot", cycle: 0.2 },
  { gait: "bound", cycle: 0.35 },
];

/**
 * One version of a kind as the LOD check measures it in a pose: the rest geometry with that pose written on it, so
 * each pose is a model of its own in `swaps.json`. The shader doesn't read it.
 */
export function checkedGeometry(kind: DeerKind, detail: Detail, pose: (typeof CHECKED_POSES)[number]): BufferGeometry {
  const geometry = deerGeometry(buildDeer(kind, detail));
  const count = geometry.getAttribute("position").count;
  geometry.setAttribute("checkedPose", new BufferAttribute(new Float32Array(count * 2).map((_, index) => (index % 2 === 0 ? GAITS.indexOf(pose.gait) : pose.cycle)), 2));
  return geometry;
}

/** Where a kind swaps to its far version: the furthest of its poses' measured swaps, so none of them is noticed. */
export const deerSwapM = (kind: DeerKind) => Math.max(...CHECKED_POSES.map((pose) => measuredSwapM(checkedGeometry(kind, "near", pose), checkedGeometry(kind, "far", pose), UNMEASURED_SWAP_M)));

const roll = (seed: number, salt: number) => ((Math.imul(seed ^ Math.imul(salt, 0x5bd1e995), 2654435761) >>> 0) / 4294967296);

/** One list of one version of one kind, for up to `room` deer: one draw call. */
function deerList(inputs: DeerInputs, kind: DeerKind, detail: Detail, swapM: number, room: number) {
  const built = buildDeer(kind, detail);
  const shape = deerGeometry(built);
  const geometry = new InstancedBufferGeometry();
  for (const name of ["position", "joints", "outer", "paint"]) geometry.setAttribute(name, shape.getAttribute(name));
  geometry.setIndex(shape.getIndex());
  const rows = Object.fromEntries(["deerPlace", "deerGait", "deerLook", "deerBody"].map((name) => {
    const values = new InstancedBufferAttribute(new Float32Array(room * 4), 4);
    values.setUsage(DynamicDrawUsage);
    geometry.setAttribute(name, values);
    return [name, values];
  }));
  geometry.instanceCount = 0;
  const material = deerMaterial(inputs, kind, detail, swapM, DEER_REACH_M);
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.visible = false;
  let count = 0;
  return {
    mesh,
    rows,
    triangles: built.indices.length / 3,
    count: () => count,
    begin() {
      count = 0;
    },
    add(values: Record<string, readonly number[]>) {
      if (count === room) throw new Error(`more than ${room} deer on one ${kind} list`);
      for (const [name, row] of Object.entries(values)) rows[name].set(row, count * 4);
      count++;
    },
    end() {
      geometry.instanceCount = count;
      mesh.visible = count > 0;
      for (const values of Object.values(rows)) {
        values.addUpdateRange(0, count * 4);
        values.needsUpdate = true;
      }
    },
    dispose() {
      shape.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}

interface Motion {
  gait: Gait;
  cycle: number;
  from: Gait;
  /** How much of the gait before is left, 1 just after a change and 0 once blended. */
  fromShare: number;
}

/**
 * A herd: two lists a kind and one of shadows, `room` deer at most. `draw` each frame with every deer as it stands;
 * the meshes go in the scene once. `kinds` limits it to the kinds it will draw.
 */
export function createDeerHerd({ inputs, room, kinds = DEER_KINDS }: { inputs: DeerInputs; room: number; kinds?: readonly DeerKind[] }) {
  const lists = new Map(
    kinds.map((kind) => {
      const swapM = deerSwapM(kind);
      return [kind, { swapM, near: deerList(inputs, kind, "near", swapM, room), far: deerList(inputs, kind, "far", swapM, room) }] as const;
    }),
  );
  const all = [...lists.values()].flatMap(({ near, far }) => [near, far]);

  const quad = new BufferGeometry();
  quad.setAttribute("position", new BufferAttribute(Float32Array.from([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1]), 3));
  quad.setIndex([0, 1, 2, 0, 2, 3]);
  const shadowGeometry = new InstancedBufferGeometry();
  shadowGeometry.setAttribute("position", quad.getAttribute("position"));
  shadowGeometry.setIndex(quad.getIndex());
  const shadowRows = Object.fromEntries(["deerPlace", "deerBody"].map((name) => {
    const values = new InstancedBufferAttribute(new Float32Array(room * 4), 4);
    values.setUsage(DynamicDrawUsage);
    shadowGeometry.setAttribute(name, values);
    return [name, values];
  }));
  const shadowMaterial = deerShadowMaterial(inputs, DEER_REACH_M);
  const shadows = new Mesh(shadowGeometry, shadowMaterial);
  shadows.frustumCulled = false;
  shadows.visible = false;
  shadowGeometry.instanceCount = 0;

  const motions = new Map<string, Motion>();
  let drawn = 0;

  return {
    meshes: [shadows, ...all.map(({ mesh }) => mesh)],
    /** Each frame: every deer as it stands, its cycle moved on by `seconds` of the game's clock (0 while paused); each version listed by its distance from `eye`, the camera. */
    draw(deer: readonly HerdDeer[], eye: { x: number; z: number }, seconds: number, season: DeerSeason = SUMMER) {
      if (deer.length > room) throw new Error(`${deer.length} deer, in a herd with room for ${room}`);
      for (const list of all) list.begin();
      const seen = new Set<string>();
      drawn = 0;
      for (const one of deer) {
        seen.add(one.id);
        const motion = motions.get(one.id) ?? { gait: one.gait, cycle: roll(one.seed, 3), from: one.gait, fromShare: 0 };
        if (motion.gait !== one.gait) Object.assign(motion, { from: motion.gait, gait: one.gait, fromShare: 1 });
        const shape = GAIT_SHAPES[one.gait];
        const rate = shape.strideM > 0 && one.speed !== undefined ? one.speed / shape.strideM : shape.rate;
        motion.cycle = one.cycle ?? (motion.cycle + seconds * rate) % 1;
        motion.fromShare = Math.max(0, motion.fromShare - seconds / BLEND_S);
        motions.set(one.id, motion);

        const kind = lists.get(one.kind);
        if (kind === undefined) throw new Error(`a ${one.kind} in a herd without its lists`);
        const distance = Math.hypot(one.x - eye.x, one.z - eye.z);
        const onNear = distance < kind.swapM * (1 + SWAP_BAND) + LIST_SLACK_M;
        const onFar = distance >= kind.swapM * (1 - SWAP_BAND) - LIST_SLACK_M && distance < DEER_REACH_M + LIST_SLACK_M;
        if (!onNear && !onFar) continue;
        const { wideM, lengthM } = deerSize(one.kind);
        const scale = 0.94 + 0.12 * roll(one.seed, 1);
        const values = {
          deerPlace: [one.x, one.y, one.z, one.yaw],
          deerGait: [GAITS.indexOf(motion.gait), motion.cycle, GAITS.indexOf(motion.from), motion.fromShare],
          deerLook: [one.turn ?? 0, season.winter, one.kind === "buck" ? season.antlers : 0, one.kind === "kid" ? season.spots : 0],
          deerBody: [scale, roll(one.seed, 2) * 2 * Math.PI, wideM * scale, lengthM * scale],
        };
        if (onNear) kind.near.add(values);
        if (onFar) kind.far.add(values);
        shadowRows.deerPlace.set(values.deerPlace, drawn * 4);
        shadowRows.deerBody.set(values.deerBody, drawn * 4);
        drawn++;
      }
      for (const id of motions.keys()) if (!seen.has(id)) motions.delete(id);
      for (const list of all) list.end();
      shadowGeometry.instanceCount = drawn;
      shadows.visible = drawn > 0;
      for (const values of Object.values(shadowRows)) {
        values.addUpdateRange(0, drawn * 4);
        values.needsUpdate = true;
      }
    },
    /** What the last `draw` put on the lists: deer in reach, draw calls and the triangles their vertices run. */
    counts() {
      const visible = all.filter((list) => list.count() > 0);
      return { deer: drawn, draws: visible.length + (drawn > 0 ? 1 : 0), triangles: visible.reduce((sum, list) => sum + list.count() * list.triangles, 0) + drawn * 2 };
    },
    /** Where each kind swaps, as the herd draws it. */
    swaps: () => Object.fromEntries([...lists].map(([kind, { swapM }]) => [kind, swapM])),
    dispose() {
      for (const list of all) list.dispose();
      quad.dispose();
      shadowGeometry.dispose();
      shadowMaterial.dispose();
    },
  };
}

export type DeerHerd = ReturnType<typeof createDeerHerd>;

/** One deer alone at the origin in a checked pose, one version of it, swapping at `swapM`: as the game draws it, for the LOD check. */
export function placeCheckedDeer(inputs: DeerInputs, kind: DeerKind, version: Detail, swapM: number, pose: (typeof CHECKED_POSES)[number]): Mesh[] {
  const list = deerList(inputs, kind, version, swapM, 1);
  const { wideM, lengthM } = deerSize(kind);
  list.begin();
  list.add({ deerPlace: [0, 0, 0, 0], deerGait: [GAITS.indexOf(pose.gait), pose.cycle, GAITS.indexOf(pose.gait), 0], deerLook: [0, SUMMER.winter, kind === "buck" ? SUMMER.antlers : 0, kind === "kid" ? SUMMER.spots : 0], deerBody: [1, 0, wideM, lengthM] });
  list.end();
  return [list.mesh];
}
