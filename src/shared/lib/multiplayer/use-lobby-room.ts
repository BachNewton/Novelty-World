"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { usePeer } from "../webrtc";
import type { PeerRole, MessageHandler, ConnectionState } from "../webrtc";
import { useLobby } from "./use-lobby";
import type { LobbyRoomPhase, LobbyRoomState, UseLobbyRoomOptions, PlayerInfo } from "./types";
import { MP_PREFIX } from "./types";
import { generateRoomCode, createNamespacedMessaging } from "./shared";

/** Wire format for roster entries in __mp:start */
interface RosterEntry {
  playerId: string;
  playerName: string;
  peerId: string;
}

export function useLobbyRoom(options: UseLobbyRoomOptions): LobbyRoomState {
  const { game, profile } = options;

  // --- Local lifecycle state ---
  const [phase, setPhase] = useState<LobbyRoomPhase>("lobby");
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);

  // Derive role and whether peer hook should be active
  const role: PeerRole = isHost ? "host" : "guest";
  const peerActive = phase !== "lobby" && roomCode !== null;

  // --- Transport hooks (conditionally active) ---
  const { rooms, advertise } = useLobby({ game });
  const {
    peerId,
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
    { enabled: peerActive },
  );

  // --- Handshake tracking ---
  const readyPeersRef = useRef<Set<string>>(new Set());
  const readyProfilesRef = useRef<Map<string, { playerId: string; playerName: string }>>(new Map());
  const [neededPeers, setNeededPeers] = useState(0);
  const unadvertiseRef = useRef<(() => void) | null>(null);

  // --- Player identity ---
  const [rosterEntries, setRosterEntries] = useState<RosterEntry[]>([]);

  // --- Host: advertise room while waiting ---
  useEffect(() => {
    if (!isHost || phase !== "waiting" || !roomCode) return;

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
  }, [isHost, phase, roomCode, game, advertise]);

  // --- Guest: skip waiting phase entirely ---
  if (!isHost && phase === "waiting") {
    setPhase("connecting");
  }

  // --- Application-level ready handshake ---

  // Guest: once any peer is connected, register __mp:start listener, then send __mp:ready.
  // Re-sends __mp:ready when peers change — in mesh, a guest may connect to another
  // guest before the host, so we resend when new peers appear. Host deduplicates.
  useEffect(() => {
    if (isHost || phase !== "connecting") return;
    if (!isConnected) return;

    // Register start listener FIRST, then send ready — deterministic ordering
    const unsub = peerOnMessage<{ roster: RosterEntry[] }>(`${MP_PREFIX}start`, (msg) => {
      setRosterEntries(msg.payload.roster);
      setPhase("ready");
    });

    peerSend(`${MP_PREFIX}ready`, { playerId: profile.id, playerName: profile.name });

    return unsub;
  }, [isHost, phase, isConnected, peers, peerOnMessage, peerSend, profile.id, profile.name]);

  // Host: collect __mp:ready from guests, send __mp:start when all are ready.
  // neededPeers is set when host calls start().
  useEffect(() => {
    if (!isHost || phase !== "connecting") return;

    readyPeersRef.current.clear();
    readyProfilesRef.current.clear();
    if (neededPeers === 0) return;

    const unsub = peerOnMessage<{ playerId: string; playerName: string }>(`${MP_PREFIX}ready`, (msg) => {
      readyPeersRef.current.add(msg.from);
      readyProfilesRef.current.set(msg.from, msg.payload);
      if (readyPeersRef.current.size >= neededPeers) {
        // Build roster: host first, then guests in join order
        const roster: RosterEntry[] = [
          { playerId: profile.id, playerName: profile.name, peerId },
        ];
        for (const guestPeerId of readyPeersRef.current) {
          const guestProfile = readyProfilesRef.current.get(guestPeerId);
          if (guestProfile) {
            roster.push({ ...guestProfile, peerId: guestPeerId });
          }
        }
        setRosterEntries(roster);
        peerSend(`${MP_PREFIX}start`, { roster });
        setPhase("ready");
      }
    });

    return unsub;
  }, [isHost, phase, neededPeers, peerOnMessage, peerSend, peerId, profile.id, profile.name]);

  // --- Derive failure / disconnect from transport state ---
  let effectivePhase = phase;
  if ((phase === "connecting" || phase === "ready") && connectionState === "failed") {
    effectivePhase = "failed";
  }
  if (phase === "ready" && peers.length > 0 && peers.every((p) => p.status !== "connected")) {
    effectivePhase = "disconnected";
  }

  // --- Player roster with live connection status ---
  const playerRoster: PlayerInfo[] = useMemo(() => {
    return rosterEntries.map((entry) => {
      if (entry.peerId === peerId) {
        // Local player is always "connected" from our perspective
        return { ...entry, status: "connected" as ConnectionState };
      }
      const peer = peers.find((p) => p.id === entry.peerId);
      return { ...entry, status: (peer?.status ?? "disconnected") as ConnectionState };
    });
  }, [rosterEntries, peers, peerId]);

  // --- Namespaced messaging ---
  const { send, sendTo, onMessage } = useMemo(
    () => createNamespacedMessaging(peerSend, peerSendTo, peerOnMessage),
    [peerSend, peerSendTo, peerOnMessage],
  );

  // --- Actions ---

  const createRoom = useCallback(() => {
    const code = generateRoomCode();
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
    readyProfilesRef.current.clear();
    setRosterEntries([]);
    setRoomCode(null);
    setIsHost(false);
    setPhase("lobby");
  }, [peerDisconnect]);

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
    playerId: profile.id,
    playerRoster,
    send,
    sendTo,
    onMessage,
    onPlayerLeave,
    leave,
  };
}
