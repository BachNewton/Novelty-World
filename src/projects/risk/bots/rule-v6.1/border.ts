import type { OpponentTurn } from "../rule-v6/opponents";

// One of v6.1's changes (`ideas/rule-bot-v6.1.md`): how the border loss gathers the opponents'
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
