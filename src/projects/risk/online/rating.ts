import type { GameView, Seat } from "../contract";
import { eloOf } from "./seat-bots";
import type { Controller } from "./table";

/*
 * A person's Elo, on the bots' scale (greedy = 1000), kept on their own device. It is the same
 * win Elo the bots' ladder is: a seat wins a table with probability γ / Σγ (the Luce model the
 * gauntlet's SPRT and the ladder's Bradley–Terry fit share), γ = 10^(Elo / 400), and only the
 * win is scored. So a finished game moves the rating by K × (won − expected).
 */

export const START_ELO = 1000;

/**
 * The step size. At a table the scored outcome is a coin with p = the expected win, so a rating
 * that keeps updating settles with a spread of about √(K × 400 / (2 ln 10)) around the player's
 * true strength whatever the table size, and closes a gap at a rate of K × p(1 − p) × ln 10 / 400
 * a game. 32 gives a spread of about 50 Elo, small beside the 500 between the weakest and strongest
 * bots, and closes most of a gap in about 30 four-seat games, so a newcomer finds their level in a
 * few evenings' play; half of it would be steadier, but would take twice as many games to get there.
 */
export const K = 32;

const gamma = (elo: number) => 10 ** (elo / 400);

/** The Elo a seat plays at: a bot's measured one, or the one a person brought when they sat
 *  down (a seat taken before ratings travelled with the seat is taken as a newcomer's). */
export function seatElo(controller: Controller): number {
  return controller.kind === "bot" ? eloOf(controller.bot) : (controller.elo ?? START_ELO);
}

/** The chance `seat` wins a table of these Elos: its strength over the table's. */
export function expectedWin(elos: readonly number[], seat: Seat): number {
  const total = elos.reduce((sum, elo) => sum + gamma(elo), 0);
  return gamma(elos[seat]) / total;
}

/** How far a game moves the rating of the player at `seat`. */
export function ratingChange(elos: readonly number[], seat: Seat, won: boolean): number {
  return K * ((won ? 1 : 0) - expectedWin(elos, seat));
}

export type Outcome = "won" | "lost";

/** What this seat's game came to, once the seat knows: losing all its territories ends its game,
 *  and holding the world wins it. `confirmed` is whether the server has the game over; a win is
 *  scored only then, as this phone shows its own moves before the server has them. */
export function outcomeOf(view: GameView, seat: Seat, confirmed: boolean): Outcome | null {
  if (view.winner === seat) return confirmed ? "won" : null;
  return view.seats[seat].eliminated ? "lost" : null;
}

/** One game's effect on the rating, as the device recorded it. */
export interface RatedGame {
  from: number;
  to: number;
}

/** A device's rating, and every game it was settled by, by the game's row id. */
export interface EloLedger {
  elo: number;
  games: Readonly<Partial<Record<string, RatedGame>>>;
}

export const NEW_LEDGER: EloLedger = { elo: START_ELO, games: {} };

/** The ledger with a finished game scored. A game is scored once: settling one already in the
 *  ledger (a reload, a second look at the end) returns the ledger as it is. */
export function settle(ledger: EloLedger, gameId: string, elos: readonly number[], seat: Seat, outcome: Outcome): EloLedger {
  if (ledger.games[gameId]) return ledger;
  const to = ledger.elo + ratingChange(elos, seat, outcome === "won");
  return { elo: to, games: { ...ledger.games, [gameId]: { from: ledger.elo, to } } };
}

/** "+18", "−7", "±0": the change as the player sees it, in whole points of what they see. */
export function shownChange({ from, to }: RatedGame): string {
  const change = Math.round(to) - Math.round(from);
  if (change === 0) return "±0";
  return change > 0 ? `+${change.toString()}` : `−${(-change).toString()}`;
}

const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** A ledger as storage gave it back. Storage is this device's own, written only by `settle`'s
 *  results, so anything else there is a bug and fails loudly. */
export function parseLedger(saved: unknown): EloLedger {
  if (saved === null) return NEW_LEDGER;
  if (typeof saved === "object" && !Array.isArray(saved)) {
    const { elo, games } = saved as Record<string, unknown>;
    if (isNumber(elo) && typeof games === "object" && games !== null) {
      const entries = Object.entries(games as Record<string, unknown>);
      if (entries.every(([, game]) => typeof game === "object" && game !== null && isNumber((game as RatedGame).from) && isNumber((game as RatedGame).to))) {
        return { elo, games: games as Record<string, RatedGame> };
      }
    }
  }
  throw new Error(`Risk's saved Elo isn't a ledger: ${JSON.stringify(saved)}`);
}
