import { describe, expect, it } from "vitest";
import type { GameEvent, GameState, Move, Seat } from "../../contract";
import type { TerritoryId } from "../../map";
import { ENGINE } from "../../play-engine";
import type { BotInput } from "../bot";
import g4fr from "../rule-v4/g4fr.json";
import nineVfl from "../rule-v6/9vfl.json";
import { sweeperV1Bot } from "./index";
import { GUARD } from "./rules";

// The human winner of G4FR and 9VFL played seat 0 of both. Here sweeper-v1 takes his seat at the
// start of one of his turns and plays the whole turn on the game's own random source, beside
// what he did, to show its moves are of his kind: one stack fed, captures chained, the stack
// brought home.

interface GameRecord {
  seed: string;
  players: number;
  humans: boolean[];
  moves: [Seat, Move][];
}

// The JSON import types each move by its literal shape, not as a Move.
const G4FR = g4fr as unknown as GameRecord;
const NINE_VFL = nineVfl as unknown as GameRecord;
const WINNER = 0;

interface Turn {
  moves: Move[];
  captures: number;
  end: GameState;
}

/** A whole turn in the winner's seat, from the start of his turn `turn`: sweeper-v1's, or with
 *  `recorded` the one he played. */
function playTurn(game: GameRecord, turn: number, recorded = false): Turn {
  const started = ENGINE.newGame({ players: game.players }, game.seed);
  let state = started.state;
  let events: GameEvent[] = [...started.events];
  let next = 0;
  for (; next < game.moves.length; next++) {
    const [seat, move] = game.moves[next];
    if (seat === WINNER && ENGINE.view(state, null).turn === turn) break;
    const result = ENGINE.apply(state, seat, move);
    if (!result.ok) throw new Error(`the game doesn't replay: ${result.reason}`);
    state = result.state;
    events = [...events, ...result.events];
  }
  if (ENGINE.view(state, null).turn !== turn) throw new Error(`the winner has no turn ${turn.toString()}`);
  const moves: Move[] = [];
  let captures = 0;
  while (ENGINE.view(state, null).active === WINNER && ENGINE.view(state, null).phase !== "game-over") {
    const options = ENGINE.options(state, WINNER);
    if (!options) throw new Error("the winner's seat has no decision");
    const input: BotInput = { seat: WINNER, view: ENGINE.view(state, WINNER), options, events: [], history: ENGINE.redact(events, WINNER), humans: game.humans, seed: "sweeper" };
    const move = recorded ? game.moves[next + moves.length][1] : sweeperV1Bot(input);
    moves.push(move);
    const result = ENGINE.apply(state, WINNER, move);
    if (!result.ok) throw new Error(result.reason);
    captures += result.events.filter((e) => e.kind === "captured").length;
    state = result.state;
    events = [...events, ...result.events];
  }
  return { moves, captures, end: state };
}

const placed = (moves: readonly Move[]) => moves.flatMap((m) => (m.kind === "place" ? [[m.territory, m.armies] as const] : []));
const blitzes = (moves: readonly Move[]) => moves.flatMap((m) => (m.kind === "blitz" ? [m] : []));
const fortify = (moves: readonly Move[]) => moves.find((m) => m.kind === "fortify");

/** Whether every blitz goes on from the territory the one before took: one stack's path. */
function chained(moves: readonly Move[]): boolean {
  const run = blitzes(moves);
  return run.every((m, i) => i === 0 || m.from === run[i - 1].to || m.from === run[i - 1].from);
}

describe("sweeper-v1 in the winner's seat", () => {
  it("G4FR turn 25: trades, feeds one stack, sweeps, and brings the stack home", () => {
    // He traded for 10, put all 15 on India, swept 7 territories from Afghanistan to
    // Scandinavia, and fortified the 5 left back to India.
    const turn = playTurn(G4FR, 25);
    expect(turn.moves[0].kind).toBe("trade");
    const places = placed(turn.moves);
    expect(places).toHaveLength(1);
    const [launch] = places[0];
    expect(chained(turn.moves)).toBe(true);
    expect(blitzes(turn.moves)[0].from).toBe(launch);
    expect(turn.captures).toBeGreaterThanOrEqual(7);
    const run = blitzes(turn.moves);
    expect(fortify(turn.moves)).toMatchObject({ from: run[run.length - 1].to, to: launch });
  });

  it("9VFL turn 42: tops up the guard on Siam, sweeps from the Middle East, and comes home to it", () => {
    // He held Australia with a guard, traded for 10, put all 15 on the Middle East, swept 6
    // territories through Europe and fortified the 16 left from Ukraine back to the Middle East.
    const turn = playTurn(NINE_VFL, 42);
    const places = placed(turn.moves);
    const toStack = places.filter(([t]) => t !== "siam");
    expect(toStack).toEqual([["middle-east", expect.any(Number) as number]]);
    expect(blitzes(turn.moves)[0].from).toBe("middle-east");
    expect(chained(turn.moves)).toBe(true);
    expect(turn.captures).toBeGreaterThanOrEqual(6);
    expect(fortify(turn.moves)).toMatchObject({ to: "middle-east" });
    const siam = ENGINE.view(turn.end, null).territories.siam;
    expect(siam).toMatchObject({ owner: WINNER });
    expect(siam.armies).toBeGreaterThanOrEqual(GUARD);
  });

  it.each([
    ["G4FR", G4FR, [25, 37, 49, 58, 79, 91]],
    ["9VFL", NINE_VFL, [42, 50, 58, 70, 79]],
  ] as const)("%s: on each of his trade turns, feeds one stack and chains about as many captures as he did", (_, game, turns) => {
    let mine = 0;
    let his = 0;
    for (const t of turns) {
      const turn = playTurn(game, t);
      const stacks = new Set<TerritoryId>(placed(turn.moves).map(([territory]) => territory));
      // The guard's top-up is the one other place an army may go.
      expect(stacks.size, `turn ${t.toString()}`).toBeLessThanOrEqual(2);
      expect(chained(turn.moves), `turn ${t.toString()}`).toBe(true);
      expect(turn.captures, `turn ${t.toString()}`).toBeGreaterThanOrEqual(2);
      mine += turn.captures;
      his += playTurn(game, t, true).captures;
    }
    expect(mine).toBeGreaterThanOrEqual(0.7 * his);
  });
});
