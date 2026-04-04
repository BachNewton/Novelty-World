"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/shared/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { LobbyRoom } from "./types";

interface UseLobbyOptions {
  /** Filter to a specific game (e.g., "tic-tac-toe"). Omit to see all games. */
  game?: string;
}

interface UseLobbyReturn {
  /** Live-updating list of available rooms */
  rooms: LobbyRoom[];
  /** Advertise a new room in the lobby. Returns cleanup fn to remove it. */
  advertise: (room: LobbyRoom) => () => void;
}

/**
 * Hook for discovering and advertising game rooms.
 * Uses a shared Supabase Realtime Presence channel per game.
 */
export function useLobby(options: UseLobbyOptions = {}): UseLobbyReturn {
  const { game } = options;
  const [rooms, setRooms] = useState<LobbyRoom[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const subscribedRef = useRef(false);
  const pendingTrackRef = useRef<LobbyRoom | null>(null);
  const supabaseRef = useRef(createClient());

  // Sync presence state to rooms list
  const syncRooms = useCallback(() => {
    const channel = channelRef.current;
    if (!channel) return;

    const presenceState = channel.presenceState();
    const lobbyRooms: LobbyRoom[] = [];

    for (const key of Object.keys(presenceState)) {
      const presences = presenceState[key] as unknown as Array<
        LobbyRoom & { presence_ref: string }
      >;
      for (const presence of presences) {
        lobbyRooms.push({
          roomCode: presence.roomCode,
          game: presence.game,
          playerCount: presence.playerCount,
          maxPlayers: presence.maxPlayers,
          createdAt: presence.createdAt,
        });
      }
    }

    // Sort by newest first
    lobbyRooms.sort((a, b) => b.createdAt - a.createdAt);
    setRooms(lobbyRooms);
  }, []);

  // Subscribe to the lobby channel
  useEffect(() => {
    const supabase = supabaseRef.current;
    const channelName = game ? `lobby:${game}` : "lobby:all";
    const channel = supabase.channel(channelName);
    channelRef.current = channel;
    subscribedRef.current = false;

    channel.on("presence", { event: "sync" }, () => {
      syncRooms();
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        subscribedRef.current = true;
        // Flush any pending advertise call
        if (pendingTrackRef.current) {
          channel.track(pendingTrackRef.current);
          pendingTrackRef.current = null;
        }
      }
    });

    return () => {
      subscribedRef.current = false;
      pendingTrackRef.current = null;
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [game, syncRooms]);

  const advertise = useCallback(
    (room: LobbyRoom): (() => void) => {
      const channel = channelRef.current;
      if (!channel) return () => {};

      if (subscribedRef.current) {
        channel.track(room);
      } else {
        // Queue until subscription completes
        pendingTrackRef.current = room;
      }

      return () => {
        pendingTrackRef.current = null;
        channel.untrack();
      };
    },
    [],
  );

  return { rooms, advertise };
}
