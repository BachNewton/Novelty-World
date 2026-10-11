import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { animationOf } from "../animate";
import { stubCanvas } from "../headless";
import type { ExplorerBuilder } from "../stage";
import { clothOf } from "./cloth";
import type { Pace } from "./figure";
import { onTheSpot } from "./line-up";
import { longfellow } from "./longfellow";
import { ox } from "./ox";
import { rhinehardt } from "./rhinehardt";
import { zoe } from "./zoe";

/*
 * Cloth the legs push (Rhinehardt's robe, Zoe's skirt) is heavy: it swings
 * out ahead of a knee, peaks gently and falls back, and never bangs against
 * the legs. Each explorer with such cloth walks and runs on the spot through
 * a couple of strides, finely sampled, and points on its cloth (front and
 * back, at the hem and higher up) are followed in the frame the cloth hangs
 * from, so the body's own bounce doesn't count. A knee shoving the cloth the
 * moment it meets it, or the cloth stopping dead, shows as a spike in how
 * sharply the cloth's speed changes (its acceleration) and in how suddenly
 * that changes (its jerk). Shoved cloth peaked over 2000 m/s² and a million
 * m/s³; cloth that swings stays near 50 m/s² and 3000 m/s³.
 */

beforeAll(stubCanvas);

const EXPLORERS: Record<string, ExplorerBuilder> = { longfellow, ox, zoe, rhinehardt };
/** The figures robed or skirted, whose cloth the legs push. */
const CLOTHED = ["zoe", "rhinehardt"];
/** Samples a second: fine enough to see a knock between frames. */
const RATE = 600;
/** The sharpest change of speed, in m/s², and of acceleration, in m/s³, cloth may make. */
const SMOOTH = { acceleration: 80, jerk: 5000 };

/** Points to follow on each mesh of a piece of cloth: the furthest forward and back, near its hem, a third of the way up and halfway. */
function followed(cloth: THREE.Object3D) {
  const points: { mesh: THREE.Mesh; position: THREE.BufferAttribute; index: number }[] = [];
  cloth.traverse((mesh) => {
    if (!(mesh instanceof THREE.Mesh)) return;
    const geometry = mesh.geometry as THREE.BufferGeometry;
    geometry.computeBoundingBox();
    const box = geometry.boundingBox ?? new THREE.Box3();
    const position = geometry.getAttribute("position") as THREE.BufferAttribute;
    for (const share of [0.02, 0.3, 0.55]) {
      const y = box.min.y + (box.max.y - box.min.y) * share;
      for (const facing of [1, -1]) {
        let [index, best] = [0, Infinity];
        for (let i = 0; i < position.count; i++) {
          const score = Math.abs(position.getY(i) - y) * 10 + Math.abs(position.getX(i)) - facing * position.getZ(i);
          if (score < best) [best, index] = [score, i];
        }
        points.push({ mesh, position, index });
      }
    }
  });
  return points;
}

/** The sharpest acceleration and jerk of any followed point on a figure's cloth through a couple of strides. */
function clothMotion(figure: THREE.Object3D, name: string): { acceleration: number; jerk: number } {
  const animation = animationOf(figure);
  if (!animation) throw new Error(`${name} has no animation`);
  const tracks = clothOf(figure).flatMap((cloth) => followed(cloth).map((point) => ({ ...point, cloth, path: [] as THREE.Vector3[] })));
  const seconds = 1.4;
  const into = new THREE.Matrix4();
  for (let i = 0; i <= seconds * RATE; i++) {
    animation(1 + i / RATE);
    figure.updateMatrixWorld(true);
    for (const track of tracks) {
      if (!track.cloth.parent) throw new Error(`${name}'s cloth hangs from nothing`);
      into.copy(track.cloth.parent.matrixWorld).invert().multiply(track.mesh.matrixWorld);
      track.path.push(new THREE.Vector3().fromBufferAttribute(track.position, track.index).applyMatrix4(into));
    }
  }
  let [acceleration, jerk] = [0, 0];
  for (const { path } of tracks) {
    const accelerationAt = (i: number) => new THREE.Vector3().addVectors(path[i + 1], path[i - 1]).addScaledVector(path[i], -2).multiplyScalar(RATE * RATE);
    for (let i = 1; i + 2 < path.length; i++) {
      acceleration = Math.max(acceleration, accelerationAt(i).length());
      jerk = Math.max(jerk, accelerationAt(i + 1).sub(accelerationAt(i)).length() * RATE);
    }
  }
  return { acceleration, jerk };
}

describe("cloth the legs push", () => {
  for (const [name, build] of Object.entries(EXPLORERS)) {
    for (const pace of ["walk", "run"] as Pace[]) {
      it(`swings smoothly on ${name} ${pace === "run" ? "running" : "walking"}`, { timeout: 20_000 }, () => {
        const figure = onTheSpot(build, name, pace);
        expect(clothOf(figure).length > 0, "has cloth the legs push").toBe(CLOTHED.includes(name));
        const peaks = clothMotion(figure, name);
        expect(peaks.acceleration, "acceleration, m/s²").toBeLessThan(SMOOTH.acceleration);
        expect(peaks.jerk, "jerk, m/s³").toBeLessThan(SMOOTH.jerk);
      });
    }
  }
});
