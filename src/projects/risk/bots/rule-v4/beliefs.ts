import type { GameEvent, Seat } from "../../contract";

// What this game has shown of each opponent (`ideas/rule-bot-v4.md`): whom it has been taking
// territory from. A bot keeps no state, so it reads this back from the history at every
// decision; only opponents' turns feed it, so it holds still through my own turn.

export interface TakenRecord {
  /** Per attacker, per victim: territories taken, each turn of the attacker's weighing
   *  `decay` times the one after it, so the latest turns count most. */
  taken: readonly (readonly number[])[];
}

/** The record of every seat but `me`, whose own captures say nothing of the others. */
export function readRecord(history: readonly GameEvent[], players: number, decay: number, me: Seat): TakenRecord {
  const taken = Array.from({ length: players }, () => new Array<number>(players).fill(0));
  for (const e of history) {
    if (e.kind === "turn-started") {
      const row = taken[e.seat];
      for (let v = 0; v < players; v++) row[v] *= decay;
    } else if (e.kind === "captured" && e.seat !== me) taken[e.seat][e.from] += 1;
  }
  return { taken };
}

/** The record as a key, for remembering answers that read it. */
export function recordKey(r: TakenRecord): string {
  return r.taken.map((row) => row.map((x) => x.toFixed(3)).join(",")).join(";");
}
