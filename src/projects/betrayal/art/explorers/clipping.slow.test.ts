import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { animationOf } from "../animate";
import { loft, mergeAll, solidOf, surfaceAt, type Section, type Vec3 } from "../forms";
import { partsOf } from "../figure-parts";
import { stubCanvas } from "../headless";
import type { ExplorerBuilder } from "../stage";
import { clipping } from "./clipping";
import { cueBurst, type Pace } from "./figure";
import { handsOf, holdIn } from "./hands";
import { onTheSpot } from "./line-up";
import { flash } from "./flash";
import { jenny } from "./jenny";
import { longfellow } from "./longfellow";
import { ox } from "./ox";
import { peter } from "./peter";
import { vivian } from "./vivian";
import { missy } from "./missy";
import { rhinehardt } from "./rhinehardt";
import { PROP_PARTS, STAND_INS } from "./props";
import { brandon } from "./brandon";
import { heather } from "./heather";
import { zoe } from "./zoe";
import { zostra } from "./zostra";

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

const EXPLORERS: Record<string, ExplorerBuilder> = { longfellow, ox, zoe, rhinehardt, flash, brandon, heather, peter, vivian, jenny, zostra, missy };
/** Zoe and Rhinehardt are checked in the heavy cloth (`?cloth=off`): the check leaves their simulated nets out
 *  (`isClothSheet`), and their rigid parts are the same either way, so simulating the nets through every moment would
 *  only cost time. */
const CHECKED: Partial<Record<string, ExplorerBuilder>> = {
  zoe: (seed, gait) => zoe(seed, gait, { cloth: "off" }),
  rhinehardt: (seed, gait) => rhinehardt(seed, gait, { cloth: "off" }),
  zostra: (seed, gait) => zostra(seed, gait, { cloth: "off" }),
};

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
/** A check takes one to nine seconds alone, its figure's parts meshed before it: the longest, Rhinehardt's, samples his
 *  robe again at every moment, as his legs reshape it. */
const LIMIT = { timeout: 30_000 };

/** The longest one figure's meshing may take, under a full run's load. */
const MESHING = 60_000;

describe.each(Object.entries(EXPLORERS))("%s", (name, own) => {
  const build = CHECKED[name] ?? own;
  // Meshing the parts is the slow step, done once a session: it belongs to no one check. It takes up to
  // about 6 s alone (Peter's).
  beforeAll(() => {
    for (const parts of [...partsOf(own), PROP_PARTS]) parts.get();
  }, MESHING);

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

/*
 * Jenny's book is a held prop, and the check lets a held thing pass into the
 * hand and forearm round its grip, as a handle passes into the fist that
 * closes on it. Her forearm lies across the book's front, a few centimetres
 * from the grip, so a forearm sunk into the cover went unseen. Her book is
 * held to a stricter rule: no surface point of her left arm lies inside it,
 * nor any of its points inside her arm or her cardigan, at any moment of her
 * idle, cued bursts, walk or run. Only her hand's own parts may touch it.
 */
describe("jenny's book", () => {
  /** How deep one part's surface lies inside another's solid, at its deepest. */
  function deepest(a: THREE.Mesh, b: THREE.Mesh): number {
    const solid = solidOf(b.geometry as THREE.BufferGeometry);
    if (!solid) throw new Error(`${b.name} has no solid`);
    const into = b.matrixWorld.clone().invert().multiply(a.matrixWorld);
    const position = (a.geometry as THREE.BufferGeometry).getAttribute("position");
    const point = new THREE.Vector3();
    let depth = 0;
    for (let i = 0; i < position.count; i += 2) {
      point.fromBufferAttribute(position, i).applyMatrix4(into);
      depth = Math.max(depth, -solid.distance(point.x, point.y, point.z));
    }
    return depth;
  }

  function crossings(figure: THREE.Object3D, times: readonly number[]): string[] {
    const named = (name: string) => {
      const found = figure.getObjectByName(name);
      if (!(found instanceof THREE.Mesh)) throw new Error(`Jenny has no ${name}`);
      return found;
    };
    const book = named("book");
    const others = ["left forearm", "left upper arm", "cardigan"].map(named);
    const found: string[] = [];
    for (const at of times) {
      figure.traverse((object) => animationOf(object)?.(at));
      figure.updateMatrixWorld(true);
      for (const other of others) {
        const depth = Math.max(deepest(other, book), other.name === "cardigan" ? 0 : deepest(book, other));
        if (depth > 0.0015) found.push(`at ${at.toFixed(2)} s: the book and her ${other.name} cross, ${(depth * 1000).toFixed(1)} mm deep`);
      }
    }
    return found;
  }

  for (const pace of [undefined, "walk", "run"] as (Pace | undefined)[]) {
    it(`sits clear of her arm and chest ${pace ? `${pace === "run" ? "running" : "walking"}` : "standing"}`, LIMIT, () => {
      expect(crossings(onTheSpot(jenny, "jenny's book", pace), pace ? STRIDES : IDLE).slice(0, 5)).toEqual([]);
    });
  }

  for (const name of ["peek", "crowd"]) {
    it(`sits clear of her arm and chest through her ${name}`, LIMIT, () => {
      const figure = jenny("jenny's book");
      cueBurst(figure, { name, at: 0, repeat: false });
      expect(crossings(figure, moments(0, 0.05, 80)).slice(0, 5)).toEqual([]);
    });
  }
});
