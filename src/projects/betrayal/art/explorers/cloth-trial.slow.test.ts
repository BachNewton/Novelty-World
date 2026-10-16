import * as THREE from "three";
import { beforeAll, expect, it } from "vitest";
import { artChecks } from "./art-checks";
import { animationOf, type Animation } from "../animate";
import { solidOf } from "../forms";
import { stubCanvas } from "../headless";
import { blowsOn, breeze } from "../wind";
import { clothBodyOf, type ClothMode } from "./cloth-sim";
import { COURSE_TIMES, onCourse } from "./cloth-trial";
import type { Pace } from "./figure";
import { onTheSpot } from "./line-up";
import { banshee } from "../monsters/banshee";
import type { ExplorerBuilder } from "../stage";
import { clothOf } from "./cloth";
import { rhinehardt } from "./rhinehardt";
import { zoe } from "./zoe";
import { zostra } from "./zostra";

/*
 * The simulated cloth, as the house shows it: Zoe's
 * skirt, Father Rhinehardt's robe and the Banshee's shroud, on the bench's
 * course (walking, sharp turns, stopping, running) and walking and running on
 * the spot, at 60 frames a second. No point of the cloth's mesh may lie
 * inside a leg or a shoe (each part's own solid says how deep a point lies in
 * it); the cloth must stay near the figure at a run and through the sharpest
 * turn, never exploding; and the same clock must give exactly the same cloth,
 * run after run.
 */

beforeAll(stubCanvas);

const FRAME = 1 / 60;
/** How deep a point of the cloth may lie in a leg: the meshing's own error. */
const INSIDE = 0.002;

interface Case {
  build: (cloth: ClothMode) => ExplorerBuilder;
  /** Whether it has legs the cloth must keep out of. */
  legs: boolean;
  /** Above this height, in the frame the cloth hangs from, the figure's own body covers the cloth (Zoe's sash). */
  covered: number;
  /** The furthest any point of the cloth may be from what it hangs from, in metres: its hem's distance, its swing, and a running kick (the robe). */
  near: number;
}

const CASES: Record<string, Case> = {
  zoe: { build: (cloth) => (seed, gait) => zoe(seed, gait, { cloth }), legs: true, covered: -0.015, near: 0.45 },
  rhinehardt: { build: (cloth) => (seed, gait) => rhinehardt(seed, gait, { cloth }), legs: true, covered: 0, near: 0.9 },
  zostra: { build: (cloth) => (seed, gait) => zostra(seed, gait, { cloth }), legs: true, covered: 0, near: 0.8 },
  banshee: { build: (cloth) => (seed, gait) => banshee(seed, gait, { cloth }), legs: false, covered: 0, near: 1 },
};

const LEG_PARTS = ["right thigh", "left thigh", "right shin", "left shin", "right shoe", "left shoe"];

/** The meshes of a figure's cloth. */
function clothMeshes(figure: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  figure.traverse((object) => {
    for (const cloth of clothOf(object)) {
      cloth.traverse((part) => {
        if (part instanceof THREE.Mesh) meshes.push(part);
      });
    }
  });
  // The Banshee's shroud is her veil, which no legs push.
  const veil = figure.getObjectByName("veil");
  if (veil instanceof THREE.Mesh) meshes.push(veil);
  if (meshes.length === 0) throw new Error("The figure has no cloth");
  return meshes;
}

/** Every point of the cloth, as it stands, in the frame it hangs from (hips, or a robe's) and in the world. */
function forSkirt(figure: THREE.Object3D, visit: (inHips: THREE.Vector3, mesh: THREE.Mesh, index: number) => void) {
  const meshes = clothMeshes(figure);
  // Zoe's skirt hangs in a group of its own in her hips; the others' cloth straight from what it hangs from.
  const hangs = meshes[0].parent;
  const hips = meshes[0].name.startsWith("skirt") ? hangs?.parent : hangs;
  if (!hips) throw new Error("The cloth hangs from nothing");
  const point = new THREE.Vector3();
  for (const mesh of meshes) {
    const into = hips.matrixWorld.clone().invert().multiply(mesh.matrixWorld);
    const position = (mesh.geometry as THREE.BufferGeometry).getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < position.count; i++) visit(point.fromBufferAttribute(position, i).applyMatrix4(into), mesh, i);
  }
}

function animate(figure: THREE.Object3D): Animation {
  const animations: Animation[] = [];
  figure.traverse((object) => {
    const animation = animationOf(object);
    if (animation) animations.push(animation);
  });
  return (seconds) => {
    for (const animation of animations) animation(seconds);
    figure.updateMatrixWorld(true);
  };
}

