import type { GameState, Intent } from "../types";
import { dumbBot } from "./dumb";

/** The "Claude" bot: intended to be a genuinely challenging, pro-level opponent
 *  — the bot a human picks for a real game. It is the strategy that exercises
 *  the PROACTIVE pacer path (arming a boundary action at its own pre-roll to
 *  build houses or propose trades), not just the reactive decision phases the
 *  dumb bot answers.
 *
 *  STUB: the real strategy is not implemented yet. It currently delegates to
 *  `dumbBot`, so a "Claude" seat plays a complete (if unsophisticated) reactive
 *  game while the proactive infrastructure it will build on lands first. Because
 *  it never returns a `set-queue` arm at `pre-roll`, it never enters the
 *  proactive path today — that path is verified independently with a mock policy
 *  in `pacing.test.ts`.
 *
 *  TODO(claude-bot): replace the delegation with a real policy. Planned v1
 *  heuristics (refined over time):
 *  - Set-relative valuation, not face price: weight a property by whether it
 *    completes one of my sets or denies an opponent theirs. Orange and red are
 *    the prize (heaviest post-jail traffic); light-blue is the best early ROI;
 *    railroads are solid early; utilities are near-worthless.
 *  - `buy-decision` / `auction`: acquire to a computed VALUE (above face when it
 *    completes/denies a set), bounded by a LIQUIDITY FLOOR — keep cash ≥ the
 *    worst single rent I'm exposed to. May enter `raising-cash` to afford a
 *    set-completing buy (a proactive path the dumb bot never uses).
 *  - `must-raise-cash`: liquidate in VALUE-PRESERVING order — mortgage
 *    non-monopoly singletons first; protect monopolies and their houses (the
 *    opposite of the dumb bot's cheapest-first).
 *  - `trade-pending`: accept only when the trade nets me a monopoly or denies an
 *    opponent one AND leaves me above the liquidity floor; reject lopsided or
 *    value-losing deals (the opposite of the dumb bot's accept-all).
 *  - PROACTIVE build (own pre-roll): rush every full, unmortgaged monopoly to 3
 *    houses (the biggest rent jump), then 4; HOLD at 4 to starve the 32-house
 *    bank supply rather than always upgrading to hotels. Respect the liquidity
 *    floor.
 *  - PROACTIVE trade (own pre-roll): propose the single highest-value 2-way swap
 *    that completes one of my monopolies (offer a property the other player
 *    needs plus a cash sweetener). Deliberately simple to start.
 *  - Jail: leave early game; lean toward STAYING late game (don't volunteer to
 *    walk onto developed boards). */
export function claudeBot(state: GameState, playerId: string): Intent | null {
  return dumbBot(state, playerId);
}
