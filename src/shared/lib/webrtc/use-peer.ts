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
  /** Max peer connections to accept. Omit for no limit. */
  maxPeers?: number;
  /** When false, the hook stays dormant — no signaling, no connections. */
  enabled?: boolean;
}

/**
 * React hook for WebRTC peer connections.
 * Supports N-player via full mesh topology (every peer connects to every other).
 * Uses a deterministic offer rule (higher peer ID initiates) to avoid duplicate offers.
 *
 * This hook is the SOLE signal router — PeerConnection has no knowledge
 * of the signaling transport.
 */
export function usePeer(
  roomId: string,
  role: PeerRole,
  options: UsePeerOptions = {},
): PeerHookState {
  const { maxPeers, enabled = true } = options;

  const [peers, setPeers] = useState<PeerState[]>([]);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("new");

  const [peerId] = useState(() => crypto.randomUUID());
  const connectionsRef = useRef<Map<string, PeerConnection>>(new Map());
  const signalingRef = useRef<ReturnType<typeof createSignalingChannel> | null>(null);

  // Stable message handlers that survive PeerConnection recreation
  const messageHandlersRef = useRef<Map<string, Set<MessageHandler>>>(
    new Map(),
  );

  // Stable peer-leave handlers (fire when any peer disconnects or fails)
  const peerLeaveHandlersRef = useRef<Set<(peerId: string) => void>>(
    new Set(),
  );

  // Update peers state from the connections map
  const syncPeers = useCallback(() => {
    const peerStates: PeerState[] = [];
    for (const [id, conn] of connectionsRef.current) {
      peerStates.push({
        id,
        status: conn.getConnectionState(),
      });
    }
    setPeers(peerStates);

    // Derive overall connection state
    if (peerStates.length === 0) {
      setConnectionState("new");
    } else if (peerStates.some((p) => p.status === "connected")) {
      setConnectionState("connected");
    } else if (peerStates.some((p) => p.status === "failed")) {
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
      const onErr = (e: unknown) => console.warn("[usePeer] signal routing error:", e);
      switch (msg.type) {
        case "offer":
          conn.handleOffer(msg.payload as RTCSessionDescriptionInit).catch(onErr);
          break;
        case "answer":
          conn.handleAnswer(msg.payload as RTCSessionDescriptionInit).catch(onErr);
          break;
        case "ice-candidate":
          conn.addIceCandidate(msg.payload as RTCIceCandidateInit).catch(onErr);
          break;
      }
    }

    // --- Local helper: create a PeerConnection for a remote peer ---
    function createConn(remotePeerId: string, initiator: boolean): PeerConnection {
      const conn = new PeerConnection({
        initiator,
        localPeerId: peerId,
        remotePeerId,
        onSignalOut: (signal) => {
          signaling.sendSignal({ ...signal, to: remotePeerId });
        },
        onConnectionStateChange: (state) => {
          if (state === "disconnected" || state === "failed") {
            for (const handler of [...peerLeaveHandlersRef.current]) {
              handler(remotePeerId);
            }
          }
          syncPeers();
        },
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
      } else if (msg.type === "offer") {
        // Offer from unknown peer — they initiated, we respond
        const newConn = createConn(msg.from, false);
        routeSignal(newConn, msg);
      } else {
        buffer.push(msg);
      }
    });

    // --- Handle signaling failure for all roles ---
    signaling.ready.catch(() => {
      if (cleanedUp) return;
      setConnectionState("failed");
    });

    // --- Mesh: Presence-based peer discovery (all peers) ---
    // Deterministic rule: the peer with the higher ID sends the offer.
    // The other peer waits for the offer (handled by signal routing above).
    function maybeInitiate(remotePeerId: string) {
      if (cleanedUp) return;
      if (connections.has(remotePeerId)) return;
      if (maxPeers !== undefined && connections.size >= maxPeers) return;

      if (peerId > remotePeerId) {
        const conn = createConn(remotePeerId, true);
        conn.createOffer().catch((e) => console.warn("[usePeer] createOffer error:", e));
      }
      // Otherwise, wait for their offer (they have the higher ID)
    }

    const unsubJoined = signaling.onPeerJoined((remotePeerId) => {
      maybeInitiate(remotePeerId);
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
          if (presence.peerId !== peerId) {
            maybeInitiate(presence.peerId);
          }
        }
      }
    });

    // --- Cleanup ---
    return () => {
      cleanedUp = true;
      unsubSignal();
      unsubJoined();
      for (const conn of connections.values()) {
        conn.destroy();
      }
      connections.clear();
      buffer.length = 0;
      signaling.destroy();
      signalingRef.current = null;
    };
  }, [roomId, peerId, maxPeers, syncPeers, enabled]);

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
      for (const conn of connectionsRef.current.values()) {
        conn.onMessage(type, handler as MessageHandler);
      }

      return () => {
        handlers!.delete(handler as MessageHandler);
        if (handlers!.size === 0) {
          messageHandlersRef.current.delete(type);
        }
        // Remove from ALL current connections, not just those that existed at registration
        for (const conn of connectionsRef.current.values()) {
          conn.removeHandler(type, handler as MessageHandler);
        }
      };
    },
    [],
  );

  const onPeerLeave = useCallback(
    (handler: (peerId: string) => void): (() => void) => {
      peerLeaveHandlersRef.current.add(handler);
      return () => {
        peerLeaveHandlersRef.current.delete(handler);
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
    isConnected: peers.some((p) => p.status === "connected"),
    allConnected: maxPeers !== undefined
      ? peers.filter((p) => p.status === "connected").length >= maxPeers
      : peers.length > 0 && peers.every((p) => p.status === "connected"),
    send,
    sendTo,
    onMessage,
    onPeerLeave,
    disconnect,
  };
}
