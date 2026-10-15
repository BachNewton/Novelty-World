import type { PlayerProfile } from "@/shared/lib/profile";
import type { Listing } from "@/shared/lib/room-list";
import { MAX_PLAYERS, type GameRow } from "./table";

/** The open lobby's channel for Risk tables (`useRoomList`). */
export const RISK_LOBBY = "risk";

/** The table's first person seated: the one who made it, unless they were removed. */
export function firstPerson(seats: GameRow["seats"]): PlayerProfile | null {
  for (const controller of seats) if (controller.kind === "human") return controller.profile;
  return null;
}

/**
 * A table's entry in the open lobby, advertised by the page of its first
 * person seated: only while
 * the table is gathering players and has a seat free. The game stays in its
 * row; the listing only lets others find it, by the row's id.
 */
export function tableListing(table: Pick<GameRow, "id" | "status" | "seats">, profileId: string): Listing | null {
  if (table.status !== "lobby" || table.seats.length >= MAX_PLAYERS) return null;
  const first = firstPerson(table.seats);
  if (first?.id !== profileId) return null;
  return { code: table.id, hostName: first.name, players: table.seats.length, capacity: MAX_PLAYERS };
}
