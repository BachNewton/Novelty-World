import type { PlayerProfile } from "@/shared/lib/profile";
import type { DecisionId, Move, RiskEngine, Seat } from "../contract";
import type { BotId } from "./bots/bot";
import { pendingSeat, type OnlineGame } from "./game";

/*
 * A game's row (`risk_games`, `supabase/risk.sql`): who sits where, whether
 * the game is still gathering players, and the game itself once it starts.
 */

/** Who answers a seat's decisions: a person on their own device, or a bot the server runs. */
export type Controller = { kind: "human"; profile: PlayerProfile } | { kind: "bot"; bot: BotId };

export type Status = "lobby" | "playing" | "over";

export interface GameRow {
  id: string;
  /** Raised by every write. */
  version: number;
  status: Status;
  /** In seat order: a seat is its index here. */
  seats: readonly Controller[];
  /** Null until the game starts. */
  game: OnlineGame | null;
}

/** One accepted answer, as the move log (`risk_moves`) keeps it: with the game's seed, the log
 *  replays the game. Who answered is kept as the seat's controller at the time. */
export interface LoggedMove {
  decision: DecisionId;
  seat: Seat;
  controller: Controller;
  move: Move;
}

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 6;

export function seatOf(row: Pick<GameRow, "seats">, profileId: string): Seat | null {
  const seat = row.seats.findIndex((c) => c.kind === "human" && c.profile.id === profileId);
  return seat === -1 ? null : seat;
}

export function controllerOf(row: Pick<GameRow, "seats">, seat: Seat): Controller {
  const controller = seat >= 0 ? row.seats.at(seat) : undefined;
  if (!controller) throw new Error(`Seat ${seat.toString()} isn't at the table`);
  return controller;
}

/** The bot seat the game waits on, if it waits on one. */
export function botToMove(engine: RiskEngine, row: GameRow): { seat: Seat; game: OnlineGame } | null {
  if (row.status !== "playing" || !row.game) return null;
  const seat = pendingSeat(engine, row.game);
  if (seat === null || controllerOf(row, seat).kind !== "bot") return null;
  return { seat, game: row.game };
}