/** The deepest any point of the skirt lies inside a leg or a shoe, which, and where in the hips' frame. */
function deepestInLegs(figure: THREE.Object3D, covered: number): { depth: number; part: string; at?: THREE.Vector3 } {
  const legs = LEG_PARTS.map((name) => {
    const part = figure.getObjectByName(name);
    if (!(part instanceof THREE.Mesh)) throw new Error(`Zoe has no ${name}`);
    const solid = solidOf(part.geometry as THREE.BufferGeometry);
    if (!solid) throw new Error(`Zoe's ${name} keeps no solid`);
    return { name, solid, into: part.matrixWorld.clone().invert() };
  });
  const [world, local] = [new THREE.Vector3(), new THREE.Vector3()];
  let worst: { depth: number; part: string; at?: THREE.Vector3 } = { depth: 0, part: "" };
  forSkirt(figure, (inHips, mesh, i) => {
    // The body covers the cloth's top, where the thighs meet the hips (Zoe's sash).
    if (inHips.y > covered) return;
    world.fromBufferAttribute((mesh.geometry as THREE.BufferGeometry).getAttribute("position") as THREE.BufferAttribute, i).applyMatrix4(mesh.matrixWorld);
    for (const { name, solid, into } of legs) {
      local.copy(world).applyMatrix4(into);
      if (local.x < solid.min[0] || local.y < solid.min[1] || local.z < solid.min[2] || local.x > solid.max[0] || local.y > solid.max[1] || local.z > solid.max[2]) continue;
      const depth = -solid.distance(local.x, local.y, local.z);
      if (depth > worst.depth) worst = { depth, part: `${name} (vertex ${i} of ${(mesh.geometry as THREE.BufferGeometry).getAttribute("position").count})`, at: inHips.clone() };
    }
  });
  return worst;
}

/** The furthest any point of the skirt is from the hips' pivot. */
function furthest(figure: THREE.Object3D): number {
  let most = 0;
  forSkirt(figure, (inHips) => {
    most = Math.max(most, Number.isFinite(inHips.length()) ? inHips.length() : Infinity);
  });
  return most;
}

/** Every point of the skirt in the hips' frame, flattened. */
function skirtNow(figure: THREE.Object3D): number[] {
  const points: number[] = [];
  forSkirt(figure, (inHips) => points.push(inHips.x, inHips.y, inHips.z));
  return points;
}

for (const [name, { build, legs, covered, near }] of Object.entries(CASES)) {
  artChecks(`${name}'s simulated cloth`, () => {
    const cloth = "net";
    if (legs) {
      for (const pace of ["walk", "run"] as Pace[]) {
        it(`keeps out of the legs ${pace === "run" ? "running" : "walking"} on the spot (${cloth})`, { timeout: 60_000 }, () => {
          const figure = onTheSpot(build(cloth), name, pace);
          const pose = animate(figure);
          for (let t = 0; t < 2; t += FRAME) {
            pose(t);
            const { depth, part, at } = deepestInLegs(figure, covered);
            expect(depth, `inside the ${part} at ${t.toFixed(3)} s, at ${JSON.stringify(at)}`).toBeLessThan(INSIDE);
          }
        });
      }
    }

    it(`keeps ${legs ? "out of the legs, and " : ""}near, round the course (${cloth})`, { timeout: 120_000 }, () => {
      const figure = onCourse(build(cloth))(name);
      const pose = animate(figure);
      let reach = 0;
      for (let t = COURSE_TIMES.walk.start - 0.5; t < COURSE_TIMES.run.end + 1; t += FRAME) {
        pose(t);
        if (legs) {
          const { depth, part, at } = deepestInLegs(figure, covered);
          expect(depth, `inside the ${part} at ${t.toFixed(3)} s, at ${JSON.stringify(at)}`).toBeLessThan(INSIDE);
        }
        reach = Math.max(reach, furthest(figure));
      }
      expect(reach, "the furthest the cloth reaches from what it hangs from, m").toBeLessThan(near);
    });

    it(`is the same, run after run, in a breeze (${cloth})`, { timeout: 60_000 }, () => {
      const run = () => {
        const figure = blowsOn(onCourse(build(cloth))(name), breeze("graveyard"));
        const pose = animate(figure);
        for (let t = COURSE_TIMES.run.start - 0.2; t < COURSE_TIMES.run.end + 0.3; t += FRAME) pose(t);
        // A frozen clock shows the same cloth however many frames are drawn.
        pose(COURSE_TIMES.run.end + 0.3);
        return skirtNow(figure);
      };
      expect(run()).toEqual(run());
    });

    it(`says what it costs (${cloth})`, () => {
      const figure = onCourse(build(cloth))(name);
      const pose = animate(figure);
      const work = clothBodyOf(figure.children[0].children[0])?.work;
      if (!work) throw new Error("The cloth counts no work");
      pose(COURSE_TIMES.run.start);
      const before = { ...work };
      const frames = 120;
      for (let i = 1; i <= frames; i++) pose(COURSE_TIMES.run.start + i * FRAME);
      const per = (key: keyof typeof work) => Math.round((work[key] - before[key]) / frames);
      console.log(
        `${name} ${cloth}: a frame at 60 fps takes ${per("steps")} steps: ${per("points")} point moves, ${per("constraints")} constraint solves, ${per("collisions")} collision tests, ${per("vertices")} mesh vertices rebuilt`,
      );
      expect(per("steps")).toBe(2);
    });
  });
}
