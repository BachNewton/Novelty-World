import type { Seat } from "../../contract";
import { boardKey, type Board } from "../rule-v1/board";
import { Memo } from "../memo";
import type { Breakdown, Scorer } from "../rule-v6/evaluate";
import { forecast, type OpponentTurn } from "../rule-v6/opponents";
import type { Params as V6Params } from "../rule-v6/params";

// v6.1's one change (`ideas/rule-bot-v6.1.md`): how the border loss gathers the opponents'
// blows. v6 sums every opponent's aim at me times the hit it could deal me, as if they all
// struck at once, so the charge grows with the table and hoarding looks safest
// (`ideas/stalled-games.md`).

export const BORDER_MODES = ["sum", "max", "mean"] as const;

/** `sum`: v6's, every opponent's aim × hit added up. `max`: only the opponent whose aim × hit
 *  is largest. `mean`: the sum over the number of opponents counted. */
export type BorderMode = (typeof BORDER_MODES)[number];

export function borderMode(name: string): BorderMode {
  const mode = BORDER_MODES.find((m) => m === name);
  if (mode === undefined) throw new Error(`a border mode is one of ${BORDER_MODES.join(", ")}, not "${name}"`);
  return mode;
}

/** The border loss the opponents' turns add up to, by `mode`. An opponent counts when v6's model
 *  sees it reach me (any aim case but "apart"); the sum adds the same terms in the same order as
 *  v6's, so `sum` is v6's border loss exactly. */
export function borderOf(turns: readonly OpponentTurn[], mode: BorderMode): number {
  let sum = 0;
  let most = 0;
  let counted = 0;
  for (const t of turns) {
    if (t.aimCase === "apart") continue;
    const loss = t.aim * t.hit;
    sum += loss;
    most = Math.max(most, loss);
    counted++;
  }
  switch (mode) {
    case "sum":
      return sum;
    case "max":
      return most;
    case "mean":
      return counted === 0 ? 0 : sum / counted;
  }
}

/** v6's value with its border charge swapped for `mode`'s: the breakdown carries v6's summed
 *  border loss, and v6's opponent model gives each opponent's term, from the same settings and
 *  record the breakdown was taken with. Every board v6's planner, move-in, trade and fortify
 *  score goes through the settings' scorer, so this is the only place the change lives. */
export function borderScorer(params: V6Params, mode: BorderMode): Scorer {
  const borders = new Memo<number>(300);
  return (b: Board, me: Seat, bd: Breakdown): number => {
    const alive: Seat[] = [];
    for (let s = 0; s < b.players; s++) if (b.alive[s]) alive.push(s);
    // A seat out of the game, or the last one in it: v6's breakdown has no border term there.
    if (!b.alive[me] || alive.length === 1) return bd.value;
    const border = borders.get(`${me.toString()}|${boardKey(b)}`, () => borderOf(forecast(b, me, params, alive, params.record).turns, mode));
    return bd.value + (params.prefs.borderWeight * (bd.borderLoss - border)) / bd.total;
  };
}
