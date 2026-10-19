import { describe, expect, it } from "vitest";
import type { GameEvent, GameState, Move, Seat } from "../../contract";
import type { TerritoryId } from "../../map";
import { ENGINE } from "../../play-engine";
import type { BotInput } from "../bot";
import { fromView, idx, type Board } from "../rule-v1/board";
import { readRecord } from "../rule-v4/beliefs";
import { killChance as v4KillChance } from "../rule-v4/kills";
import { sweepAgainst } from "../rule-v4/opponents";
import { expectedIncome } from "../rule-v4/worth";
import { ruleV4Bot } from "../rule-v4";
import { ruleV5Bot } from "../rule-v5";
import { ruleBot, tableParams } from ".";
import { killChance } from "./kills";
import { sweepOf } from "./opponents";
import { NO_FIXES, V6_PARAMS, type FixName, type Params } from "./params";
import { plans } from "./planner";
import record from "./9vfl.json";

// 9VFL, a 5-player game a person (seat 0, "Bot Killer") won against another person (seat 1),
// rule-v5 (seat 2), rule-v4 (seat 3) and rule-v3 (seat 4), with the playbook that won G4FR. The
// record is the game's seed and its 821 moves, replayed on the engine real games play on. These
// are the positions where v4's and v5's plans and beliefs went wrong, each read by v5 with the
// one fix of v6's meant for it switched on (`ideas/rule-bot-v6.md`).

interface GameRecord {
  seed: string;
  players: number;
  humans: boolean[];
  moves: [Seat, Move][];
}

// The JSON import types each move by its literal shape, not as a Move.
const GAME = record as unknown as GameRecord;
const KYLE = 1;
const V5 = 2;
const V4 = 3;

/** The game just before decision `at`, as the seat to answer it sees it. */
function at(decision: number): { input: BotInput; board: Board; recorded: Move } {
  const started = ENGINE.newGame({ players: GAME.players }, GAME.seed);
  let state: GameState = started.state;
  const events: GameEvent[] = [...started.events];
  for (const [seat, move] of GAME.moves.slice(0, decision)) {
    const result = ENGINE.apply(state, seat, move);
    if (!result.ok) throw new Error(`9VFL doesn't replay: ${result.reason}`);
    state = result.state;
    events.push(...result.events);
  }
  const [seat, recorded] = GAME.moves[decision];
  const options = ENGINE.options(state, seat);
  if (!options) throw new Error(`seat ${seat.toString()} has no decision at ${decision.toString()}`);
  const view = ENGINE.view(state, seat);
  const input: BotInput = { seat, view, options, events: [], history: ENGINE.redact(events, seat), humans: GAME.humans, seed: "9vfl" };
  return { input, board: fromView(view), recorded };
}

/** v5's settings with only `fix` switched on: v6 with every other fix off. */
const only = (fix: FixName | null): Params => ({ ...V6_PARAMS, fixes: fix === null ? NO_FIXES : { ...NO_FIXES, [fix]: 1 } });

/** The settings the bot plays a decision on, the game's record read as the bot reads it. */
function playing(table: Params, input: BotInput): Params {
  const alive = input.view.seats.filter((s) => !s.eliminated).length;
  return { ...tableParams(table, GAME.players, alive), record: readRecord(input.history, GAME.players, table.opponents.beliefs.historyDecay, input.seat) };
}

/** The best-valued plan of `kind`, among the targets given, and the best hold. */
function valued(input: BotInput, board: Board, table: Params, kind: string, target: TerritoryId): { plan: number; hold: number } {
  const all = plans(board, input.seat, 0, playing(table, input));
  const plan = Math.max(...all.filter((p) => p.kind === kind && p.targets.includes(idx(target))).map((p) => p.value));
  const hold = Math.max(...all.filter((p) => p.kind === "hold").map((p) => p.value));
  return { plan, hold };
}

const sorted = (value: unknown) =>
  JSON.stringify(value, (_, v: unknown) =>
    v !== null && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : v,
  );

