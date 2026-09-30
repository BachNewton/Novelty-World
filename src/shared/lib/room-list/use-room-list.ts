"use client";

import { useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/shared/lib/supabase/client";
import { roomListChannel, roomsFromPresence, type ListedRoom, type Listing } from "./room-list";

/** `live` once subscribed; `error` while Supabase can't reach the channel
 * (it rejoins by itself, and the status returns to `live` when it does). */
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

/**
 * The game's open rooms, live, and this client's own listing on the list
 * while `listing` is non-null. Changing the listing re-advertises it;
 * null, or unmounting, takes it down.
 */
export function useRoomList({ game, listing }: UseRoomListOptions): RoomList {
  const [rooms, setRooms] = useState<readonly ListedRoom[]>(NO_ROOMS);
  const [status, setStatus] = useState<RoomListStatus>("connecting");
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const lobby = supabase.channel(roomListChannel(game, window.location.search));
    lobby.on("presence", { event: "sync" }, () => {
      setRooms(roomsFromPresence(lobby.presenceState<ListedRoom>()));
    });
    lobby.subscribe((state, err) => {
      if (state === "SUBSCRIBED") {
        setStatus("live");
        setChannel(lobby);
      } else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT") {
        console.error(`room list: ${game} lobby channel ${state}`, err);
        setStatus("error");
      }
    });
    return () => {
      setChannel(null);
      setStatus("connecting");
      setRooms(NO_ROOMS);
      void supabase.removeChannel(lobby);
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
      channel === null ||
      code === undefined ||
      hostName === undefined ||
      players === undefined ||
      capacity === undefined
    ) {
      return;
    }
    const listed: ListedRoom = { code, hostName, players, capacity, listedAt: Date.now() };
    void channel.track(listed).then((result) => {
      if (result !== "ok") console.error(`room list: listing room ${code} failed (${result})`);
    });
    return () => {
      void channel.untrack();
    };
  }, [channel, code, hostName, players, capacity]);

  return { status, rooms };
}
