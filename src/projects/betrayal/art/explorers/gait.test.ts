import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { animationOf } from "../animate";
import { stubCanvas } from "../headless";
import { walkPose, type Walk } from "../house-walk";
import type { ExplorerBuilder } from "../stage";
import { walkingOf, type Pace } from "./figure";
import { explorerLineUp } from "./line-up";
import { longfellow } from "./longfellow";
import { ox } from "./ox";
import { zoe } from "./zoe";

/*
 * A walk or a run never jumps. Each explorer walks and runs a straight path
 * as the house moves it, easing into its stride, through several strides
 * (every foot's cycle wrapping more than once) and out of it again, sampled
 * finely. Each part is followed by three points (its middle and two far
 * corners of its box, so a turn shows as well as a move): a point moving
 * smoothly, however fast and however sharply it turns, takes a step between
 * samples about as long as the steps either side, so one step longer than
 * both its neighbours by more than a few millimetres is a jump.
 */

beforeAll(stubCanvas);

const EXPLORERS: Record<string, ExplorerBuilder> = { longfellow, ox, zoe };
/** Samples a second: fine enough that the fastest foot's step barely changes from one sample to the next. */
const RATE = 600;
/** The most a point's step may be longer than the steps either side of it. */
const JUMP = 0.003;

/** The path's length: long enough for several strides between the ease in and the ease out. */
const LENGTH: Record<Pace, number> = { walk: 3.5, run: 6 };

function walkOf(pace: Pace): Walk {
  return {
    path: [
      { floor: "ground", x: 0, y: 0, z: 0 },
      { floor: "ground", x: 0, y: 0, z: LENGTH[pace] },
    ],
    start: 0,
    pace,
  };
}

/** Every part's three tracked points, in the figure's frame, as it is posed now. */
function tracked(figure: THREE.Object3D, parts: readonly { mesh: THREE.Mesh; points: THREE.Vector3[] }[]): Float64Array {
  figure.updateMatrixWorld(true);
  const into = figure.matrixWorld.clone().invert();
  const out = new Float64Array(parts.length * 9);
  const point = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  parts.forEach(({ mesh, points }, i) => {
    matrix.multiplyMatrices(into, mesh.matrixWorld);
    points.forEach((local, k) => {
      point.copy(local).applyMatrix4(matrix);
      out.set([point.x, point.y, point.z], i * 9 + k * 3);
    });
  });
  return out;
}

function partsOf(figure: THREE.Object3D) {
  const parts: { mesh: THREE.Mesh; points: THREE.Vector3[] }[] = [];
  figure.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry as THREE.BufferGeometry;
    geometry.computeBoundingBox();
    const box = geometry.boundingBox ?? new THREE.Box3();
    parts.push({ mesh: object, points: [box.getCenter(new THREE.Vector3()), box.min.clone(), box.max.clone()] });
  });
  return parts;
}

/** The largest jump in any part through a walk or run, and where. */
function largestJump(build: ExplorerBuilder, name: string, pace: Pace): { size: number; part: string; at: number } {
  const walk = walkOf(pace);
  let step = 0.6;
  const figure = build(name, (seconds) => walkPose(walk, seconds, step).stride);
  step = walkingOf(figure).step;
  const animation = animationOf(figure);
  if (!animation) throw new Error(`${name} has no animation`);
  const parts = partsOf(figure);
  const seconds = LENGTH[pace] / (pace === "run" ? 3.6 : 1.5) + 0.1;
  const frames: Float64Array[] = [];
  for (let i = 0; i <= seconds * RATE; i++) {
    animation(i / RATE);
    frames.push(tracked(figure, parts));
  }
  let worst = { size: 0, part: "", at: 0 };
  const length = (frame: Float64Array, from: Float64Array, j: number) => Math.hypot(frame[j] - from[j], frame[j + 1] - from[j + 1], frame[j + 2] - from[j + 2]);
  for (let i = 1; i + 2 < frames.length; i++) {
    const [a, b, c, d] = [frames[i - 1], frames[i], frames[i + 1], frames[i + 2]];
    for (let j = 0; j < a.length; j += 3) {
      // How much longer the step from b to c is than the steps either side of it.
      const size = length(c, b, j) - Math.max(length(b, a, j), length(d, c, j));
      if (size > worst.size) worst = { size, part: parts[Math.floor(j / 9)].mesh.name || "unnamed", at: i / RATE };
    }
  }
  return worst;
}

describe.each(Object.entries(EXPLORERS))("%s", (name, build) => {
  for (const pace of ["walk", "run"] as const) {
    it(`never jumps ${pace === "run" ? "running" : "walking"}, from the ease in to the ease out`, { timeout: 20_000 }, () => {
      const jump = largestJump(build, name, pace);
      expect(jump.size, `${jump.part} jumps ${(jump.size * 1000).toFixed(1)} mm at ${jump.at.toFixed(3)} s`).toBeLessThan(JUMP);
    });
  }
});

describe("the base", () => {
  it("stays planted on the floor, level, while the figure walks or runs above it", () => {
    for (const pace of ["walk", "run"] as const) {
      const row = explorerLineUp("planted", pace);
      for (let t = 0; t < 2; t += 0.013) {
        row.traverse((object) => animationOf(object)?.(t));
        row.updateMatrixWorld(true);
        const bases: THREE.Object3D[] = [];
        row.traverse((object) => {
          if (object.name === "base") bases.push(object);
        });
        expect(bases.length).toBeGreaterThanOrEqual(3);
        for (const base of bases) {
          const up = new THREE.Vector3(0, 1, 0).transformDirection(base.matrixWorld);
          expect(base.getWorldPosition(new THREE.Vector3()).y, `${pace} at ${t.toFixed(3)} s`).toBeCloseTo(0, 6);
          expect(up.y).toBeCloseTo(1, 6);
        }
      }
    }
  });
});
