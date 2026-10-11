import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { animationOf, type Animation } from "../animate";
import { solidOf } from "../forms";
import { stubCanvas } from "../headless";
import { blowsOn, breeze } from "../wind";
import { clothBodyOf } from "./cloth-sim";
import { COURSE_TIMES, onCourse, type ClothTrial } from "./cloth-trial";
import type { Pace } from "./figure";
import { onTheSpot } from "./line-up";
import { zoe } from "./zoe";

/*
 * Zoe's simulated skirt, each way on trial, as the house would show it: on
 * the bench's course (walking, sharp turns, stopping, running) and walking
 * and running on the spot, at 60 frames a second. No point of the skirt's
 * mesh may lie inside her legs or shoes (each part's own solid says how deep
 * a point lies in it); the cloth must stay near her at a run and through the
 * sharpest turn, never exploding; and the same clock must give exactly the
 * same skirt, run after run.
 */

beforeAll(stubCanvas);

const TRIALS: Exclude<ClothTrial, "off">[] = ["panels", "net"];
const FRAME = 1 / 60;
/** How deep a point of the skirt may lie in a leg: the meshing's own error. */
const INSIDE = 0.002;
/** The furthest any point of the skirt may be from her hips, in metres: its hem hangs 0.3 m from them, and may swing 0.1 m. */
const NEAR = 0.45;

/** How far below her hips' pivot her sash covers the skirt, in the hips' frame. */
const UNDER_SASH = -0.015;

const LEG_PARTS = ["right thigh", "left thigh", "right shin", "left shin", "right shoe", "left shoe"];

/** Every point of the skirt (the net's one mesh, or each panel), as it stands, in the hips' frame and in the world. */
function forSkirt(figure: THREE.Object3D, visit: (inHips: THREE.Vector3, mesh: THREE.Mesh, index: number) => void) {
  const meshes: THREE.Mesh[] = [];
  figure.traverse((object) => {
    if (object instanceof THREE.Mesh && object.name.startsWith("skirt")) meshes.push(object);
  });
  if (meshes.length === 0) throw new Error("Zoe has no skirt");
  const hips = figure.getObjectByName("bodice")?.parent?.parent;
  if (!hips) throw new Error("Zoe has no hips");
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
function deepestInLegs(figure: THREE.Object3D): { depth: number; part: string; at?: THREE.Vector3 } {
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
    // Her sash covers the skirt's top, where the thighs meet her hips.
    if (inHips.y > UNDER_SASH) return;
    world.fromBufferAttribute((mesh.geometry as THREE.BufferGeometry).getAttribute("position") as THREE.BufferAttribute, i).applyMatrix4(mesh.matrixWorld);
    for (const { name, solid, into } of legs) {
      local.copy(world).applyMatrix4(into);
      if (local.x < solid.min[0] || local.y < solid.min[1] || local.z < solid.min[2] || local.x > solid.max[0] || local.y > solid.max[1] || local.z > solid.max[2]) continue;
      const depth = -solid.distance(local.x, local.y, local.z);
      if (depth > worst.depth) worst = { depth, part: name, at: inHips.clone() };
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

const zoeWith = (cloth: ClothTrial) => (seed: string, gait?: Parameters<typeof zoe>[1]) => zoe(seed, gait, { cloth });

describe("Zoe's simulated skirt", () => {
  for (const cloth of TRIALS) {
    for (const pace of ["walk", "run"] as Pace[]) {
      it(`keeps out of her legs ${pace === "run" ? "running" : "walking"} on the spot (${cloth})`, { timeout: 60_000 }, () => {
        const figure = onTheSpot(zoeWith(cloth), "zoe", pace);
        const pose = animate(figure);
        for (let t = 0; t < 2; t += FRAME) {
          pose(t);
          const { depth, part, at } = deepestInLegs(figure);
          expect(depth, `inside her ${part} at ${t.toFixed(3)} s, at ${JSON.stringify(at)}`).toBeLessThan(INSIDE);
        }
      });
    }

    it(`keeps out of her legs, and near her, round the course (${cloth})`, { timeout: 120_000 }, () => {
      const figure = onCourse(zoeWith(cloth))("zoe");
      const pose = animate(figure);
      let reach = 0;
      for (let t = COURSE_TIMES.walk.start - 0.5; t < COURSE_TIMES.run.end + 1; t += FRAME) {
        pose(t);
        const { depth, part, at } = deepestInLegs(figure);
        expect(depth, `inside her ${part} at ${t.toFixed(3)} s, at ${JSON.stringify(at)}`).toBeLessThan(INSIDE);
        reach = Math.max(reach, furthest(figure));
      }
      expect(reach, "the furthest the skirt reaches from her hips, m").toBeLessThan(NEAR);
    });

    it(`is the same, run after run, in a breeze (${cloth})`, { timeout: 60_000 }, () => {
      const run = () => {
        const figure = blowsOn(onCourse(zoeWith(cloth))("zoe"), breeze("graveyard"));
        const pose = animate(figure);
        for (let t = COURSE_TIMES.run.start - 0.2; t < COURSE_TIMES.run.end + 0.3; t += FRAME) pose(t);
        // A frozen clock shows the same skirt however many frames are drawn.
        pose(COURSE_TIMES.run.end + 0.3);
        return skirtNow(figure);
      };
      expect(run()).toEqual(run());
    });

    it(`says what it costs (${cloth})`, () => {
      const figure = onCourse(zoeWith(cloth))("zoe");
      const pose = animate(figure);
      const work = clothBodyOf(figure.children[0].children[0])?.work;
      if (!work) throw new Error("Zoe's skirt counts no work");
      pose(COURSE_TIMES.run.start);
      const before = { ...work };
      const frames = 120;
      for (let i = 1; i <= frames; i++) pose(COURSE_TIMES.run.start + i * FRAME);
      const per = (key: keyof typeof work) => Math.round((work[key] - before[key]) / frames);
      console.log(`${cloth}: a frame at 60 fps takes ${per("steps")} steps: ${per("points")} point moves, ${per("constraints")} constraint solves, ${per("collisions")} collision tests, ${per("vertices")} mesh vertices rebuilt`);
      expect(per("steps")).toBe(2);
    });
  }
});
