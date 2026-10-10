import { it } from "vitest";
import { ENGINE } from "../game";
import { simulate } from "../simulation";
import { choices } from "../engine/step-loop";
import type { Decision, GameState } from "../types";

it("count", () => {
  const acts = new Map<string, [number, number]>();
  for (const seed of ["lookahead-haunt-1", "lookahead-1"]) {
    simulate(seed, ENGINE, (state: GameState) => {
      const p = state.pending;
      if (p?.type !== "decision" || p.kind !== "turn") return;
      const seat = p.seats[0];
      const cands = ENGINE.rules.decisions.turn!.candidates(state, p as Decision, seat, ENGINE) as { act: string }[];
      const legal = choices(ENGINE, state, seat).map((c) => (c.choice as { act: string }).act);
      for (const c of cands) { const a = acts.get(c.act) ?? [0, 0]; a[0]++; acts.set(c.act, a); }
      for (const l of legal) { const a = acts.get(l) ?? [0, 0]; a[1]++; acts.set(l, a); }
    }, seed.includes("haunt") ? { haunt: 13 } : {});
  }
  console.log([...acts].map(([k, [c, l]]) => `${k}: candidates ${c} legal ${l}`).join("\n"));
}, 600_000);
