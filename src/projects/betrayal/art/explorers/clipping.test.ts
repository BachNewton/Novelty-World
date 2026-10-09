import type * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { animationOf } from "../animate";
import { stubCanvas } from "../headless";
import type { ExplorerBuilder } from "../stage";
import { clipping } from "./clipping";
import type { Pace } from "./figure";
import { handsOf, holdIn } from "./hands";
import { onTheSpot } from "./line-up";
import { longfellow } from "./longfellow";
import { ox } from "./ox";
import { STAND_INS } from "./props";
import { zoe } from "./zoe";

/*
 * No figure's parts pass through each other, still or moving. Each explorer
 * is checked through a long stretch of its idle (every occasional gesture
 * comes round several times), and walking and running on the spot at the
 * house's pace over several strides, sampled off the beat so every phase of
 * the stride comes up; then again holding each stand-in prop in its free
 * hand. The check skips a pair of parts posed as it already checked them, so
 * a long run costs only its new poses.
 */

beforeAll(stubCanvas);

const EXPLORERS: Record<string, ExplorerBuilder> = { longfellow, ox, zoe };

function clipsThrough(figure: THREE.Object3D, times: readonly number[]): string[] {
  const found = new Map<string, string>();
  for (const at of times) {
    figure.traverse((object) => animationOf(object)?.(at));
    for (const finding of clipping(figure)) {
      const pair = finding.split(" pass through")[0];
      if (!found.has(pair)) found.set(pair, `at ${at.toFixed(2)} s: ${finding}`);
    }
  }
  return [...found.values()];
}

/** `count` moments from `from`, `every` seconds apart. */
const moments = (from: number, every: number, count: number) => Array.from({ length: count }, (_, i) => from + i * every);

/** Ninety seconds, long enough for each figure's occasional gestures to come round several times, each caught easing in and out. */
const IDLE = moments(0, 0.45, 200);
/** Several strides, sampled at a spacing that never lines up with a step, so every phase of the stride comes up. */
const STRIDES = moments(0, 0.0371, 90);
/** A figure's first check pays for meshing its parts; after that each takes a second or two. */
const LIMIT = { timeout: 15_000 };

describe.each(Object.entries(EXPLORERS))("%s", (name, build) => {
  for (const pace of [undefined, "walk", "run"] as (Pace | undefined)[]) {
    it(`passes no part through another ${pace ? `${pace === "run" ? "running" : "walking"}` : "standing"}`, LIMIT, () => {
      expect(clipsThrough(onTheSpot(build, name, pace), pace ? STRIDES : IDLE)).toEqual([]);
    });
  }

  for (const [prop, make] of Object.entries(STAND_INS)) {
    it(`passes no part through another holding a ${prop}`, LIMIT, () => {
      for (const pace of [undefined, "walk", "run"] as (Pace | undefined)[]) {
        const figure = onTheSpot(build, name, pace);
        const hands = handsOf(figure);
        if (!hands) throw new Error(`${name} has no hands`);
        holdIn(hands.right, make());
        const found = clipsThrough(figure, pace ? STRIDES : IDLE.slice(0, 120));
        expect(found.map((finding) => `${pace ?? "standing"}: ${finding}`)).toEqual([]);
      }
    });
  }
});
