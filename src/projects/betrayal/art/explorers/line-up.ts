import type * as THREE from "three";
import { animated } from "../animate";
import { pawn } from "../kit/pawn";
import { group } from "../shapes";
import type { ExplorerBuilder } from "../stage";
import { ADULT_WALK, hopHeight, STANDING, walkingOf, type Stride, type Walking } from "./figure";
import { longfellow } from "./longfellow";
import { ox } from "./ox";
import { zoe } from "./zoe";

/** Every explorer figure, tallest first; the line-up stands them in this order. */
const EXPLORERS: readonly ExplorerBuilder[] = [ox, longfellow, zoe];
/** How far apart the line-up stands its figures: a base and a hand's width. */
const SPACING = 0.85;
/** The line-up's walk on the spot, in slow motion, in metres a second: slow
 *  enough that frames 1.5 s apart catch each figure at a new point in its
 *  stride rather than the same one. */
const TREADMILL = 0.12;

function treadmill({ step }: Walking, seconds: number): Stride {
  return { phase: ((seconds * TREADMILL) / step) * Math.PI, amount: 1 };
}

/**
 * The explorers in a row, tallest first, with the scale pawn at the end,
 * across the bench's first view and facing it, as for a cast photo: for judging their heights, silhouettes and colours against each
 * other. `walking` walks them on the spot, each with its own step and hop,
 * as the house walks them.
 */
export function explorerLineUp(seed = "line-up", walking = false): THREE.Group {
  const figures = EXPLORERS.map((build, i) => {
    let declared = ADULT_WALK;
    const figure = build(`${seed}:${i}`, walking ? (seconds) => treadmill(declared, seconds) : STANDING);
    declared = walkingOf(figure);
    return figure;
  });
  const row = [...figures, pawn()];
  const holders = row.map((figure, i) => {
    const holder = group(figure);
    const along = (i - (row.length - 1) / 2) * SPACING;
    holder.position.set(along * Math.SQRT1_2, 0, -along * Math.SQRT1_2);
    holder.rotation.y = Math.PI / 4;
    return holder;
  });
  return animated(group(...holders), (seconds) => {
    for (const [i, figure] of figures.entries()) {
      holders[i].position.y = walking ? hopHeight(walkingOf(figure), treadmill(walkingOf(figure), seconds)) : 0;
    }
  });
}
