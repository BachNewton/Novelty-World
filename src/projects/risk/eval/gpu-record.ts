import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import type { GameState, Move } from "../contract";
import { riskBot } from "../bots";
import type { Bot, BotInput } from "../bots/bot";
import { unwrap } from "../engine/state";
import { canonicalOptions, canonicalState, decodeMove, encodeMove, hashOf, int32s } from "./gpu-canonical";
import { playGame } from "./runner";

// Game records (`ideas/gpu-engine.md`): a game as its seed, its moves and the canonical hash of
// every state and every set of options along the way, written and read by the reference engine,
// the GPU engine and the native port (`ideas/native-port.md`). Recording one plays a reference
// game; checking one replays it on the reference engine.

export interface GameResult {
  /** The winning seat, −1 when the turn cap ended the game. */
  winner: number;
  turns: number;
  capped: boolean;
  places: number[];
}

export interface GpuGameRecord {
  seed: string;
  players: number;
  maxTurns: number;
  bots?: string[];
  initialHash: string;
  /** `[seat, kind, x, y, z, w]` per decision. */
  moves: number[][];
  /** The state `apply` returned after each move, forced steps included. */
  stateHashes?: string[];
  /** The active seat's options before each move. */
  optionsHashes?: string[];
  result: GameResult;
  /** The moves the bots made, as the runner counts them; the native port reads it. */
  decisions?: number;
  /** Set by the GPU engine on a game whose blitz went past its tables. */
  oversize?: boolean;
  /** A debugging dump: the canonical layouts as int32s, beside the hashes. */
  initialState?: number[];
  states?: number[][];
  options?: number[][];
}

export interface RecordSpec {
  seed: string;
  /** A registry label per seat. */
  bots: readonly string[];
  maxTurns: number;
  dump?: boolean;
}

/** Plays a reference game on the harness's runner, exactly as a measuring run plays it, and keeps
 *  it as a game record. */
export function recordGame({ seed, bots, maxTurns, dump = false }: RecordSpec): GpuGameRecord {
  const states: Buffer[] = [];
  const options: Buffer[] = [];
  const moves: number[][] = [];
  let initial: Buffer | undefined;
  const played = playGame({
    seed,
    bots: bots.map((label) => riskBot(label)),
    maxTurns,
    observe: {
      started: (_events, _board, state) => {
        initial = canonicalState(state);
      },
      decided: (input, move) => {
        moves.push([input.seat, ...encodeMove(move)]);
        options.push(canonicalOptions(input.options));
      },
      applied: (_seat, _move, _events, _board, state) => {
        states.push(canonicalState(state));
      },
    },
  });
  if (initial === undefined) throw new Error("the runner never started a game");
  if (states.length !== moves.length) throw new Error(`${moves.length.toString()} moves but ${states.length.toString()} states`);
  const record: GpuGameRecord = {
    seed,
    players: bots.length,
    maxTurns,
    bots: [...bots],
    initialHash: hashOf(initial),
    moves,
    stateHashes: states.map(hashOf),
    optionsHashes: options.map(hashOf),
    result: { winner: played.winner ?? -1, turns: played.turns, capped: played.winner === null, places: played.places },
    decisions: played.decisions,
  };
  if (dump) {
    record.initialState = int32s(initial);
    record.states = states.map(int32s);
    record.options = options.map(int32s);
  }
  return record;
}

export interface CheckOptions {
  /** Also ask the TypeScript bot each seat names (`bots[seat]`) at every decision, on the exact
   *  input the runner builds, and hold its move to the recorded one: the check of a game another
   *  engine's bots played. */
  bots?: boolean;
}

export interface CheckResult {
  seed: string;
  /** Decisions replayed before the first failure, or all of them. */
  decisions: number;
  /** The first failure, null when the record replays exactly. Decision −1 is the game as a
   *  whole: its start, its length or its result. */
  failure: { decision: number; message: string } | null;
}

/** A failure thrown out of the runner by the replay, returned as the check's result. */
class Divergence extends Error {
  constructor(
    readonly decision: number,
    message: string,
  ) {
    super(message);
  }
}

function describeMove(encoded: readonly number[]): string {
  try {
    return `${JSON.stringify(encoded)} ${JSON.stringify(decodeMove(encoded))}`;
  } catch {
    return JSON.stringify(encoded);
  }
}

function stateReport(state: GameState): string {
  const s = unwrap(state);
  return `turn ${s.turn.toString()}, ${s.phase}, seat ${s.active.toString()} active; reference state ${JSON.stringify(int32s(canonicalState(state)))}`;
}

/** Replays a record on the harness's runner and the reference engine, so every input is the one a
 *  measuring run builds, bot seeds included: the initial hash, then at every decision the seat to
 *  move, the options' hash, the move's legality and the state's hash, then the result. An illegal
 *  move is a failure, never skipped. Hashes a record leaves out aren't compared. */
