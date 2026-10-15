import { createRng } from "@/shared/lib/seeded-random";
import type { GameEvent, RiskEngine, Seat } from "../contract";
import { referenceEngine } from "../engine";
import type { Bot } from "../bots/bot";
import { riskBot } from "../bots";

// The game runner the measuring harness plays: one seeded game, a bot per seat,
// on the engine contract. It is the only code that holds the game state; each bot
// is given only what its seat may see (its view, its options, the latest write's
// events redacted for it) and a seed of its own, the same input the online bot
// seat gets. A game is a pure function of its seed and its seating, so it can run
// on any worker and give the same result.

export interface GameRecord {
  /** The winning seat, or null when the turn cap ended the game: a draw. */
  winner: Seat | null;
  /** Each seat's finishing place, 1 for the winner. A seat eliminated while k seats
   *  were in the game finishes k-th; the survivors of a capped game share 1st. */
  places: number[];
  /** Player-turns played (the engine's turn count). */
  turns: number;
  /** Moves the bots made. */
  decisions: number;
}

export interface PlayOptions {
  seed: string;
  /** One bot per seat, 3 to 6. */
  bots: readonly Bot[];
  /** Past this many player-turns the game is stopped and counted a draw. */
  maxTurns: number;
  engine?: RiskEngine;
}

/** Plays one game to its end or the turn cap. A bot's illegal move throws: it is a
 *  bug in the bot, never a move to be quietly replaced. */
export function playGame({ seed, bots, maxTurns, engine = referenceEngine }: PlayOptions): GameRecord {
  const players = bots.length;
  const started = engine.newGame({ players }, seed);
  let state = started.state;
  let latest: readonly GameEvent[] = started.events;
  // The bots' own random stream: derived from the game's seed through a hash, so
  // it is fixed per game but nothing about the game's dice or deck can be read
  // from it.
  const botSeed = createRng(`bots|${seed}`).getState().toString(36);
  const places: number[] = Array.from({ length: players }, () => 1);
  let inGame = players;

  // Any seat's view says whose move it is, and a seat usually makes several moves
  // in a row, so the last mover's view is read first and only rebuilt for a new
  // mover: a view costs as much as a move in the reference engine.
  let viewer: Seat | null = null;
  for (let decision = 0; ; decision++) {
    let view = engine.view(state, viewer);
    if (view.phase === "game-over") {
      return { winner: view.winner, places, turns: view.turn, decisions: decision };
    }
    if (view.turn > maxTurns) {
      return { winner: null, places, turns: maxTurns, decisions: decision };
    }
    const seat = view.active;
    if (seat !== viewer) {
      viewer = seat;
      view = engine.view(state, seat);
    }
    const options = engine.options(state, seat);
    if (!options) throw new Error(`seat ${seat} is to move but has no options (${view.phase})`);
    const move = bots[seat]({
      seat,
      view,
      options,
      events: engine.redact(latest, seat),
      seed: `${botSeed}/${decision}`,
    });
    const result = engine.apply(state, seat, move);
    if (!result.ok) {
      throw new Error(`seat ${seat}'s bot made an illegal move (${result.reason}): ${JSON.stringify(move)}`);
    }
    for (const event of result.events) {
      if (event.kind === "eliminated") places[event.seat] = inGame--;
    }
    state = result.state;
    latest = result.events;
  }
}

// ---------------------------------------------------------------------------
// Games as the pool plays them: a spec names the bots by label, and the result
// is compact enough to post back from a worker.
// ---------------------------------------------------------------------------

export interface RiskGameSpec {
  /** Global position in the stream, so results map back whichever worker ran it. */
  index: number;
  seed: string;
  /** The bot label at each seat. */
  labels: readonly string[];
  maxTurns: number;
}

export interface RiskGameResult extends GameRecord {
  index: number;
  seed: string;
  labels: readonly string[];
  /** Set only when the game threw (a bot's illegal move, an engine error): the
   *  game is excluded from every tally and surfaced as a red flag. */
  error?: string;
}

/** Plays a spec, its labels resolved to bots by `resolve` (the registry, unless a
 *  test brings bots of its own). */
export function runSpec(spec: RiskGameSpec, resolve: (label: string) => Bot = riskBot): RiskGameResult {
  const base = { index: spec.index, seed: spec.seed, labels: spec.labels };
  try {
    return { ...base, ...playGame({ seed: spec.seed, bots: spec.labels.map((l) => resolve(l)), maxTurns: spec.maxTurns }) };
  } catch (e) {
    // One broken game must not take the batch with it: it comes back as an error,
    // which every report counts and prints.
    return { ...base, winner: null, places: [], turns: 0, decisions: 0, error: (e as Error).message };
  }
}
