/**
 * A live list of a game's open rooms, over Supabase Realtime presence. Each
 * host with a room waiting for players tracks a listing on the game's lobby
 * channel; everyone on the lobby screen subscribes to that channel and sees
 * the listings appear and vanish as hosts track and untrack them. A closed
 * tab drops its presence on its own, so a vanished host leaves no stale room.
 *
 * Discovery only: joining a listed room is the peer module's business
 * (`src/shared/lib/peer/`), by the listing's code.
 */

/** What a host advertises about its room. */
export interface Listing {
  /** The peer room's code; joining the room means joining this code. */
  code: string;
  hostName: string;
  players: number;
  capacity: number;
}

/** A listing as the lobby sees it. */
export interface ListedRoom extends Listing {
  /** When the host listed it, by the host's clock; orders the list. */
  listedAt: number;
}

/** Test/dev only: `?room-list=<name>` lists rooms on a channel of its own,
 * so an e2e run never sees real players' rooms, nor they its. */
export const ROOM_LIST_PARAM = "room-list";

export function roomListChannel(game: string, search: string): string {
  const own = new URLSearchParams(search).get(ROOM_LIST_PARAM);
  return own === null ? `lobby:${game}` : `lobby:${game}:${own}`;
}

/** Presence state as Supabase keeps it: each client's tracked payloads. */
export type ListingPresence = Record<string, readonly ListedRoom[]>;

/** Every listed room, oldest first, so rooms already on screen stay put as
 * new ones arrive. */
export function roomsFromPresence(state: ListingPresence): ListedRoom[] {
  return Object.values(state)
    .flat()
    .map(({ code, hostName, players, capacity, listedAt }) => ({ code, hostName, players, capacity, listedAt }))
    .sort((a, b) => a.listedAt - b.listedAt);
}
