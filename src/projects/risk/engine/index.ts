import { createRng } from "@/shared/lib/seeded-random";
import type { ApplyResult, GameState, Move, RiskEngine, Seat } from "../contract";
import { attack, blitz, endAttack, moveIn, occupy } from "./combat";
import { fortify, skipFortify } from "./fortify";
import { attacks, fortifyMoves } from "./legal";
import { options } from "./options";
import { placeReinforcements, trade } from "./reinforce";
import { newGame, setupPlace } from "./setup";
import { unwrap, wrap, type Ctx, type EngineState } from "./state";
import { endAttackPhase, endTurn } from "./turn";
import { redact, view } from "./view";

/** The reference engine: plain code, one rule at a time, written to be read. It plays real games
 *  and is the oracle the fast engine is tested against. */
export const referenceEngine: RiskEngine = {
  newGame,
  apply,
  options: (state, seat) => options(unwrap(state), seat),
  view: (state, viewer) => view(unwrap(state), viewer),
  redact,
};

function apply(state: GameState, seat: Seat, move: Move): ApplyResult {
  const current = unwrap(state);
  if (current.phase === "game-over") return { ok: false, reason: "the game is over" };
  if (seat !== current.active) return { ok: false, reason: "it is not your turn" };

  // The move works on its own copy. The state is plain JSON (`GameState`), so a JSON round trip
  // copies it exactly, and in Node it is several times faster than `structuredClone`.
  const s = JSON.parse(JSON.stringify(current)) as EngineState;
  const ctx: Ctx = { s, rng: createRng(s.rng), events: [] };
  const reason = applyMove(ctx, seat, move);
  if (reason !== null) return { ok: false, reason };
  takeForcedSteps(ctx);
  s.rng = ctx.rng.getState();
  return { ok: true, state: wrap(s), events: ctx.events };
}

/** The move, if the phase allows its kind; each handler checks the rest. */
function applyMove(ctx: Ctx, seat: Seat, move: Move): string | null {
  const phase = ctx.s.phase;
  const wrongPhase = `"${move.kind}" is not a move in the ${phase} phase`;
  switch (move.kind) {
    case "place":
      if (phase === "setup-place") return setupPlace(ctx, seat, move);
      if (phase === "reinforce") return placeReinforcements(ctx, seat, move);
      return wrongPhase;
    case "trade":
      return phase === "reinforce" ? trade(ctx, seat, move) : wrongPhase;
    case "attack":
      return phase === "attack" ? attack(ctx, seat, move) : wrongPhase;
    case "blitz":
      return phase === "attack" ? blitz(ctx, seat, move) : wrongPhase;
    case "occupy":
      return phase === "attack" ? occupy(ctx, move) : wrongPhase;
    case "end-attack":
      return phase === "attack" ? endAttack(ctx) : wrongPhase;
    case "fortify":
      return phase === "fortify" ? fortify(ctx, seat, move) : wrongPhase;
    case "end-turn":
      return phase === "fortify" ? skipFortify(ctx) : wrongPhase;
    default:
      return "unknown move";
  }
}

/** Steps the rules leave no choice over, taken until the next real decision: a move-in whose
 *  minimum is its maximum, and an attack or fortify phase with nothing to do but end it. */
function takeForcedSteps(ctx: Ctx): void {
  const s = ctx.s;
  for (;;) {
    if (s.phase === "attack" && s.occupying && s.occupying.min === s.occupying.max) {
      moveIn(ctx, s.occupying.min);
    } else if (s.phase === "attack" && !s.occupying && attacks(s, s.active).length === 0) {
      endAttackPhase(ctx);
    } else if (s.phase === "fortify" && fortifyMoves(s, s.active).length === 0) {
      endTurn(ctx);
    } else {
      return;
    }
  }
}
