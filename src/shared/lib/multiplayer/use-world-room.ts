"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { usePeer } from "../webrtc";
import type { ConnectionState } from "../webrtc";
import { useLobby } from "./use-lobby";
import type { WorldRoomPhase, WorldRoomState, UseWorldRoomOptions, PlayerInfo } from "./types";
import { MP_PREFIX } from "./types";
import { generateRoomCode, createNamespacedMessaging } from "./shared";

/**
 * React hook for open/dynamic multiplayer rooms.
 *
 * No host concept — fully decentralized. Players join and leave freely.
 * Each peer announces itself to every new connection. The roster is built
 * from received announcements + self.
 */
export function useWorldRoom(options: UseWorldRoomOptions): WorldRoomState {
  const { game, profile } = options;

  // --- Local lifecycle state ---
  const [phase, setPhase] = useState<WorldRoomPhase>("lobby");
  const [roomCode, setRoomCode] = useState<string | null>(null);

  const peerActive = phase !== "lobby" && roomCode !== null;

  // --- Transport hooks ---
  const { rooms, advertise } = useLobby({ game });
  const {
    peerId,
    peers,
    connectionState,
    send: peerSend,
    sendTo: peerSendTo,
    onMessage: peerOnMessage,
    onPeerLeave,
    disconnect: peerDisconnect,
  } = usePeer(
    roomCode ?? "",
    "guest", // No host concept — all peers are equal
    { enabled: peerActive },
  );

  // --- Roster tracking ---
  // Keyed by playerId (persistent) to handle reconnects with new peerId
  const rosterRef = useRef<Map<string, PlayerInfo>>(new Map());
  const [rosterVersion, setRosterVersion] = useState(0);
  const announcedToRef = useRef<Set<string>>(new Set());

  // --- Player event handlers ---
  const playerJoinHandlersRef = useRef<Set<(player: PlayerInfo) => void>>(new Set());

  // --- Advertise room while joined ---
  const unadvertiseRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (phase !== "joined" || !roomCode) return;

    unadvertiseRef.current = advertise({
      roomCode,
      game,
      playerCount: 1,
      createdAt: Date.now(),
    });

    return () => {
      unadvertiseRef.current?.();
      unadvertiseRef.current = null;
    };
  }, [phase, roomCode, game, advertise]);

  // --- Receive announce messages (register BEFORE sending) ---
  useEffect(() => {
    if (phase !== "joined") return;

    return peerOnMessage<{ playerId: string; playerName: string }>(
      `${MP_PREFIX}announce`,
      (msg) => {
        const existing = rosterRef.current.get(msg.payload.playerId);
        if (existing && existing.peerId === msg.from) return; // Already known, same peer

        const player: PlayerInfo = {
          playerId: msg.payload.playerId,
          playerName: msg.payload.playerName,
          peerId: msg.from,
          status: "connected",
        };

        // Update or add — handles reconnect (same playerId, new peerId)
        rosterRef.current.set(msg.payload.playerId, player);
        setRosterVersion((v) => v + 1);

        // Fire onPlayerJoin handlers only for genuinely new players
        if (!existing) {
          for (const handler of [...playerJoinHandlersRef.current]) {
            handler(player);
          }
        }
      },
    );
  }, [phase, peerOnMessage]);

  // --- Send announce to newly connected peers ---
  useEffect(() => {
    if (phase !== "joined") return;

    for (const peer of peers) {
      if (peer.status === "connected" && !announcedToRef.current.has(peer.id)) {
        announcedToRef.current.add(peer.id);
        peerSendTo(peer.id, `${MP_PREFIX}announce`, {
          playerId: profile.id,
          playerName: profile.name,
        });
      }
    }
  }, [phase, peers, peerSendTo, profile.id, profile.name]);

  // --- Derive failure / disconnect from transport state ---
  let effectivePhase = phase;
  if (phase === "joined" && connectionState === "failed") {
    effectivePhase = "failed";
  }
  if (phase === "joined" && peers.length > 0 && peers.every((p) => p.status !== "connected")) {
    effectivePhase = "disconnected";
  }

  // --- Player roster with live connection status ---
  const playerRoster: PlayerInfo[] = useMemo(() => {
    const self: PlayerInfo = {
      playerId: profile.id,
      playerName: profile.name,
      peerId,
      status: "connected",
    };

    const others = Array.from(rosterRef.current.values()).map((entry) => {
      const peer = peers.find((p) => p.id === entry.peerId);
      return { ...entry, status: (peer?.status ?? "disconnected") as ConnectionState };
    });

    return [self, ...others];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rosterRef is a ref, not reactive state; rosterVersion is bumped explicitly when the ref mutates to drive this recompute
  }, [profile.id, profile.name, peerId, peers, rosterVersion]);

  // --- Namespaced messaging ---
  const { send, sendTo, onMessage } = useMemo(
    () => createNamespacedMessaging(peerSend, peerSendTo, peerOnMessage),
    [peerSend, peerSendTo, peerOnMessage],
  );

  // --- Actions ---

  const create = useCallback(() => {
    const code = generateRoomCode();
    setRoomCode(code);
    setPhase("joined");
  }, []);

  const join = useCallback((code: string) => {
    setRoomCode(code.toUpperCase());
    setPhase("joined");
  }, []);

  const leave = useCallback(() => {
    peerDisconnect();
    unadvertiseRef.current?.();
    unadvertiseRef.current = null;
    rosterRef.current.clear();
    announcedToRef.current.clear();
    setRosterVersion(0);
    setRoomCode(null);
    setPhase("lobby");
  }, [peerDisconnect]);

  const onPlayerJoin = useCallback(
    (handler: (player: PlayerInfo) => void): (() => void) => {
      playerJoinHandlersRef.current.add(handler);
      return () => {
        playerJoinHandlersRef.current.delete(handler);
      };
    },
    [],
  );

  const onPlayerLeave = useCallback(
    (handler: (peerId: string) => void): (() => void) => {
      return onPeerLeave(handler);
    },
    [onPeerLeave],
  );

  return {
    rooms,
    create,
    join,
    phase: effectivePhase,
    roomCode,
    playerId: profile.id,
    playerRoster,
    send,
    sendTo,
    onMessage,
    onPlayerJoin,
    onPlayerLeave,
    leave,
  };
}
