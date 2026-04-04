"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createSignalingChannel } from "./signaling";
import { PeerConnection } from "./peer";
import type {
  PeerRole,
  PeerState,
  ConnectionState,
  PeerHookState,
  MessageHandler,
  SignalingMessage,
} from "./types";

interface UsePeerOptions {
  maxPeers?: number;
  /** When false, the hook stays dormant — no signaling, no connections. */
  enabled?: boolean;
}

/**
 * React hook for WebRTC peer connections.
 * Supports N-player via star topology (host connects to each guest).
 *
 * This hook is the SOLE signal router — PeerConnection has no knowledge
 * of the signaling transport.
 */
export function usePeer(
  roomId: string,
  role: PeerRole,
  options: UsePeerOptions = {},
): PeerHookState {
  const { maxPeers = 1, enabled = true } = options;

  const [peers, setPeers] = useState<PeerState[]>([]);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("new");

  const peerIdRef = useRef(crypto.randomUUID());
  const connectionsRef = useRef<Map<string, PeerConnection>>(new Map());
  const signalingRef = useRef<ReturnType<typeof createSignalingChannel> | null>(null);

  // Stable message handlers that survive PeerConnection recreation
  const messageHandlersRef = useRef<Map<string, Set<MessageHandler>>>(
    new Map(),
  );

  const peerId = peerIdRef.current;

  // Update peers state from the connections map
  const syncPeers = useCallback(() => {
    const peerStates: PeerState[] = [];
    for (const [id, conn] of connectionsRef.current) {
      peerStates.push({
        id,
        connected: conn.getConnectionState() === "connected",
      });
    }
    setPeers(peerStates);

    // Derive overall connection state
    if (peerStates.length === 0) {
      setConnectionState("new");
    } else if (peerStates.some((p) => p.connected)) {
      setConnectionState("connected");
    } else if (
      peerStates.every(
        (p) =>
          !p.connected &&
          connectionsRef.current.get(p.id)?.getConnectionState() === "failed",
      )
    ) {
      setConnectionState("failed");
    } else {
      setConnectionState("connecting");
    }
  }, []);

  // Main setup effect — owns all signal routing
  useEffect(() => {
    if (!enabled) return;

    let cleanedUp = false;
    const connections = connectionsRef.current;
    const buffer: SignalingMessage[] = [];

    const signaling = createSignalingChannel(roomId, peerId);
    signalingRef.current = signaling;

    // --- Local helper: route a signal to a PeerConnection ---
    function routeSignal(conn: PeerConnection, msg: SignalingMessage) {
      switch (msg.type) {
        case "offer":
          conn.handleOffer(msg.payload as RTCSessionDescriptionInit);
          break;
        case "answer":
          conn.handleAnswer(msg.payload as RTCSessionDescriptionInit);
          break;
        case "ice-candidate":
          conn.addIceCandidate(msg.payload as RTCIceCandidateInit);
          break;
      }
    }

    // --- Local helper: create a PeerConnection for a remote peer ---
    function createConn(remotePeerId: string): PeerConnection {
      const conn = new PeerConnection({
        role,
        localPeerId: peerId,
        remotePeerId,
        onSignalOut: (signal) => {
          signaling.sendSignal({ ...signal, to: remotePeerId });
        },
        onConnectionStateChange: () => syncPeers(),
      });

      connections.set(remotePeerId, conn);

      // Register existing message handlers on the new connection
      for (const [type, handlers] of messageHandlersRef.current) {
        for (const handler of handlers) {
          conn.onMessage(type, handler);
        }
      }

      // Drain buffered signals for this peer
      const remaining: SignalingMessage[] = [];
      for (const msg of buffer) {
        if (msg.from === remotePeerId) {
          routeSignal(conn, msg);
        } else {
          remaining.push(msg);
        }
      }
      buffer.length = 0;
      buffer.push(...remaining);

      syncPeers();
      return conn;
    }

    // --- ONE signaling listener: sole owner of message routing ---
    const unsubSignal = signaling.onSignal((msg) => {
      if (cleanedUp) return;

      const conn = connections.get(msg.from);
      if (conn) {
        routeSignal(conn, msg);
      } else if (role === "guest" && msg.type === "offer") {
        const newConn = createConn(msg.from);
        routeSignal(newConn, msg);
      } else {
        buffer.push(msg);
      }
    });

    // --- Host: Presence-based peer discovery ---
    let unsubJoined: (() => void) | undefined;
    if (role === "host") {
      unsubJoined = signaling.onPeerJoined((remotePeerId) => {
        if (cleanedUp) return;
        if (connections.has(remotePeerId)) return;
        if (connections.size >= maxPeers) return;

        const conn = createConn(remotePeerId);
        conn.createOffer();
      });

      // Check for peers that arrived before us
      signaling.ready.then(() => {
        if (cleanedUp) return;
        const presenceState = signaling.channel.presenceState();
        for (const key of Object.keys(presenceState)) {
          const presences = presenceState[key] as unknown as Array<{
            peerId: string;
          }>;
          for (const presence of presences) {
            const remotePeerId = presence.peerId;
            if (remotePeerId === peerId) continue;
            if (connections.has(remotePeerId)) continue;
            if (connections.size >= maxPeers) return;

            const conn = createConn(remotePeerId);
            conn.createOffer();
          }
        }
      });
    }

    // --- Cleanup ---
    return () => {
      cleanedUp = true;
      unsubSignal();
      unsubJoined?.();
      for (const conn of connections.values()) {
        conn.destroy();
      }
      connections.clear();
      buffer.length = 0;
      signaling.destroy();
      signalingRef.current = null;
    };
  }, [roomId, role, peerId, maxPeers, syncPeers, enabled]);

  // --- Stable callbacks for consumers ---

  const send = useCallback(
    <T,>(type: string, payload: T): void => {
      for (const conn of connectionsRef.current.values()) {
        conn.send(type, payload);
      }
    },
    [],
  );

  const sendTo = useCallback(
    <T,>(targetPeerId: string, type: string, payload: T): void => {
      const conn = connectionsRef.current.get(targetPeerId);
      conn?.send(type, payload);
    },
    [],
  );

  const onMessage = useCallback(
    <T,>(type: string, handler: MessageHandler<T>): (() => void) => {
      // Track in ref so new connections get this handler
      let handlers = messageHandlersRef.current.get(type);
      if (!handlers) {
        handlers = new Set();
        messageHandlersRef.current.set(type, handlers);
      }
      handlers.add(handler as MessageHandler);

      // Register on all existing connections
      const unsubs: (() => void)[] = [];
      for (const conn of connectionsRef.current.values()) {
        unsubs.push(conn.onMessage(type, handler as MessageHandler));
      }

      return () => {
        handlers!.delete(handler as MessageHandler);
        if (handlers!.size === 0) {
          messageHandlersRef.current.delete(type);
        }
        for (const unsub of unsubs) {
          unsub();
        }
      };
    },
    [],
  );

  const disconnect = useCallback(() => {
    for (const conn of connectionsRef.current.values()) {
      conn.destroy();
    }
    connectionsRef.current.clear();
    signalingRef.current?.destroy();
    signalingRef.current = null;
    setPeers([]);
    setConnectionState("new");
  }, []);

  return {
    peerId,
    role,
    peers,
    connectionState,
    isConnected: peers.some((p) => p.connected),
    allConnected: peers.filter((p) => p.connected).length >= maxPeers,
    send,
    sendTo,
    onMessage,
    disconnect,
  };
}
