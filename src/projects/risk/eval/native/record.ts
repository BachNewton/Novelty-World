import { createReadStream, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip, gzipSync } from "node:zlib";
import type { Move } from "../../contract";
import { riskBot } from "../../bots";
import { playGame } from "../runner";
import { cardAt, cardIndex, optionsHash, stateHash, territoryAt, territoryIndex } from "./canonical";

// Game records: a game kept as its seed, its seating, its moves and the canonical hash of the
// active seat's options before every move and of the state after it, one JSON object a line
// (`.jsonl`, gzipped when the name ends in `.gz`). The TypeScript records them and the Rust port
// replays them, and the reverse (`ideas/native-port.md`, "Proving it"); the format is the GPU
// engine's (`ideas/gpu-engine.md`, "Game records"), so the two efforts' fixtures interchange.

export interface RecordedResult {
  /** The winning seat, −1 when the turn cap ended the game. */
  winner: number;
  turns: number;
  capped: boolean;
  /** Each seat's finishing place, as the runner counts them. */
  places: number[];
}

/** A move as `[seat, kind, x, y, z, w]`. */
export type RecordedMove = [seat: number, ...fields: MoveFields];

export interface RecordedGame {
  seed: string;
  players: number;
  maxTurns: number;
  /** The bot label at each seat, as the registry seats them. */
  bots: string[];
  initialHash: string;
  moves: RecordedMove[];
  /** The state after each move, its forced steps included. */
  stateHashes: string[];
  /** The active seat's options before each move. */
  optionsHashes: string[];
  result: RecordedResult;
  decisions: number;
}

/** A move's kind and its four fields, unused fields 0. */
export type MoveFields = [kind: number, x: number, y: number, z: number, w: number];

export function encodeMove(move: Move): MoveFields {
  switch (move.kind) {
    case "place":
      return [0, territoryIndex(move.territory), move.armies, 0, 0];
    case "trade": {
      const [c1, c2, c3] = move.cards;
      const bonus = move.bonusTerritory === undefined ? -1 : territoryIndex(move.bonusTerritory);
      return [1, cardIndex(c1), cardIndex(c2), cardIndex(c3), bonus];
    }
    case "attack":
      return [2, territoryIndex(move.from), territoryIndex(move.to), move.dice, 0];
    case "blitz":
      return [3, territoryIndex(move.from), territoryIndex(move.to), move.keepAtLeast, 0];
    case "occupy":
      return [4, move.armies, 0, 0, 0];
    case "end-attack":
      return [5, 0, 0, 0, 0];
    case "fortify":
      return [6, territoryIndex(move.from), territoryIndex(move.to), move.armies, 0];
    case "end-turn":
      return [7, 0, 0, 0, 0];
  }
}

export function decodeMove(fields: readonly number[]): Move {
  if (fields.length !== 5) throw new Error(`a move is 5 fields, not ${fields.length.toString()}: ${JSON.stringify(fields)}`);
  const [kind, x, y, z, w] = fields;
  switch (kind) {
    case 0:
      return { kind: "place", territory: territoryAt(x), armies: y };
    case 1: {
      const cards = [cardAt(x), cardAt(y), cardAt(z)] as const;
      return w === -1 ? { kind: "trade", cards } : { kind: "trade", cards, bonusTerritory: territoryAt(w) };
    }
    case 2:
      if (z !== 1 && z !== 2 && z !== 3) throw new Error(`an attack rolls 1 to 3 dice, not ${String(z)}`);
      return { kind: "attack", from: territoryAt(x), to: territoryAt(y), dice: z };
    case 3:
      return { kind: "blitz", from: territoryAt(x), to: territoryAt(y), keepAtLeast: z };
    case 4:
      return { kind: "occupy", armies: x };
    case 5:
      return { kind: "end-attack" };
    case 6:
      return { kind: "fortify", from: territoryAt(x), to: territoryAt(y), armies: z };
    case 7:
      return { kind: "end-turn" };
    default:
      throw new Error(`no move kind ${String(kind)}`);
  }
}

export interface GameSpec {
  seed: string;
  /** A registry label per seat. */
  bots: readonly string[];
  maxTurns: number;
}

/** Plays a game on the harness's runner, exactly as a measuring run plays it, and keeps it as a
 *  record. */
export function recordGame({ seed, bots, maxTurns }: GameSpec): RecordedGame {
  const initialHashes: string[] = [];
  const moves: RecordedMove[] = [];
  const stateHashes: string[] = [];
  const optionsHashes: string[] = [];
  const game = playGame({
    seed,
    bots: bots.map((label) => riskBot(label)),
    maxTurns,
    observe: {
      started: (_events, _board, state) => {
        initialHashes.push(stateHash(state));
      },
      decided: (input, move) => {
        optionsHashes.push(optionsHash(input.options));
        moves.push([input.seat, ...encodeMove(move)]);
      },
      applied: (_seat, _move, _events, _board, state) => {
        stateHashes.push(stateHash(state));
      },
    },
  });
  if (initialHashes.length !== 1) throw new Error(`the runner started ${initialHashes.length.toString()} games, not one`);
  return {
    seed,
    players: bots.length,
    maxTurns,
    bots: [...bots],
    initialHash: initialHashes[0],
    moves,
    stateHashes,
    optionsHashes,
    result: { winner: game.winner ?? -1, turns: game.turns, capped: game.winner === null, places: game.places },
    decisions: game.decisions,
  };
}

/* eslint-disable security/detect-non-literal-fs-filename -- the record files a tool is pointed at */

/** Writes the records one a line, gzipped when the name ends in `.gz`; returns the bytes written. */
export function writeRecords(file: string, records: Iterable<RecordedGame>): number {
  const lines: string[] = [];
  for (const record of records) lines.push(`${JSON.stringify(record)}\n`);
  const text = Buffer.from(lines.join(""), "utf8");
  const bytes = file.endsWith(".gz") ? gzipSync(text, { level: 9 }) : text;
  writeFileSync(file, bytes);
  return bytes.length;
}

/** The records in a file, read a line at a time, so a file of any size streams. */
export async function* readRecords(file: string): AsyncGenerator<RecordedGame> {
  const raw = createReadStream(file);
  const lines = createInterface({ input: file.endsWith(".gz") ? raw.pipe(createGunzip()) : raw, crlfDelay: Infinity });
  for await (const line of lines) {
    if (line.trim().length > 0) yield JSON.parse(line) as RecordedGame;
  }
}

/* eslint-enable security/detect-non-literal-fs-filename -- the record files' reads and writes are all above */
