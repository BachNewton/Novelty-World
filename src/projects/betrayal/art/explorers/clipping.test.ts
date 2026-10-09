import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { animationOf } from "../animate";
import { loft, mergeAll, solidOf, surfaceAt, type Section, type Vec3 } from "../forms";
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

/*
 * Longfellow's scarf once clipped through his coat unseen: its ends were
 * merged into the coat's mesh, and the check only ever compares one part
 * with another, so a ribbon sinking into the coat it lay on was never asked
 * about. Its ends are a part of their own now. The old ends, laid on the coat
 * by their middles 11 mm off it, are rebuilt here as they were and must be
 * caught, while the ends as built pass.
 */
describe("longfellow's scarf", () => {
  const scarfOf = (figure: THREE.Object3D) => {
    const found = figure.getObjectByName("scarf");
    const coat = figure.getObjectByName("torso");
    if (!(found instanceof THREE.Mesh) || !(coat instanceof THREE.Mesh)) throw new Error("Longfellow's scarf is not a part of its own");
    return { scarf: found, coat };
  };

  /** The scarf's ends as they were first built, from the coat's own solid. */
  function oldEnds(coat: THREE.Mesh): THREE.BufferGeometry {
    const solid = solidOf(coat.geometry as THREE.BufferGeometry);
    if (!solid) throw new Error("The coat has no solid");
    const onCoat = (x: number, y: number, facing: 1 | -1): Vec3 => [x, y, surfaceAt(solid.distance, x, y, facing) + facing * 0.011];
    const band = (at: Vec3, colour: Section["colour"]): Section => ({ at, radius: [0.042, 0.009], colour });
    const striped = (x: number, facing: 1 | -1, heights: number[]) =>
      heights.map((y, i) => band(onCoat(x, y, facing), i % 2 === 1 && i < heights.length - 2 ? "bone" : "bloodLight"));
    return mergeAll([
      loft([band([-0.07, 0.47, 0.06], "bloodLight"), ...striped(-0.08, 1, [0.4, 0.3, 0.195, 0.17, 0.15, 0.12, 0.1])]),
      loft([band([0.075, 0.47, 0.03], "bloodLight"), band([0.1, 0.45, -0.07], "bloodLight"), ...striped(0.095, -1, [0.4, 0.33, 0.3, 0.28, 0.26, 0.24, 0.22])]),
    ]);
  }

  it("catches the old scarf's ends sinking into the coat", LIMIT, () => {
    const figure = longfellow("old scarf");
    const { scarf, coat } = scarfOf(figure);
    scarf.geometry = oldEnds(coat);
    expect(clipsThrough(figure, [0]).some((finding) => finding.includes("scarf"))).toBe(true);
  });

  it("lays the ends clear of the coat", LIMIT, () => {
    expect(clipsThrough(longfellow("scarf"), IDLE.slice(0, 40))).toEqual([]);
  });
});
