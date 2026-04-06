"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePeer } from "../webrtc";
import type { PeerRole, MessageHandler, DataMessage } from "../webrtc";
import { useLobby } from "./use-lobby";
import type { RoomPhase, GameRoom, UseGameRoomOptions } from "./types";
import { MP_PREFIX, GAME_PREFIX } from "./types";

/**
 * Game-agnostic multiplayer room hook.
 *
 * Owns the full lifecycle: lobby → room creation → WebRTC connection →
 * application-level ready handshake → game messaging → disconnect detection.
 *
 * Games only interact once `phase === "ready"`.
 */
export function useGameRoom(options: UseGameRoomOptions): GameRoom {
  const { game, maxPlayers } = options;

  // --- Local lifecycle state ---
  const [phase, setPhase] = useState<RoomPhase>("lobby");
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);

  // Derive role and whether peer hook should be active
  const role: PeerRole = isHost ? "host" : "guest";
  const peerActive = phase !== "lobby" && roomCode !== null;

  // --- Transport hooks (conditionally active) ---
  const { rooms, advertise } = useLobby({ game });
  const maxPeers = maxPlayers ? maxPlayers - 1 : undefined;
  const {
    peers,
    connectionState,
    isConnected,
    send: peerSend,
    sendTo: peerSendTo,
    onMessage: peerOnMessage,
    onPeerLeave,
    disconnect: peerDisconnect,
  } = usePeer(
    roomCode ?? "",
    role,
    { maxPeers, enabled: peerActive },
  );

  // --- Handshake tracking ---
  const readyPeersRef = useRef<Set<string>>(new Set());
  const [neededPeers, setNeededPeers] = useState(0);
  const unadvertiseRef = useRef<(() => void) | null>(null);

  // --- Host: advertise room while waiting ---
  useEffect(() => {
    if (!isHost || phase !== "waiting" || !roomCode) return;

    unadvertiseRef.current = advertise({
      roomCode,
      game,
      playerCount: 1,
      ...(maxPlayers && { maxPlayers }),
      createdAt: Date.now(),
    });

    return () => {
      unadvertiseRef.current?.();
      unadvertiseRef.current = null;
    };
  }, [isHost, phase, roomCode, game, maxPlayers, advertise]);

  // --- Transition: waiting → connecting (state adjustment during render) ---
  // Room full (fixed mode): all expected peers have appeared
  if (phase === "waiting" && maxPlayers && peers.length >= maxPlayers - 1) {
    setNeededPeers(maxPlayers - 1);
    setPhase("connecting");
  }
  // Guest: skip waiting phase entirely
  if (!isHost && phase === "waiting") {
    setPhase("connecting");
  }

  // --- Application-level ready handshake ---

  // Guest: once any peer is connected, register __mp:start listener, then send __mp:ready
  useEffect(() => {
    if (isHost || phase !== "connecting") return;
    if (!isConnected) return;

    // Register start listener FIRST, then send ready — deterministic ordering
    const unsub = peerOnMessage(`${MP_PREFIX}start`, () => {
      setPhase("ready");
    });

    peerSend(`${MP_PREFIX}ready`, {});

    return unsub;
  }, [isHost, phase, isConnected, peerOnMessage, peerSend]);

  // Host: collect __mp:ready from guests, send __mp:start when all are ready.
  // neededPeersRef is set at transition time (auto-transition or manual start()).
  useEffect(() => {
    if (!isHost || phase !== "connecting") return;

    readyPeersRef.current.clear();
    if (neededPeers === 0) return;

    const unsub = peerOnMessage(`${MP_PREFIX}ready`, (msg) => {
      readyPeersRef.current.add(msg.from);
      if (readyPeersRef.current.size >= neededPeers) {
        peerSend(`${MP_PREFIX}start`, {});
        setPhase("ready");
      }
    });

    return unsub;
  }, [isHost, phase, neededPeers, peerOnMessage, peerSend]);

  // --- Derive failure / disconnect from transport state (no effects needed) ---
  let effectivePhase = phase;
  if ((phase === "connecting" || phase === "ready") && connectionState === "failed") {
    effectivePhase = "failed";
  }
  if (phase === "ready" && peers.length > 0 && peers.every((p) => p.status !== "connected")) {
    effectivePhase = "disconnected";
  }

  // --- Actions ---

  const createRoom = useCallback(() => {
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    setRoomCode(code);
    setIsHost(true);
    setPhase("waiting");
  }, []);

  const joinRoom = useCallback((code: string) => {
    setRoomCode(code.toUpperCase());
    setIsHost(false);
    setPhase("waiting");
  }, []);

  const start = useCallback(() => {
    if (!isHost || phase !== "waiting") return;
    setNeededPeers(peers.filter((p) => p.status === "connected").length);
    setPhase("connecting");
    unadvertiseRef.current?.();
    unadvertiseRef.current = null;
  }, [isHost, phase, peers]);

  const leave = useCallback(() => {
    peerDisconnect();
    unadvertiseRef.current?.();
    unadvertiseRef.current = null;
    readyPeersRef.current.clear();
    setRoomCode(null);
    setIsHost(false);
    setPhase("lobby");
  }, [peerDisconnect]);

  // --- Namespaced messaging — game messages are prefixed automatically ---

  const send = useCallback(
    <T,>(type: string, payload: T) => {
      peerSend(GAME_PREFIX + type, payload);
    },
    [peerSend],
  );

  const sendTo = useCallback(
    <T,>(peerId: string, type: string, payload: T) => {
      peerSendTo(peerId, GAME_PREFIX + type, payload);
    },
    [peerSendTo],
  );

  const onMessage = useCallback(
    <T,>(type: string, handler: MessageHandler<T>): (() => void) => {
      return peerOnMessage(GAME_PREFIX + type, (msg) => {
        handler({ ...msg, type } as DataMessage<T>);
      });
    },
    [peerOnMessage],
  );

  const onPlayerLeave = useCallback(
    (handler: (peerId: string) => void): (() => void) => {
      return onPeerLeave(handler);
    },
    [onPeerLeave],
  );

  return {
    rooms,
    createRoom,
    joinRoom,
    start,
    phase: effectivePhase,
    roomCode,
    isHost,
    players: peers,
    send,
    sendTo,
    onMessage,
    onPlayerLeave,
    leave,
  };
}