export function checkRecord(record: GpuGameRecord, { bots = false }: CheckOptions = {}): CheckResult {
  const labels = record.bots ?? [];
  if (bots && labels.length !== record.players) {
    return { seed: record.seed, decisions: 0, failure: { decision: -1, message: `checking its bots needs a bot label per seat, the record has ${JSON.stringify(labels)}` } };
  }
  const asked: Bot[] = bots ? labels.map((label) => riskBot(label)) : [];
  let next = 0;
  const replay: Bot = (input: BotInput): Move => {
    const decision = next++;
    const turn = `turn ${input.view.turn.toString()}, ${input.view.phase}`;
    if (decision >= record.moves.length) throw new Divergence(decision, `the record ends and the game goes on (${turn}, seat ${input.seat.toString()} to move)`);
    const [seat, ...encoded] = record.moves[decision];
    if (seat !== input.seat) throw new Divergence(decision, `seat ${input.seat.toString()} is to move, the record has seat ${String(seat)}`);
    const expectedOptions = record.optionsHashes?.[decision];
    if (expectedOptions !== undefined) {
      const optionsHash = hashOf(canonicalOptions(input.options));
      if (optionsHash !== expectedOptions) {
        throw new Divergence(decision, `options hash ${optionsHash}, the record has ${expectedOptions} (${turn}); reference options ${JSON.stringify(input.options)}`);
      }
    }
    if (bots) {
      const mine = encodeMove(asked[seat](input));
      if (JSON.stringify(mine) !== JSON.stringify(encoded)) {
        throw new Divergence(decision, `bot "${labels[seat]}" at seat ${seat.toString()} plays ${describeMove(mine)}, the record has ${describeMove(encoded)} (${turn})`);
      }
    }
    try {
      return decodeMove(encoded);
    } catch (e) {
      throw new Divergence(decision, `move ${JSON.stringify(encoded)} doesn't decode: ${(e as Error).message}`);
    }
  };

  let played;
  try {
    played = playGame({
      seed: record.seed,
      bots: Array.from({ length: record.players }, () => replay),
      maxTurns: record.maxTurns,
      observe: {
        started: (_events, _board, state) => {
          const initialHash = hashOf(canonicalState(state));
          if (initialHash !== record.initialHash) throw new Divergence(-1, `initial state hash ${initialHash}, the record has ${record.initialHash}; ${stateReport(state)}`);
        },
        applied: (_seat, _move, _events, _board, state) => {
          const decision = next - 1;
          const expectedState = record.stateHashes?.[decision];
          if (expectedState === undefined) return;
          const stateHash = hashOf(canonicalState(state));
          if (stateHash !== expectedState) {
            throw new Divergence(decision, `state hash ${stateHash} after ${describeMove(record.moves[decision].slice(1))}, the record has ${expectedState}; ${stateReport(state)}`);
          }
        },
      },
    });
  } catch (e) {
    // The runner refuses an illegal move by throwing: in a record, that is the recorder's bug.
    const failure = e instanceof Divergence ? e : new Divergence(next - 1, (e as Error).message);
    return { seed: record.seed, decisions: Math.max(0, failure.decision), failure: { decision: failure.decision, message: failure.message } };
  }

  const fail = (message: string): CheckResult => ({ seed: record.seed, decisions: next, failure: { decision: -1, message } });
  if (next !== record.moves.length) return fail(`the game is over after ${next.toString()} moves, and the record has ${record.moves.length.toString()}`);
  const result: GameResult = { winner: played.winner ?? -1, turns: played.turns, capped: played.winner === null, places: played.places };
  if (JSON.stringify(result) !== JSON.stringify(record.result)) {
    return fail(`the result is ${JSON.stringify(result)}, the record has ${JSON.stringify(record.result)}`);
  }
  if (record.decisions !== undefined && record.decisions !== played.decisions) {
    return fail(`${played.decisions.toString()} decisions, the record has ${record.decisions.toString()}`);
  }
  return { seed: record.seed, decisions: record.moves.length, failure: null };
}

/* eslint-disable security/detect-non-literal-fs-filename -- game-record files the tools are pointed at */
export function readRecords(file: string): GpuGameRecord[] {
  const raw = readFileSync(file);
  const text = (file.endsWith(".gz") ? gunzipSync(raw) : raw).toString("utf8");
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as GpuGameRecord);
}

/** Writes one record a line, gzipped when the name ends in `.gz`; returns the bytes written. */
export function writeRecords(file: string, records: readonly GpuGameRecord[]): number {
  const text = Buffer.from(records.map((r) => `${JSON.stringify(r)}\n`).join(""), "utf8");
  const out = file.endsWith(".gz") ? gzipSync(text, { level: 9 }) : text;
  writeFileSync(file, out);
  return out.length;
}
/* eslint-enable security/detect-non-literal-fs-filename -- the record files' reads and writes are all above */

