"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/shared/lib/supabase/client";
import { parseRoomListSync, type RoomListClientFrame } from "./local-protocol";
import { roomListSource, roomsFromPresence, type ListedRoom, type Listing, type RoomListSource } from "./room-list";

/** `live` once subscribed; `error` while the list can't be reached (Supabase
 * rejoins by itself, and the status returns to `live` when it does). */
export type RoomListStatus = "connecting" | "live" | "error";

export interface UseRoomListOptions {
  game: string;
  /** This client's own room to advertise, or null to advertise nothing. */
  listing: Listing | null;
}

export interface RoomList {
  status: RoomListStatus;
  rooms: readonly ListedRoom[];
}

const NO_ROOMS: readonly ListedRoom[] = [];

/** A subscribed list, where this client advertises its own room. */
interface Advertiser {
  track(room: ListedRoom): void;
  untrack(): void;
}

interface ListHandlers {
  rooms(rooms: readonly ListedRoom[]): void;
  live(advertiser: Advertiser): void;
  error(): void;
}

/** Subscribes to the list at `source`; returns the unsubscribe. */
function openList(source: RoomListSource, on: ListHandlers): () => void {
  return source.kind === "supabase" ? openSupabaseList(source.channel, on) : openLocalList(source.url, source.channel, on);
}

function openSupabaseList(name: string, on: ListHandlers): () => void {
  const supabase = createClient();
  const lobby = supabase.channel(name);
  lobby.on("presence", { event: "sync" }, () => {
    on.rooms(roomsFromPresence(lobby.presenceState<ListedRoom>()));
  });
  const advertiser: Advertiser = {
    track(room) {
      void lobby.track(room).then((result) => {
        if (result !== "ok") console.error(`room list: listing room ${room.code} failed (${result})`);
      });
    },
    untrack() {
      void lobby.untrack();
    },
  };
  lobby.subscribe((state, err) => {
    if (state === "SUBSCRIBED") {
      on.live(advertiser);
    } else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT") {
      console.error(`room list: ${name} channel ${state}`, err);
      on.error();
    }
  });
  return () => void supabase.removeChannel(lobby);
}

/** The local stand-in, test only: a closed socket is a broken run, so it fails loudly rather than rejoining. */
function openLocalList(url: string, channel: string, on: ListHandlers): () => void {
  const socket = new WebSocket(url);
  let closing = false;
  const send = (frame: RoomListClientFrame) => socket.send(JSON.stringify(frame));
  socket.addEventListener("open", () => {
    send({ type: "watch", channel });
    on.live({ track: (room) => send({ type: "track", room }), untrack: () => send({ type: "untrack" }) });
  });
  socket.addEventListener("message", (event) => {
    const frame = typeof event.data === "string" ? parseRoomListSync(JSON.parse(event.data)) : null;
    if (frame === null) throw new Error(`room list: a malformed frame from the local stand-in: ${String(event.data)}`);
    on.rooms(frame.rooms);
  });
  socket.addEventListener("close", (event) => {
    if (closing) return;
    console.error(`room list: the local stand-in at ${url} closed (${String(event.code)})`);
    on.error();
  });
  return () => {
    closing = true;
    socket.close();
  };
}

/**
 * The game's open rooms, live, and this client's own listing on the list
 * while `listing` is non-null. Changing the listing re-advertises it;
 * null, or unmounting, takes it down.
 */
export function useRoomList({ game, listing }: UseRoomListOptions): RoomList {
  const [rooms, setRooms] = useState<readonly ListedRoom[]>(NO_ROOMS);
  const [status, setStatus] = useState<RoomListStatus>("connecting");
  const [advertiser, setAdvertiser] = useState<Advertiser | null>(null);

  useEffect(() => {
    const close = openList(roomListSource(game, window.location.search), {
      rooms: setRooms,
      live(advertiser) {
        setStatus("live");
        setAdvertiser(advertiser);
      },
      error: () => setStatus("error"),
    });
    return () => {
      setAdvertiser(null);
      setStatus("connecting");
      setRooms(NO_ROOMS);
      close();
    };
  }, [game]);

  // Primitive deps, so a listing rebuilt each render with the same values
  // isn't re-advertised.
  const code = listing?.code;
  const hostName = listing?.hostName;
  const players = listing?.players;
  const capacity = listing?.capacity;
  useEffect(() => {
    if (
      advertiser === null ||
      code === undefined ||
      hostName === undefined ||
      players === undefined ||
      capacity === undefined
    ) {
      return;
    }
    advertiser.track({ code, hostName, players, capacity, listedAt: Date.now() });
    return () => advertiser.untrack();
  }, [advertiser, code, hostName, players, capacity]);

  return { status, rooms };
}
