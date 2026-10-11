import type { FigureId, Trait } from "../types";
import { TRAITS } from "../engine/figures";
import type { Engine } from "../engine/step-loop";
import type { GameView } from "../engine/view";

/*
 * A trait as the character card prints it: a track of the character's own
 * values, lowest first, with a clip on one step and a skull past the lowest
 * (p. 5). A change moves the clip a step per point, never past the top.
 * Before the haunt no one can die, so a loss stops at the lowest step: the
 * skull is locked. From the haunt on, a loss past the lowest step reaches
 * the skull, and the explorer dies.
 */

/** Whether reaching the skull kills: not before the haunt (p. 5). */
export type SkullState = "locked" | "live";

export interface TraitTrack {
  trait: Trait;
  /** The printed values, lowest (next to the skull) first; the last is the maximum. */
  values: readonly number[];
  /** The step the clip is on, as an index into the values. */
  clip: number;
  /** The step the clip starts on, printed in green on the card. */
  start: number;
  skull: SkullState;
  /** Where a change previewed would leave the clip, or null with none previewed. */
  lands: Landing | null;
  /** The change previewed would pass the lowest step, and the locked skull stops it there. */
  stopped: boolean;
}

/** A step, by its index into the track, or the skull. */
export type Landing = number | "skull";

export const skullState = (status: GameView["status"]): SkullState => (status === "exploring" || status === "lobby" ? "locked" : "live");

/** Where moving the clip by spaces (a gain above 0, a loss below) leaves it:
 *  never past the top, and at the lowest step rather than the skull while
 *  the skull is locked. */
export function landing(steps: number, clip: number, spaces: number, skull: SkullState): Landing {
  const to = clip + spaces;
  if (to < 0) return skull === "live" ? "skull" : 0;
  return Math.min(to, steps - 1);
}

/** How many losses the clip can take before it reaches the skull: one per step down, and the step past the lowest. */
export const stepsAboveSkull = (clip: number): number => clip + 1;

/** A figure's four tracks, in the card's order, with nothing previewed. */
export function figureTracks(engine: Engine, view: GameView, figure: FigureId): TraitTrack[] {
  return TRAITS.map((trait) => traitTrack(engine, view, figure, trait, null));
}

/** One of a figure's tracks, with a change of `spaces` previewed (or null). */
export function traitTrack(engine: Engine, view: GameView, figure: FigureId, trait: Trait, spaces: number | null): TraitTrack {
  const shown = view.figures[figure];
  const source = engine.catalog.figures[shown.definition].traits;
  if (source.kind !== "tracks" || shown.clips === null) throw new Error(`${shown.name}'s traits aren't on tracks`);
  const values = source.tracks[trait];
  const clip = shown.clips[trait];
  const skull = skullState(view.status);
  return {
    trait,
    values,
    clip,
    start: source.start[trait],
    skull,
    lands: spaces === null ? null : landing(values.length, clip, spaces, skull),
    stopped: spaces !== null && skull === "locked" && clip + spaces < 0,
  };
}

