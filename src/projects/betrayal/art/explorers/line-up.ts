import type * as THREE from "three";
import { CHARACTERS } from "../../data/characters";
import { paceSpeed } from "../house-walk";
import { pawn } from "../kit/pawn";
import { group } from "../shapes";
import type { ExplorerBuilder } from "../stage";
import { CARD_PALETTE, figureFor } from "./by-character";
import { ADULT_WALK, STANDING, stepLength, walkingOf, type Gait, type Pace, type Stride, type Walking } from "./figure";
import { handsOf, holdIn, type Prop } from "./hands";
import { STAND_INS } from "./props";

/** Every explorer with a figure, by character, tallest first; the line-up stands them in this order. */
const EXPLORERS: readonly string[] = [
  "ox-bellows",
  "darrin-flash-williams",
  "professor-longfellow",
  "father-rhinehardt",
  "jenny-leclerc",
  "heather-granville",
  "brandon-jaspers",
  "peter-akimoto",
  "zoe-ingstrom",
];
/** How far apart the line-up stands its figures: a base and a hand's width. */
const SPACING = 0.85;

/** The Speed value a character starts the game on: the step their card's clip starts at. */
export function startingSpeed(character: string): number {
  const found = CHARACTERS.find(({ id }) => id === character);
  if (!found) throw new Error(`No character "${character}"`);
  return found.tracks.speed[found.start.speed];
}

/** Where a figure is in its stride walking or running on the spot as the house moves it, at its Speed. */
function treadmill(walking: Walking, pace: Pace, seconds: number, speed?: number): Stride {
  const running = pace === "run";
  return { phase: ((seconds * paceSpeed(pace, speed)) / stepLength(walking.step, running)) * Math.PI, amount: 1, running };
}

/** A figure walking or running on the spot as the house moves it, with its own step, at a Speed value (left out, the
 *  house's own pace). */
export function onTheSpot(build: ExplorerBuilder, seed: string, pace?: Pace, speed?: number): THREE.Object3D {
  let declared = ADULT_WALK;
  const gait: Gait = pace ? (seconds) => treadmill(declared, pace, seconds, speed) : STANDING;
  const figure = build(seed, gait);
  declared = walkingOf(figure);
  return figure;
}

/** What each explorer holds in the right hand, in line-up order: a prop each, or one for all. */
export type Holding = keyof typeof STAND_INS | "each";
/** One stand-in each, in turn, so a line-up shows every way of carrying at once. */
const EACH: readonly (keyof typeof STAND_INS)[] = ["spear", "revolver", "candle"];

function holdingIn(figure: THREE.Object3D, prop: Prop) {
  const hands = handsOf(figure);
  if (!hands) throw new Error("A figure in the line-up has no hands to hold a prop");
  holdIn(hands.right, prop);
}

/**
 * The explorers in a row, tallest first, with the scale pawn at the end,
 * across the bench's first view and facing it, as for a cast photo: for judging their heights, silhouettes and colours against each
 * other. With a `pace`, they walk or run on the spot as the house moves
 * them, each with its own step and bounce, each at their starting Speed, or
 * all at one `speed` value. With `holding`,
 * each holds a stand-in prop in the right hand. `sideOn` turns each to walk
 * across the first view, to judge a gait in profile.
 */
export function explorerLineUp(seed = "line-up", pace?: Pace, holding?: Holding, { sideOn = false, speed }: { sideOn?: boolean; speed?: number } = {}): THREE.Group {
  const figures = EXPLORERS.map((character, i) => {
    const card = CHARACTERS.find(({ id }) => id === character)?.card;
    if (!card) throw new Error(`No character "${character}"`);
    const figure = onTheSpot(figureFor(character, CARD_PALETTE[card]), `${seed}:${i}`, pace, speed ?? startingSpeed(character));
    if (holding) holdingIn(figure, STAND_INS[holding === "each" ? EACH[i % EACH.length] : holding]());
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
  return group(...holders);
}
