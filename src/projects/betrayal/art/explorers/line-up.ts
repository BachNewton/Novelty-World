import type * as THREE from "three";
import { animated } from "../animate";
import { RUN_SPEED, WALK_SPEED } from "../house-walk";
import { pawn } from "../kit/pawn";
import { group } from "../shapes";
import type { ExplorerBuilder } from "../stage";
import { ADULT_WALK, hopHeight, STANDING, stepLength, walkingOf, type Gait, type Pace, type Stride, type Walking } from "./figure";
import { handsOf, holdIn, type Prop } from "./hands";
import { longfellow } from "./longfellow";
import { ox } from "./ox";
import { STAND_INS } from "./props";
import { zoe } from "./zoe";

/** Every explorer figure, tallest first; the line-up stands them in this order. */
const EXPLORERS: readonly ExplorerBuilder[] = [ox, longfellow, zoe];
/** How far apart the line-up stands its figures: a base and a hand's width. */
const SPACING = 0.85;
/** The house's paces, in metres a second, for walking and running on the spot. */
const PACE: Record<Pace, number> = { walk: WALK_SPEED, run: RUN_SPEED };

/** Where a figure is in its stride walking or running on the spot at the house's pace, as the house moves it. */
function treadmill(walking: Walking, pace: Pace, seconds: number): Stride {
  const running = pace === "run";
  return { phase: ((seconds * PACE[pace]) / stepLength(walking.step, running)) * Math.PI, amount: 1, running };
}

/** A figure walking or running on the spot at the house's pace, with its own step. */
export function onTheSpot(build: ExplorerBuilder, seed: string, pace?: Pace): THREE.Object3D {
  let declared = ADULT_WALK;
  const gait: Gait = pace ? (seconds) => treadmill(declared, pace, seconds) : STANDING;
  const figure = build(seed, gait);
  declared = walkingOf(figure);
  return figure;
}

/** What each explorer holds in the right hand, in line-up order: a prop each, or one for all. */
export type Holding = keyof typeof STAND_INS | "each";
/** One stand-in each, so a line-up shows every way of carrying at once. */
const EACH: readonly (keyof typeof STAND_INS)[] = ["spear", "revolver", "candle"];

function holdingIn(figure: THREE.Object3D, prop: Prop) {
  const hands = handsOf(figure);
  if (!hands) throw new Error("A figure in the line-up has no hands to hold a prop");
  holdIn(hands.right, prop);
}

/**
 * The explorers in a row, tallest first, with the scale pawn at the end,
 * across the bench's first view and facing it, as for a cast photo: for judging their heights, silhouettes and colours against each
 * other. With a `pace`, they walk or run on the spot at the house's pace,
 * each with its own step and hop, as the house moves them. With `holding`,
 * each holds a stand-in prop in the right hand. `sideOn` turns each to walk
 * across the first view, to judge a gait in profile.
 */
export function explorerLineUp(seed = "line-up", pace?: Pace, holding?: Holding, { sideOn = false } = {}): THREE.Group {
  const figures = EXPLORERS.map((build, i) => {
    const figure = onTheSpot(build, `${seed}:${i}`, pace);
    if (holding) holdingIn(figure, STAND_INS[holding === "each" ? EACH[i] : holding]());
    return figure;
  });
  const row = [...figures, pawn()];
  const holders = row.map((figure, i) => {
    const holder = group(figure);
    const along = (i - (row.length - 1) / 2) * SPACING;
    holder.position.set(along * Math.SQRT1_2, 0, -along * Math.SQRT1_2);
    // Side on, each walks across the first view, so a gait shows in profile.
    holder.rotation.y = Math.PI / 4 + (sideOn && i < figures.length ? -Math.PI / 2 : 0);
    return holder;
  });
  return animated(group(...holders), (seconds) => {
    for (const [i, figure] of figures.entries()) {
      holders[i].position.y = pace ? hopHeight(walkingOf(figure), treadmill(walkingOf(figure), pace, seconds)) : 0;
    }
  });
}
