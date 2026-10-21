import { describe, expect, it } from "vitest";
import type { GameEvent, GameState, Move, Seat } from "../../contract";
import { ENGINE } from "../../play-engine";
import type { BotInput } from "../bot";
import { fromView, type Board } from "../rule-v1/board";
import { sweepAgainst } from "../rule-v4/opponents";
import { expectedIncome } from "../rule-v4/worth";
import record from "../rule-v4/g4fr.json";
import { ruleV5Bot } from "./index";

// G4FR (`rule-v4/g4fr.test.ts`): a person (seat 0) won it against another person, rule-v3 (seat
// 2), gd-stacker and gd-continental, with one stack fed every army, sweeping thin territories. v3
// spread thin and was swept. Here v5 plays whole turns of v3's, from the position v3 had as the
// turn began, on the dice the game's random source gives, beside the turn v3 played.

interface GameRecord {
  seed: string;
  players: number;
  humans: boolean[];
  moves: [Seat, Move][];
}

// The JSON import types each move by its literal shape, not as a Move.
const G4FR = record as unknown as GameRecord;
const V3 = 2;
const PEOPLE: Seat[] = [0, 1];

/** The game just before decision `at`, and its history. */
function before(decision: number): { state: GameState; events: GameEvent[] } {
  const started = ENGINE.newGame({ players: G4FR.players }, G4FR.seed);
  let state = started.state;
  const events: GameEvent[] = [...started.events];
  for (const [seat, move] of G4FR.moves.slice(0, decision)) {
    const result = ENGINE.apply(state, seat, move);
    if (!result.ok) throw new Error(`G4FR doesn't replay: ${result.reason}`);
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}

/** The decision that begins v3's turn `turn`, and the one after its last move. */
function turnOf(turn: number): { start: number; end: number } {
  let start = -1;
  let state = ENGINE.newGame({ players: G4FR.players }, G4FR.seed).state;
  for (let i = 0; i < G4FR.moves.length; i++) {
    const [seat, move] = G4FR.moves[i];
    const now = ENGINE.view(state, null).turn;
    if (start < 0 && seat === V3 && now === turn) start = i;
    if (start >= 0 && now !== turn) return { start, end: i };
    const result = ENGINE.apply(state, seat, move);
    if (!result.ok) throw new Error(result.reason);
    state = result.state;
  }
  throw new Error(`v3 has no turn ${turn.toString()} in G4FR`);
}

interface Turn {
  end: Board;
  /** Where the turn's armies were placed, by territory. */
  placed: Map<string, number>;
  captures: number;
}

/** A whole turn from v3's position at decision `start`, on the game's own random source: v5's,
 *  or (with `moves`) the one v3 played. */
function playTurn(start: number, moves?: readonly Move[]): Turn {
  let { state, events } = before(start);
  const placed = new Map<string, number>();
  let captures = 0;
  for (let k = 0; ENGINE.view(state, null).active === V3; k++) {
    const options = ENGINE.options(state, V3);
    if (!options) throw new Error("v3's seat has no decision");
    const input: BotInput = { seat: V3, view: ENGINE.view(state, V3), options, events: [], history: ENGINE.redact(events, V3), humans: G4FR.humans, seed: `g4fr/${k.toString()}` };
    const move = moves ? moves[k] : ruleV5Bot(input);
    if (move.kind === "place") placed.set(move.territory, (placed.get(move.territory) ?? 0) + move.armies);
    const result = ENGINE.apply(state, V3, move);
    if (!result.ok) throw new Error(result.reason);
    captures += result.events.filter((e) => e.kind === "captured").length;
    state = result.state;
    events = [...events, ...result.events];
  }
  return { end: fromView(ENGINE.view(state, V3)), placed, captures };
}

const v3Turn = (turn: number) => {
  const { start, end } = turnOf(turn);
  return playTurn(start, G4FR.moves.slice(start, end).map(([, m]) => m));
};
const v5Turn = (turn: number) => playTurn(turnOf(turn).start);

/** The shape of a seat's end of turn: what it holds, its biggest stack, and how many of its
 *  territories a person's sweep is believed to take before its next turn, at the worst. */
function shape(b: Board): { territories: number; biggest: number; swept: number } {
  let territories = 0;
  let biggest = 0;
  for (let t = 0; t < b.owner.length; t++) {
    if (b.owner[t] !== V3) continue;
    territories++;
    biggest = Math.max(biggest, b.armies[t]);
  }
  let swept = 0;
  for (const person of PEOPLE) {
    const sweep = sweepAgainst(b, V3, person, Math.round(expectedIncome(b, V3)[person]));
    swept = Math.max(swept, b.owner.filter((o, t) => o === V3 && sweep.owner[t] === person).length);
  }
  return { territories, biggest, swept };
}

describe("G4FR, played by v5", () => {
  it("turn 62: feeds one stack and chains its captures, where v3 took one territory", () => {
    // v3 put its 8 armies on Central America beside its stack of 15, took one territory with
    // another stack, and marched the 22 to Alaska.
    const v3 = v3Turn(62);
    expect([...v3.placed]).toEqual([["central-america", 8]]);
    expect(v3.captures).toBe(1);
    // v5 puts all 8 on Japan's stack and sweeps from it, Mongolia, Siberia, Ural and on, its other
    // stack sweeping South America and into Africa: 15 territories in the turn, the winner's way.
    const v5 = v5Turn(62);
    expect([...v5.placed]).toEqual([["japan", 8]]);
    expect(v5.captures).toBeGreaterThanOrEqual(10);
  });

  it("turn 89: ends on fewer territories with a stack, where v3 spread thin and lost", () => {
    // v3 went from 10 territories to 17, its biggest stack 4, and the winner's stack took 13 of
    // them two turns later.
    expect(shape(v3Turn(89).end)).toEqual({ territories: 17, biggest: 4, swept: 14 });
    const v5 = shape(v5Turn(89).end);
    expect(v5.territories).toBeLessThanOrEqual(13);
    expect(v5.biggest).toBeGreaterThanOrEqual(8);
    expect(v5.swept).toBeLessThan(14);
  });
});
