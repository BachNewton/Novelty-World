// ===========================================================================
// kyle-v1 SNAPSHOT — the first version of the KYLE lineage, a new bot family
// distinct from claude / jane / gemini and the paradigm lines (see EVOLUTION.md
// "Bot lineages"). Authored by Kyle, from scratch.
//
// This is an intentionally EMPTY contract implementation: the policy is wired
// into our `Bot` contract but makes no decisions yet — it returns `null` for
// every situation, which the pacer reads as "no improvement on the default" and
// substitutes the guaranteed-legal default move (see `decision.ts`). So kyle-v1
// plays a fully legal, never-stalling game out of the box; it just plays the
// engine's defaults. Strategy gets layered in from here, one refinement at a
// time. See `monopoly/CLAUDE.md` "Bots" for the contract.
// ===========================================================================
import type { Bot } from "../../decision";

export const policy: Bot = () => {
  // No logic yet — defer to the engine's legal default in every phase. Kyle's
  // strategy gets layered in here; a typical first move is to bind the seat:
  //   const me = state.players.find((p) => p.id === playerId);
  //   if (!me) return null;
  return null;
};
