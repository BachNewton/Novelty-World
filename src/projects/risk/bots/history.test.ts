import { describe, expect, it } from "vitest";
import type { GameEvent, Seat } from "../contract";
import { referenceEngine as engine } from "../engine";
import { inside } from "../engine/test-kit";
import { greedyBot } from "./greedy";
import { randomBot } from "./random";
import { boardsAtTurnEnds, roundsCompleted, turnSoFar } from "./history";

/** A game of greedy and random bots, checking the history's derivations against the engine's
 *  own state at every decision. */
function checkGame(seed: string, players: number): number {
  const started = engine.newGame({ players }, seed);
  let state = started.state;
  const history: GameEvent[] = [...engine.redact(started.events, 0)];
  let checked = 0;
  for (let decision = 0; decision < 20_000; decision++) {
    const s = inside(state);
    if (s.phase === "game-over") return checked;
    expect(roundsCompleted(history)).toBe(s.round);
    const so = turnSoFar(history);
    expect(so.seat).toBe(s.active);
    expect(so.captured.length > 0).toBe(s.capturedThisTurn);
    checked++;
    const seat: Seat = s.active;
    const options = engine.options(state, seat);
    if (!options) throw new Error("no options");
    const input = { seat, view: engine.view(state, seat), options, events: [], history, humans: [], seed: `${seed}/${decision}` };
    const move = seat === 0 ? randomBot(input) : greedyBot(input);
    const result = engine.apply(state, seat, move);
    if (!result.ok) throw new Error(result.reason);
    state = result.state;
    history.push(...engine.redact(result.events, 0));
  }
  return checked;
}

describe("the history's derivations", () => {
  it.each([3, 4, 5, 6])("agree with the engine through a whole game at %i players", (players) => {
    expect(checkGame(`history-${players}`, players)).toBeGreaterThan(100);
  });

  it("rebuild the board at every turn's end exactly", () => {
    const started = engine.newGame({ players: 4 }, "boards");
    let state = started.state;
    const history: GameEvent[] = [...started.events];
    let ends = 0;
    for (let decision = 0; decision < 5000 && inside(state).phase !== "game-over"; decision++) {
      const seat = inside(state).active;
      const options = engine.options(state, seat);
      if (!options) throw new Error("no options");
      const input = { seat, view: engine.view(state, seat), options, events: [], history, humans: [], seed: "x" };
      const result = engine.apply(state, seat, greedyBot(input));
      if (!result.ok) throw new Error(result.reason);
      history.push(...result.events);
      state = result.state;
      // A new turn changes nothing on the board before its first move: the board now is the one
      // the last turn ended on.
      if (result.events.some((e) => e.kind === "turn-started")) {
        expect(boardsAtTurnEnds(history).at(-1)?.board).toEqual(engine.view(state, null).territories);
        ends++;
      }
    }
    expect(ends).toBeGreaterThan(20);
  });

  it("list this turn's attacks, captures, placements and trades", () => {
    const history: GameEvent[] = [
      { rule: "", kind: "turn-order", order: [0, 1, 2] },
      { rule: "", kind: "turn-started", seat: 1, turn: 2 },
      { rule: "", kind: "captured", seat: 1, territory: "peru", from: 0 },
      { rule: "", kind: "turn-started", seat: 2, turn: 3 },
      { rule: "", kind: "traded", seat: 2, cards: ["wild-1", "wild-2", "peru"], armies: 10, bonus: null },
      { rule: "", kind: "placed", owner: 2, territory: "japan", armies: 3 },
      { rule: "", kind: "placed", owner: 2, territory: "japan", armies: 2 },
      { rule: "", kind: "placed", owner: 2, territory: "siam", armies: 2 },
      { rule: "", kind: "blitzed", from: "japan", to: "kamchatka", attackerLosses: 1, defenderLosses: 4 },
      { rule: "", kind: "captured", seat: 2, territory: "kamchatka", from: 0 },
      { rule: "", kind: "battle", from: "siam", to: "india", attackerDice: [6], defenderDice: [6], attackerLosses: 1, defenderLosses: 0 },
    ];
    expect(turnSoFar(history)).toEqual({
      seat: 2,
      turn: 3,
      attacks: [
        { from: "japan", to: "kamchatka", blitz: true },
        { from: "siam", to: "india", blitz: false },
      ],
      captured: ["kamchatka"],
      placedOn: ["japan", "siam"],
      traded: 1,
    });
    expect(roundsCompleted(history)).toBe(0);
    expect(roundsCompleted([...history, { rule: "", kind: "turn-started", seat: 0, turn: 4 }])).toBe(1);
  });
});
