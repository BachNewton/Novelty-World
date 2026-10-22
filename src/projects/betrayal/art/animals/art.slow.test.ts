import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { animationOf } from "../animate";
import { artChecks } from "../explorers/art-checks";
import { fightingFaces } from "../explorers/fighting-faces";
import { burstsOf, cueBurst, STANDING, walkingOf, type Gait, type Pace } from "../explorers/figure";
import { partsOf } from "../figure-parts";
import { stubCanvas } from "../headless";
import { paceSpeed, walkPose, type Walk } from "../house-walk";
import type { ExplorerBuilder } from "../stage";
import { cat, dog } from ".";

/*
 * The art checks for the four-legged figures, opt-in as the explorers' are
 * (`BETRAYAL_ART_CHECKS=1`). A walk or a run never jumps: each animal walks
 * and runs a straight path as the house moves it, at the house's middle
 * pace (a companion has no Speed of its own), easing in and out, sampled
 * finely, and no part's step is longer than the steps either side of it by
 * more than a few millimetres. The base stays planted, level on the floor,
 * however the animal bounds above it. And no two of its faces fight,
 * standing, through each gesture, walking and running.
 */

beforeAll(stubCanvas);

const ANIMALS: Record<string, ExplorerBuilder> = { dog, cat };
const RATE = 600;
const JUMP = 0.003;
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

function trackedParts(figure: THREE.Object3D) {
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
  const parts = trackedParts(figure);
  const point = new THREE.Vector3();
  const frames: Float64Array[] = [];
  const seconds = LENGTH[pace] / paceSpeed(pace) + 0.1;
  for (let i = 0; i <= seconds * RATE; i++) {
    animation(i / RATE);
    figure.updateMatrixWorld(true);
    const frame = new Float64Array(parts.length * 9);
    parts.forEach(({ mesh, points }, j) => points.forEach((local, k) => frame.set(point.copy(local).applyMatrix4(mesh.matrixWorld).toArray(), j * 9 + k * 3)));
    frames.push(frame);
  }
  let worst = { size: 0, part: "", at: 0 };
  const length = (a: Float64Array, b: Float64Array, j: number) => Math.hypot(a[j] - b[j], a[j + 1] - b[j + 1], a[j + 2] - b[j + 2]);
  for (let i = 1; i + 2 < frames.length; i++) {
    const [a, b, c, d] = [frames[i - 1], frames[i], frames[i + 1], frames[i + 2]];
    for (let j = 0; j < a.length; j += 3) {
      const size = length(c, b, j) - Math.max(length(b, a, j), length(d, c, j));
      if (size > worst.size) worst = { size, part: parts[Math.floor(j / 9)].mesh.name || "unnamed", at: i / RATE };
    }
  }
  return worst;
}

const onTheSpot =
  (step: number, running: boolean): Gait =>
  (seconds) => ({ phase: ((seconds * paceSpeed(running ? "run" : "walk")) / (running ? step * 2 : step)) * Math.PI, amount: 1, running });

function posedAt(figure: THREE.Object3D, seconds: number): THREE.Object3D {
  figure.traverse((object) => animationOf(object)?.(seconds));
  return figure;
}

artChecks.each(Object.entries(ANIMALS))("%s", (name, build) => {
  beforeAll(() => {
    for (const parts of partsOf(build)) parts.get();
  }, 60_000);

  for (const pace of ["walk", "run"] as const) {
    it(`never jumps ${pace === "run" ? "running" : "walking"}, from the ease in to the ease out`, { timeout: 30_000 }, () => {
      const jump = largestJump(build, name, pace);
      expect(jump.size, `${jump.part} jumps ${(jump.size * 1000).toFixed(1)} mm at ${jump.at.toFixed(3)} s`).toBeLessThan(JUMP);
    });
  }

  it("keeps its base planted on the floor, level, while it walks or runs above it", () => {
    const step = walkingOf(build("step")).step;
    for (const running of [false, true]) {
      const figure = build("planted", onTheSpot(step, running));
      for (let t = 0; t < 2; t += 0.013) {
        posedAt(figure, t).updateMatrixWorld(true);
        const base = figure.getObjectByName("base");
        if (!base) throw new Error(`${name} has no base`);
        expect(base.getWorldPosition(new THREE.Vector3()).y).toBeCloseTo(0, 6);
        expect(new THREE.Vector3(0, 1, 0).transformDirection(base.matrixWorld).y).toBeCloseTo(1, 6);
      }
    }
  });

  describe("has no fighting faces", () => {
    const step = () => walkingOf(build("step")).step;
    it("standing, walking and running", { timeout: 20_000 }, () => {
      for (const [how, gait] of [["standing", STANDING], ["walking", onTheSpot(step(), false)], ["running", onTheSpot(step(), true)]] as const) {
        const figure = build(name, gait);
        for (const at of [0, 0.07, 0.15, 2, 5, 9]) expect(fightingFaces(posedAt(figure, at)).map((finding) => `${how} at ${at}s: ${finding}`)).toEqual([]);
      }
    });

    it("through each gesture", { timeout: 20_000 }, () => {
      const figure = build(name);
      for (const { name: gesture, lasts } of burstsOf(figure)) {
        cueBurst(figure, { name: gesture, at: 0, repeat: false });
        for (const at of [0.3, 0.5, 0.7].map((share) => share * lasts)) expect(fightingFaces(posedAt(figure, at)).map((finding) => `${gesture} at ${at.toFixed(2)}s: ${finding}`)).toEqual([]);
      }
    });
  });
});
