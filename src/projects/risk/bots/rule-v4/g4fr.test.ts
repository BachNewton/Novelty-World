import { describe, expect, it } from "vitest";
import { createRng } from "@/shared/lib/seeded-random";
import type { GameEvent, GameState, Move, Seat } from "../../contract";
import { ENGINE } from "../../play-engine";
import type { BotInput } from "../bot";
import { CONTINENT_MEMBERS, CONTINENT_OF, fromView, idx, type Board } from "../rule-v1/board";
import { ruleV3Bot } from "../rule-v3";
import { sweepLoss as v3SweepLoss } from "../rule-v3/evaluate";
import { V3_PARAMS } from "../rule-v3/params";
import { plans as v3Plans } from "../rule-v3/planner";
import { killChance as v3KillChance } from "../rule-v3/routes";
import { readRecord } from "./beliefs";
import { killChance } from "./kills";
import { sweepAgainst, sweepLoss } from "./opponents";
import { V4_PARAMS, type Params } from "./params";
import { plans } from "./planner";
import { expectedIncome } from "./worth";
import record from "./g4fr.json";

// G4FR, a 5-player game a person (seat 0) won against another person (seat 1),
// rule-v3 (seat 2), gd-stacker (seat 3) and gd-continental (seat 4). The record is the game's
// seed and its move log, replayed on the engine real games play on. v3 lost it in turns 89 to
// 91: it spread from 10 territories to 17, its biggest stack on 4, and one stack of the
// winner's took 13 of them in a turn. These are the positions where v3's beliefs and plans
// went wrong, read by v4.

interface GameRecord {
  seed: string;
  players: number;
  humans: boolean[];
  seats: string[];
  moves: [Seat, Move][];
}

// The JSON import types each move by its literal shape, not as a Move.
const G4FR = record as unknown as GameRecord;
const WINNER = 0;
const STACKER = 3;
const V3 = 2;

/** The game just before decision `at`, as the seat to answer it sees it. */
function at(decision: number): { input: BotInput; board: Board; recorded: Move } {
  const started = ENGINE.newGame({ players: G4FR.players }, G4FR.seed);
  let state: GameState = started.state;
  const events: GameEvent[] = [...started.events];
  for (const [seat, move] of G4FR.moves.slice(0, decision)) {
    const result = ENGINE.apply(state, seat, move);
    if (!result.ok) throw new Error(`G4FR doesn't replay: ${result.reason}`);
    state = result.state;
    events.push(...result.events);
  }
  const [seat, recorded] = G4FR.moves[decision];
  const options = ENGINE.options(state, seat);
  if (!options) throw new Error(`seat ${seat.toString()} has no decision at ${decision.toString()}`);
  const view = ENGINE.view(state, seat);
  const input: BotInput = { seat, view, options, events: [], history: ENGINE.redact(events, seat), humans: G4FR.humans, seed: "g4fr" };
  return { input, board: fromView(view), recorded };
}

/** v4's settings for v3's seat, with the game's record as the bot reads it. A 5-player table
 *  plays the large table's preferences. */
const v4Params = (input: BotInput): Params => ({ ...V4_PARAMS, record: readRecord(input.history, G4FR.players, V4_PARAMS.opponents.beliefs.historyDecay, input.seat) });

/** JSON with every object's keys in order, so two moves compare by content. */
const sorted = (value: unknown) =>
  JSON.stringify(value, (_, v: unknown) =>
    v !== null && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : v,
  );

describe("G4FR, read by v4", () => {
  it("is the game v3 played: v3 makes each of its recorded moves of turn 89", () => {
    for (let decision = 864; decision <= 878; decision++) {
      const { input, recorded } = at(decision);
      expect(input.seat).toBe(V3);
      expect(sorted(ruleV3Bot(input)), `decision ${decision.toString()}`).toBe(sorted(recorded));
    }
  });

  it("turn 26: a kill on gd-stacker stays in sight once its first territories fall", () => {
    // v3 has taken Alaska and Greenland; gd-stacker holds Eastern United States and Iceland on
    // one army each, beside v3's Quebec on 2 and Greenland on 3. v3 saw no chance and turned away.
    const { input, board } = at(216);
    expect(v3KillChance(board, V3, STACKER, 0)).toBe(0);
    const chance = killChance(board, V3, STACKER, 0);
    expect(chance).toBeGreaterThan(0.3);
    const kill = plans(board, V3, 0, v4Params(input), createRng("g4fr")).find((p) => p.kind === "kill");
    expect(kill?.targets.sort()).toEqual([idx("eastern-united-states"), idx("iceland")].sort());
  });

  it("turn 89: a plan with no chance doesn't rank first on damage it never does", () => {
    // v3 ranked taking the rest of Europe first, at no chance, for the defenders its failure
    // board halved where the run had no armies left.
    const { input, board } = at(873);
    const europe = (p: { kind: string; targets: readonly number[] }) => p.kind === "continent" && p.targets.includes(idx("ukraine"));
    const v3Best = v3Plans(board, V3, 0, V3_PARAMS, createRng("g4fr")).reduce((x, y) => (y.value > x.value ? y : x));
    expect(europe(v3Best)).toBe(true);
    expect(v3Best.capture?.pSuccess).toBeLessThan(0.001);

    const weighed = plans(board, V3, 0, v4Params(input), createRng("g4fr"));
    const best = weighed.reduce((x, y) => (y.value > x.value ? y : x));
    expect(best.capture?.pSuccess ?? 1).toBeGreaterThan(0.5);
    const hold = Math.max(...weighed.filter((p) => p.kind === "hold").map((p) => p.value));
    for (const p of weighed.filter(europe)) expect(p.value).toBeLessThan(hold);
  });

  it("turn 89's end: the winner's sweep is believed to take most of v3's 17 territories, not 8", () => {
    // The next turn but one, the winner put 15 armies on Ukraine and took 13 of them.
    const { board } = at(878);
    expect(board.owner.filter((o) => o === V3).length).toBe(17);
    const income = Math.round(expectedIncome(board, V3)[WINNER]);
    const sweep = sweepAgainst(board, V3, WINNER, income);
    const taken = board.owner.filter((o, t) => o === V3 && sweep.owner[t] === WINNER).length;
    expect(taken).toBeGreaterThanOrEqual(12);
    // North America, all of it v3's, falls with them.
    expect(CONTINENT_MEMBERS[CONTINENT_OF[idx("alaska")]].some((t) => sweep.owner[t] === WINNER)).toBe(true);
    const H = V4_PARAMS.prefs.incomeHorizon;
    expect(sweepLoss(board, V3, WINNER, income, H, 1)).toBeGreaterThan(v3SweepLoss(board, V3, WINNER, income, H, 1));
  });
});
