import { describe, expect, it } from "vitest";
import { createRng, type Rng } from "@/shared/lib/seeded-random";
import type { GameState, Move, Seat } from "../contract";
import { referenceEngine as engine } from "../engine";
import { inside, randomLegalMove } from "../engine/test-kit";
import type { EngineState } from "../engine/state";
import type { Bot } from "./bot";
import { ruleV1Bot } from "./rule-v1";
import { ruleV2Bot } from "./rule-v2";
import { ruleV3Bot } from "./rule-v3";
import { ruleV4Bot } from "./rule-v4";
import { ruleV5Bot } from "./rule-v5";
import { ruleV6Bot } from "./rule-v6";

// Every move a rule bot makes is legal, and it is a function of what its seat may see alone. Asking
// each move again with the hidden cards redealt proves both that and that the bot is repeatable.
// A whole game's legality comes from `frozen.test.ts`, which replays each bot's kept games.

const SEAT: Seat = 2;
const MOVES = 60;

function ask(bot: Bot, state: GameState, seed: string): Move {
  const options = engine.options(state, SEAT);
  if (!options) throw new Error(`seat ${SEAT} has no options`);
  const view = engine.view(state, SEAT);
  return bot({ seat: SEAT, view, options, events: [], history: [], humans: view.seats.map(() => false), seed });
}

/** The same game with everything the seat can't see dealt again: the other hands (same sizes) and
 *  the deck's order, shuffled together. */
function redealHidden(state: GameState, rng: Rng): GameState {
  const s = structuredClone(inside(state)) as EngineState;
  const hidden = [...s.deck, ...s.hands.flatMap((h, i) => (i === SEAT ? [] : h))];
  for (let i = hidden.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [hidden[i], hidden[j]] = [hidden[j], hidden[i]];
  }
  let k = 0;
  s.hands = s.hands.map((h, i) => (i === SEAT ? h : h.map(() => hidden[k++])));
  s.deck = hidden.slice(k);
  return { engineState: s };
}

describe.each([
  ["rule-v1", ruleV1Bot],
  ["rule-v2", ruleV2Bot],
  ["rule-v3", ruleV3Bot],
  ["rule-v4", ruleV4Bot],
  ["rule-v5", ruleV5Bot],
  ["rule-v6", ruleV6Bot],
])("%s", (_, bot) => {
  it("makes legal moves that its seat's hidden cards don't change", () => {
    const rng = createRng("fuzz");
    const hidden = createRng("hidden");
    let state = engine.newGame({ players: 5 }, "hidden").state;
    let checked = 0;
    for (let step = 0; checked < MOVES; step++) {
      const view = engine.view(state, null);
      if (view.phase === "game-over") break;
      const options = engine.options(state, view.active);
      if (!options) throw new Error("the active seat has no options");
      let move: Move;
      if (view.active === SEAT) {
        move = ask(bot, state, `hidden/${step}`);
        expect(ask(bot, redealHidden(state, hidden), `hidden/${step}`)).toEqual(move);
        checked++;
      } else {
        move = randomLegalMove(options, engine.view(state, view.active), rng);
      }
      const result = engine.apply(state, view.active, move);
      if (!result.ok) throw new Error(`step ${step}: an illegal move ${JSON.stringify(move)}: ${result.reason}`);
      state = result.state;
    }
    // Some of these bots beat the random players before their 60th move.
    expect(checked).toBeGreaterThanOrEqual(30);
  });
});
