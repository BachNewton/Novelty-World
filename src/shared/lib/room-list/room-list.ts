/**
 * A live list of a game's open rooms, over Supabase Realtime presence (or,
 * in e2e runs, its local stand-in: see `roomListSource`). Each
 * host with a room waiting for players tracks a listing on the game's lobby
 * channel; everyone on the lobby screen subscribes to that channel and sees
 * the listings appear and vanish as hosts track and untrack them. A closed
 * tab drops its presence on its own, so a vanished host leaves no stale room.
 *
 * Discovery only: joining a listed room is the peer module's business
 * (`src/shared/lib/peer/`), by the listing's code.
 */

import { RELAY_PARAM, relayUrlFromSearch } from "@/shared/lib/peer";
import { LOCAL_ROOM_LIST_PATH } from "./local-protocol";

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

/**
 * Test only: `?room-list=local:<name>` lists rooms on the local stand-in
 * (`relay/room-list.ts`) of the run's own relay, which `?relay=local:<port>`
 * names, on a channel of the test's own, so no test reaches Supabase and no
 * two tests see each other's rooms.
 */
export const ROOM_LIST_PARAM = "room-list";

/** Where a game's room list lives: Supabase presence, or the local stand-in. */
export type RoomListSource =
  | { kind: "supabase"; channel: string }
  | { kind: "local"; url: string; channel: string };

export function roomListSource(game: string, search: string): RoomListSource {
  const params = new URLSearchParams(search);
  const own = params.get(ROOM_LIST_PARAM);
  if (own === null) return { kind: "supabase", channel: `lobby:${game}` };
  const local = /^local:([A-Za-z0-9_-]+)$/.exec(own);
  if (local === null) throw new Error(`?${ROOM_LIST_PARAM}=${own} is not local:<name>`);
  if (!params.has(RELAY_PARAM)) throw new Error(`?${ROOM_LIST_PARAM}=local needs ?${RELAY_PARAM}=local:<port>`);
  return { kind: "local", url: `${relayUrlFromSearch(search)}${LOCAL_ROOM_LIST_PATH}`, channel: `${game}:${local[1]}` };
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
