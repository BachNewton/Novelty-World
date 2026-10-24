import type { GameState, Move } from "../../contract";
import { riskBot } from "../../bots";
import type { Bot, BotInput } from "../../bots/bot";
import { unwrap } from "../../engine/state";
import { playGame } from "../runner";
import { fieldsOf, optionsHash, stateBytes, stateHash } from "./canonical";
import { decodeMove, encodeMove, type RecordedGame, type RecordedResult } from "./record";

// A game record replayed on the reference engine, the oracle: the initial state's hash, then at
// every decision the seat to move, its options' hash, the move's legality and the state's hash
// after it, then the result. With `bots`, the TypeScript bot each seat names is also asked every
// decision, on the exact input the runner builds, and its move must be the recorded one: the
// check of a game the Rust port played (`ideas/native-port.md`, "Proving it", layer 3). The
// replay drives the harness's own runner, so the input is a measuring run's, bot seeds included.

export interface CheckOptions {
  /** Ask each seat's TypeScript bot at every decision and compare its move. */
  bots: boolean;
}

export interface CheckTally {
  moves: number;
  /** Decisions the TypeScript bot was asked, 0 without `bots`. */
  compared: number;
}

/** The first place a record and the reference engine part ways. */
export class Divergence extends Error {
  constructor(
    readonly record: RecordedGame,
    /** −1 before the first move or after the last. */
    readonly decision: number,
    what: string,
  ) {
    super(what);
  }
}

function describeMove(fields: readonly number[]): string {
  try {
    return `${JSON.stringify(fields)} ${JSON.stringify(decodeMove(fields))}`;
  } catch {
    return JSON.stringify(fields);
  }
}

function stateReport(state: GameState): string {
  const s = unwrap(state);
  return `turn ${s.turn.toString()}, ${s.phase}, seat ${s.active.toString()} active; reference state fields ${JSON.stringify(fieldsOf(stateBytes(state)))}`;
}

export function checkRecord(record: RecordedGame, { bots }: CheckOptions): CheckTally {
  const diverged = (decision: number, what: string) => new Divergence(record, decision, what);
  if (record.bots.length !== record.players) throw diverged(-1, `${record.players.toString()} players but ${record.bots.length.toString()} bot labels`);
  if (record.stateHashes.length !== record.moves.length || record.optionsHashes.length !== record.moves.length) {
    throw diverged(-1, `${record.moves.length.toString()} moves, ${record.stateHashes.length.toString()} state hashes, ${record.optionsHashes.length.toString()} options hashes`);
  }
  const asked: Bot[] = bots ? record.bots.map((label) => riskBot(label)) : [];
  let next = 0;
  let compared = 0;
  const replay: Bot = (input: BotInput): Move => {
    const decision = next++;
    if (decision >= record.moves.length) throw diverged(decision, `the record ends and the game goes on (turn ${input.view.turn.toString()}, ${input.view.phase}, seat ${input.seat.toString()} to move)`);
    const [seat, ...fields] = record.moves[decision];
    if (input.seat !== seat) throw diverged(decision, `seat ${input.seat.toString()} is to move, the record has seat ${seat.toString()}`);
    const hash = optionsHash(input.options);
    if (hash !== record.optionsHashes[decision]) {
      throw diverged(decision, `options hash ${hash}, the record has ${record.optionsHashes[decision]} (turn ${input.view.turn.toString()}, ${input.view.phase}); reference options ${JSON.stringify(input.options)}`);
    }
    if (bots) {
      const mine = encodeMove(asked[seat](input));
      compared++;
      if (JSON.stringify(mine) !== JSON.stringify(fields)) {
        throw diverged(
          decision,
          `bot "${record.bots[seat]}" at seat ${seat.toString()} plays ${describeMove(mine)}, the record has ${describeMove(fields)} (turn ${input.view.turn.toString()}, ${input.view.phase})`,
        );
      }
    }
    try {
      return decodeMove(fields);
    } catch (e) {
      throw diverged(decision, `the move ${JSON.stringify(fields)} doesn't decode: ${(e as Error).message}`);
    }
  };

  let game;
  try {
    game = playGame({
      seed: record.seed,
      bots: Array.from({ length: record.players }, () => replay),
      maxTurns: record.maxTurns,
      observe: {
        started: (_events, _board, state) => {
          const hash = stateHash(state);
          if (hash !== record.initialHash) throw diverged(-1, `initial state hash ${hash}, the record has ${record.initialHash}; ${stateReport(state)}`);
        },
        applied: (_seat, _move, _events, _board, state) => {
          const decision = next - 1;
          const hash = stateHash(state);
          if (hash !== record.stateHashes[decision]) {
            throw diverged(decision, `state hash ${hash} after ${describeMove(record.moves[decision].slice(1))}, the record has ${record.stateHashes[decision]}; ${stateReport(state)}`);
          }
        },
      },
    });
  } catch (e) {
    if (e instanceof Divergence) throw e;
    // The runner refuses an illegal move by throwing: in a record, that is the port's bug.
    throw diverged(next - 1, (e as Error).message);
  }

  if (next !== record.moves.length) throw diverged(-1, `the game ended after ${next.toString()} moves, the record has ${record.moves.length.toString()}`);
  const result: RecordedResult = { winner: game.winner ?? -1, turns: game.turns, capped: game.winner === null, places: game.places };
  const r = record.result;
  const sameResult = r.winner === result.winner && r.turns === result.turns && r.capped === result.capped && JSON.stringify(r.places) === JSON.stringify(result.places);
  if (!sameResult) {
    throw diverged(-1, `the result is ${JSON.stringify(result)}, the record has ${JSON.stringify(record.result)}`);
  }
  if (game.decisions !== record.decisions) throw diverged(-1, `${game.decisions.toString()} decisions, the record has ${record.decisions.toString()}`);
  return { moves: record.moves.length, compared };
}
