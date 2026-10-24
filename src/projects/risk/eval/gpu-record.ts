import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import type { GameState, RiskEngine } from "../contract";
import { riskBot } from "../bots";
import { referenceEngine } from "../engine";
import { unwrap } from "../engine/state";
import { canonicalOptions, canonicalState, decodeMove, encodeMove, hashOf, int32s } from "./gpu-canonical";
import { playGame } from "./runner";

// Game records (`ideas/gpu-engine.md`): a game as its seed, its moves and the canonical hash of
// every state and every set of options along the way, written and read by both engines. Recording
// one plays a reference game; checking one replays it on the reference engine.

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

/** Plays a reference game on the harness's runner and keeps it as a game record. The engine is
 *  wrapped so every state it hands back is hashed as it leaves `newGame` and `apply`. */
export function recordGame({ seed, bots, maxTurns, dump = false }: RecordSpec): GpuGameRecord {
  const states: Buffer[] = [];
  const options: Buffer[] = [];
  const moves: number[][] = [];
  const started: { initial?: Buffer } = {};
  const engine: RiskEngine = {
    ...referenceEngine,
    newGame: (config, gameSeed) => {
      const game = referenceEngine.newGame(config, gameSeed);
      started.initial = canonicalState(game.state);
      return game;
    },
    apply: (state, seat, move) => {
      const result = referenceEngine.apply(state, seat, move);
      if (result.ok) states.push(canonicalState(result.state));
      return result;
    },
  };
  const played = playGame({
    seed,
    bots: bots.map((label) => riskBot(label)),
    maxTurns,
    engine,
    observe: {
      decided: (input, move) => {
        moves.push([input.seat, ...encodeMove(move)]);
        options.push(canonicalOptions(input.options));
      },
    },
  });
  const initial = started.initial;
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
  };
  if (dump) {
    record.initialState = int32s(initial);
    record.states = states.map(int32s);
    record.options = options.map(int32s);
  }
  return record;
}

export interface CheckResult {
  seed: string;
  /** Decisions replayed before the first failure, or all of them. */
  decisions: number;
  /** The first failure, null when the record replays exactly. */
  failure: { decision: number; message: string } | null;
}

/** Replays a record on the reference engine: the initial hash, then at every decision the seat to
 *  move, the options' hash, the move's legality and the state's hash, then the result. An illegal
 *  move is a failure, never skipped. Hashes a record leaves out aren't compared. */
export function checkRecord(record: GpuGameRecord, engine: RiskEngine = referenceEngine): CheckResult {
  let decision = -1;
  const fail = (message: string): CheckResult => ({ seed: record.seed, decisions: Math.max(0, decision), failure: { decision, message } });
  const started = engine.newGame({ players: record.players }, record.seed);
  const initialHash = hashOf(canonicalState(started.state));
  if (initialHash !== record.initialHash) return fail(`initial state hash ${initialHash}, the record has ${record.initialHash}`);

  let state: GameState = started.state;
  const places: number[] = Array.from({ length: record.players }, () => 1);
  let inGame = record.players;
  for (decision = 0; decision < record.moves.length; decision++) {
    const s = unwrap(state);
    if (s.phase === "game-over" || s.turn > record.maxTurns) return fail(`the game is over (${s.phase}, turn ${s.turn.toString()}), and the record has more moves`);
    const [seat, ...encoded] = record.moves[decision];
    if (seat !== s.active) return fail(`seat ${s.active.toString()} is to move, the record has seat ${String(seat)}`);
    const options = engine.options(state, seat);
    if (!options) return fail(`seat ${seat.toString()} has no options`);
    const expectedOptions = record.optionsHashes?.[decision];
    if (expectedOptions !== undefined) {
      const optionsHash = hashOf(canonicalOptions(options));
      if (optionsHash !== expectedOptions) return fail(`options hash ${optionsHash}, the record has ${expectedOptions}`);
    }
    let move;
    try {
      move = decodeMove(encoded);
    } catch (e) {
      return fail(`move ${JSON.stringify(encoded)} doesn't decode: ${(e as Error).message}`);
    }
    const result = engine.apply(state, seat, move);
    if (!result.ok) return fail(`illegal move ${JSON.stringify(encoded)} ${JSON.stringify(move)}: ${result.reason}`);
    for (const event of result.events) {
      if (event.kind === "eliminated") places[event.seat] = inGame--;
    }
    state = result.state;
    const expectedState = record.stateHashes?.[decision];
    if (expectedState !== undefined) {
      const stateHash = hashOf(canonicalState(state));
      if (stateHash !== expectedState) return fail(`state hash ${stateHash} after ${JSON.stringify(encoded)}, the record has ${expectedState}`);
    }
  }

  const s = unwrap(state);
  let result: GameResult;
  if (s.phase === "game-over") {
    result = { winner: s.winner ?? -1, turns: s.turn, capped: false, places };
  } else if (s.turn > record.maxTurns) {
    result = { winner: -1, turns: record.maxTurns, capped: true, places };
  } else {
    return fail(`the record ends and the game goes on (turn ${s.turn.toString()}, seat ${s.active.toString()} to move)`);
  }
  if (JSON.stringify(result) !== JSON.stringify(record.result)) {
    return fail(`the result is ${JSON.stringify(result)}, the record has ${JSON.stringify(record.result)}`);
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