describe("9VFL, read by v6", () => {
  it("is the game the bots played: v4 makes each of its recorded moves of turn 57, and v5 of turn 68", () => {
    for (let decision = 425; decision <= 434; decision++) {
      const { input, recorded } = at(decision);
      expect(input.seat).toBe(V4);
      expect(sorted(ruleV4Bot(input)), `decision ${decision.toString()}`).toBe(sorted(recorded));
    }
    for (const decision of [535, 536]) {
      const { input, recorded } = at(decision);
      expect(input.seat).toBe(V5);
      expect(sorted(ruleV5Bot(input)), `decision ${decision.toString()}`).toBe(sorted(recorded));
    }
  });

  it("fork, turn 57: a kill whose victim splits at the stack stays a kill", () => {
    // v4 took Venezuela from Brazil and moved 42 in. Kyle's land split into Peru and Argentina,
    // and North America with Iceland and Kamchatka, both reached only from Venezuela. Costed
    // North America first, the stack was spent before Peru: no chance, and v4 held.
    const { input, board, recorded } = at(433);
    expect(recorded).toEqual({ kind: "end-attack" });
    expect(board.armies[idx("venezuela")]).toBe(42);
    expect(v4KillChance(board, V4, KYLE, 0)).toBe(0);
    const chance = killChance(board, V4, KYLE, 0, true);
    expect(chance).toBeGreaterThan(0.9);
    expect(chance).toBeLessThan(1);
    // The stack drops its detachment for the cheap branch first, and goes on with the rest.
    expect(ruleBot(only("fork"))(input)).toMatchObject({ kind: "blitz", from: "venezuela", to: "peru" });
    expect(ruleBot(only(null))(input)).not.toMatchObject({ to: "peru" });
  });

  it("movein, turns 72 and 78: a sure card no longer costs half the stack", () => {
    // v4 on one territory, Venezuela, beside 1-army Brazil, turned the card down six times: its
    // single capture was scored with the stack split evenly between the two.
    const turn72 = at(580);
    const before = valued(turn72.input, turn72.board, only(null), "capture", "brazil");
    expect(before.plan).toBeLessThan(before.hold);
    const after = valued(turn72.input, turn72.board, only("movein"), "capture", "brazil");
    expect(after.plan).toBeGreaterThan(after.hold);

    const turn78 = at(619);
    expect(turn78.recorded).toEqual({ kind: "end-attack" });
    expect(ruleBot(only(null))(turn78.input)).toEqual({ kind: "end-attack" });
    const move = ruleBot(only("movein"))(turn78.input);
    expect(move).toMatchObject({ kind: "blitz", from: "venezuela", to: "brazil" });
  });

  it("homeward and reinforced, turn 68: v5's last stack goes into play instead of waiting", () => {
    // v5 on Egypt alone with 28 armies held, waiting on a 37% kill of v4 for next turn, against a
    // 9-capture sweep that ends on Japan, and was eliminated two turns later.
    const { input, board, recorded } = at(536);
    expect(recorded).toEqual({ kind: "end-attack" });
    expect(board.owner.filter((o) => o === V5).length).toBe(1);
    expect(ruleBot(only(null))(input)).toEqual({ kind: "end-attack" });
    // The sweep's stack ends behind the lines, and the fortify still to come can take it back.
    expect(ruleBot(only("homeward"))(input)).toMatchObject({ kind: "blitz", from: "egypt", to: "southern-europe" });
    // v4 will place its income before that kill: waiting on it is worth less than a capture now.
    expect(ruleBot(only("reinforced"))(input)).toMatchObject({ kind: "blitz", from: "egypt" });
  });

  it("thirdParty, turn 57's end: a person's sweep reaches v4 through v5's Europe", () => {
    // Two turns later Kyle went from Iceland through Great Britain, Western Europe and into v4's
    // Africa, and took 5 of its territories. v4 believed his sweep would take none: no territory
    // of his touched one of v4's.
    const { board } = at(434);
    const income = Math.round(expectedIncome(board, V4)[KYLE]);
    const mine = (owner: Int8Array) => board.owner.filter((o, t) => o === V4 && owner[t] !== V4).length;
    expect(mine(sweepAgainst(board, V4, KYLE, income).owner)).toBe(0);
    expect(mine(sweepOf(board, V4, KYLE, income, true).owner)).toBeGreaterThanOrEqual(5);
  });

  it("alive, turn 72: three left at a 5-player table play the small table's preferences", () => {
    const { input } = at(580);
    expect(input.view.seats.filter((s) => !s.eliminated).length).toBe(3);
    expect(playing(only(null), input).prefs).toBe(V6_PARAMS.prefs);
    expect(playing(only("alive"), input).prefs).toBe(V6_PARAMS.smallTable.prefs);
  });
});
