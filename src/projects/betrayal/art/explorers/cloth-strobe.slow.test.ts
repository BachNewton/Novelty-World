import * as THREE from "three";
import { beforeAll, expect } from "vitest";
import { artCheck } from "./art-checks";
import { animationOf, type Animation } from "../animate";
import { stubCanvas } from "../headless";
import { clothBodyOf } from "./cloth-sim";
import { COURSE_TIMES, onCourse } from "./cloth-trial";
import { banshee } from "../monsters/banshee";
import { rhinehardt } from "./rhinehardt";
import type { ExplorerBuilder } from "../stage";

/*
 * Simulated cloth is drawn where the figure is, at any refresh rate: its
 * steps fall on a fixed grid of the clock, but each frame carries it the
 * rest of the way with what it hangs from, so where it is pinned never
 * strays from the body frame to frame (a strobing seam the owner saw on the
 * Banshee's shroud). Zoe's waistband is left out: it really does stretch over
 * a raised thigh.
 */

beforeAll(stubCanvas);
const WHO: Record<string, [ExplorerBuilder, string, number]> = {
  banshee: [(s, g) => banshee(s, g, { cloth: "net" }), "veil", 12],
  rhinehardt: [(s, g) => rhinehardt(s, g, { cloth: "net" }), "robe", 16],
};
artCheck("keeps where the cloth is pinned on the body, at 60, 75 and 144 frames a second", { timeout: 120_000 }, () => {
  for (const [name, [build, part, around]] of Object.entries(WHO)) {
    for (const hz of [60, 75, 144]) {
      const figure = onCourse(build)("x");
      const animations: Animation[] = [];
      figure.traverse((o) => {
        const a = animationOf(o);
        if (a) animations.push(a);
      });
      const inner = figure.children[0].children[0];
      const body = clothBodyOf(inner);
      const mesh = inner.getObjectByName(part);
      if (!body || !mesh?.parent) throw new Error("x");
      const anchor = name === "zoe" ? mesh.parent.parent : mesh.parent;
      if (!anchor) throw new Error("y");
      let rest: THREE.Vector3[] = [];
      let worst = 0;
      for (let t = COURSE_TIMES.walk.start - 0.3; t < COURSE_TIMES.walk.end; t += 1 / hz) {
        for (const a of animations) a(t);
        figure.updateMatrixWorld(true);
        const into = anchor.matrixWorld.clone().invert();
        // The pinned top row, as drawn: where it is in the frame it hangs from.
        const top = Array.from({ length: around }, (_, i) => new THREE.Vector3().fromArray(body.points, i * 3).applyMatrix4(into));
        if (rest.length === 0) rest = top;
        worst = Math.max(worst, ...top.map((v, i) => v.distanceTo(rest[i])));
      }
      expect(worst, `${name}'s pinned row strays at ${hz} Hz, m`).toBeLessThan(0.0005);
    }
  }
});
