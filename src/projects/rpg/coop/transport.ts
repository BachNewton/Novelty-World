/**
 * PeerJS star-topology transport: the smallest testable pos + tiles core.
 *
 * - Claim-or-join on the fixed id (`COOP_HOST_ID`): whoever holds it is the
 *   host; `unavailable-id` means a host exists → connect as guest.
 * - Guests hold one connection (to the host). The host delivers guest
 *   messages locally and rebroadcasts them to the other guests.
 * - Host loss triggers re-election: orphaned guests destroy the peer and
 *   immediately re-claim the fixed id off the same close/error event (no
 *   waits — the PeerJS server serializes simultaneous claims, so exactly one
 *   orphan wins and the rest join it as guests); `status` feeds the
 *   "reconnecting…" indicator. Peers already hold merged map state.
 */
"use client";

import { useEffect, useState } from "react";
import { Peer, type DataConnection } from "peerjs";
import {
  COOP_HOST_ID,
  isCoopMessage,
  type CoopMessage,
  type OutboundMessage,
  type PeerLeftMessage,
} from "./types";

export type CoopRole = "host" | "guest" | null;
export type CoopStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "closed";

export interface CoopState {
  role: CoopRole;
  status: CoopStatus;
  /** This peer's id once the PeerJS handshake completes. */
  peerId: string | null;
  /** Host view: connected guest ids. Guest view: [hostId] when linked. */
  peers: string[];
}

export type CoopMessageHandler = (msg: CoopMessage) => void;
export type CoopStateHandler = (state: CoopState) => void;

export interface CoopTransportOptions {
  hostId?: string;
  /** Retained so existing call sites keep compiling. Re-election is purely
   * event-chained now, so this delay is never read. */
  reelectRetryMs?: number;
}

export interface CoopTransport {
  getState(): CoopState;
  onMessage(handler: CoopMessageHandler): () => void;
  onStateChange(handler: CoopStateHandler): () => void;
  /** Stamps `from` and routes: host broadcasts, guest sends to host. */
  send(msg: OutboundMessage): void;
  start(): void;
  destroy(): void;
}

function peerErrorType(err: unknown): string {
  if (typeof err === "object" && err !== null && "type" in err) {
    return String((err as { type?: unknown }).type ?? "unknown");
  }
  return "unknown";
}

export function createCoopTransport(
  options: CoopTransportOptions = {},
): CoopTransport {
  const hostId = options.hostId ?? COOP_HOST_ID;

  let role: CoopRole = null;
  let status: CoopStatus = "idle";
  let peer: Peer | null = null;
  let peerId: string | null = null;
  /** Host view: guest id → connection. */
  const guests = new Map<string, DataConnection>();
  /** Guest view: the single host connection. */
  let hostConn: DataConnection | null = null;
  const flags = { destroyed: false };
  /** Collapses concurrent close/error/disconnected events onto one claim:
   * set synchronously on entry to `claimOrJoin`, cleared when the attempt
   * settles (host, guest, or failed). */
  let claimInFlight = false;

  const messageHandlers = new Set<CoopMessageHandler>();
  const stateHandlers = new Set<CoopStateHandler>();

  function getState(): CoopState {
    return {
      role,
      status,
      peerId,
      peers:
        role === "host"
          ? [...guests.keys()]
          : hostConn !== null
            ? [hostId]
            : [],
    };
  }

  function emitState(): void {
    const snapshot = getState();
    for (const handler of stateHandlers) handler(snapshot);
  }

  function setState(next: Partial<Pick<CoopState, "role" | "status">>): void {
    let changed = false;
    if (next.role !== undefined && next.role !== role) {
      role = next.role;
      changed = true;
    }
    if (next.status !== undefined && next.status !== status) {
      status = next.status;
      changed = true;
    }
    if (changed) emitState();
  }

  /** Event-chained re-election: tear down the dead peer, publish
   * `reconnecting` synchronously, then re-claim the fixed id in the same
   * tick. Concurrent events collapse onto the in-flight attempt; the PeerJS
   * server serializes simultaneous claims — the winner hosts, losers get
   * `unavailable-id` and join as guests. No waits, no stagger. */
  function reelect(): void {
    if (flags.destroyed || claimInFlight) return;
    const old = peer;
    peer = null;
    peerId = null;
    guests.clear();
    hostConn = null;
    if (old !== null) {
      try {
        old.destroy();
      } catch {
        // Ignore teardown noise during re-election.
      }
    }
    setState({ role: null, status: "reconnecting" });
    void claimOrJoin();
  }

  /** Liveness read through a call boundary: `flags.destroyed` narrows to
   * `false` across awaits in straight-line async flow, so post-await checks
   * go through this `boolean`-typed read (`no-unnecessary-condition`). */
  function isAlive(): boolean {
    return !flags.destroyed;
  }

  function deliver(msg: CoopMessage): void {
    for (const handler of messageHandlers) handler(msg);
  }

  function broadcast(conns: Iterable<DataConnection>, msg: CoopMessage): void {
    for (const conn of conns) {
      if (conn.open !== true) continue;
      try {
        conn.send(msg);
      } catch {
        // Drop-and-continue: one flaky guest must not break the fan-out.
      }
    }
  }

  /** Host path: deliver locally, then rebroadcast to the other guests. */
  function handleGuestData(senderId: string, raw: unknown): void {
    if (!isCoopMessage(raw)) return;
    // `peer-left` is host-synthesized only — never accepted off the wire.
    if (raw.kind === "peer-left") return;
    deliver(raw);
    broadcast(
      [...guests.entries()]
        .filter(([id]) => id !== senderId)
        .map(([, conn]) => conn),
      raw,
    );
  }

  function watchPeer(next: Peer): void {
    // Every liveness event chains straight into re-election: `reelect`
    // destroys the dead peer, publishes `reconnecting`, and re-claims the
    // fixed id in the same tick. A transient signalling blip therefore
    // re-elects instead of reusing the old id — the claim race resolves it.
    next.on("disconnected", () => {
      if (flags.destroyed || peer !== next) return;
      reelect();
    });
    next.on("close", () => {
      if (flags.destroyed || peer !== next) return;
      reelect();
    });
    next.on("error", (err) => {
      if (flags.destroyed || peer !== next) return;
      if (peerErrorType(err) === "peer-unavailable") reelect();
    });
  }

  function attachHostHandlers(conn: DataConnection): void {
    const guestId = conn.peer;
    guests.set(guestId, conn);
    emitState();
    conn.on("data", (raw) => handleGuestData(guestId, raw));
    conn.on("close", () => {
      if (guests.get(guestId) !== conn) return;
      guests.delete(guestId);
      emitState();
      const left: PeerLeftMessage = { kind: "peer-left", from: hostId, peerId: guestId };
      deliver(left);
      broadcast(guests.values(), left);
    });
    conn.on("error", () => {
      // Connection-level errors resolve via the close path.
    });
  }

  function attachGuestHandlers(conn: DataConnection): void {
    hostConn = conn;
    const onOpen = () => {
      if (flags.destroyed || hostConn !== conn) return;
      setState({ status: "connected" });
    };
    if (conn.open) {
      onOpen();
    } else {
      conn.on("open", onOpen);
    }
    conn.on("data", (raw) => {
      if (isCoopMessage(raw)) deliver(raw);
    });
    function handleHostGone(): void {
      if (peerId !== null) {
        const left: PeerLeftMessage = { kind: "peer-left", from: peerId, peerId: hostId };
        deliver(left);
      }
      reelect();
    }
    conn.on("close", () => {
      if (hostConn !== conn) return;
      // Host is gone — emit synthetic peer-left so presence despawns the
      // old host's avatar, then re-elect.
      handleHostGone();
    });
    conn.on("error", () => {
      // Host went away uncleanly (tab close, network failure) — treat same as close.
      handleHostGone();
    });
  }

  function becomeHost(next: Peer): void {
    peer = next;
    peerId = hostId;
    guests.clear();
    hostConn = null;
    setState({ role: "host", status: "connected" });
    next.on("connection", (conn) => attachHostHandlers(conn));
    watchPeer(next);
  }

  function becomeGuest(next: Peer, id: string): void {
    peer = next;
    peerId = id;
    setState({ role: "guest", status: "connecting" });
    watchPeer(next);
    let conn: DataConnection;
    try {
      conn = next.connect(hostId, { reliable: true });
    } catch {
      // Dial failed before any event could fire: drop the peer and publish
      // `reconnecting`; the next liveness event re-chains the claim.
      try {
        next.destroy();
      } catch {
        // Ignore teardown noise.
      }
      if (peer === next) peer = null;
      setState({ role: null, status: "reconnecting" });
      return;
    }
    attachGuestHandlers(conn);
  }

  async function claimOrJoin(): Promise<void> {
    if (flags.destroyed || claimInFlight) return;
    claimInFlight = true;
    try {
      // Fresh starts publish `connecting`; re-election chains arrive with
      // `reconnecting` already published by `reelect` — keep it so the
      // indicator stays up until the claim settles.
      if (status !== "reconnecting") setState({ status: "connecting" });
      const candidate = new Peer(hostId);
      const settled = await new Promise<"host" | "guest" | "gone">((resolve) => {
        let done = false;
        const finish = (outcome: "host" | "guest" | "gone") => {
          if (done) return;
          done = true;
          resolve(outcome);
        };
        candidate.on("open", (id) => {
          finish(id === hostId ? "host" : "guest");
        });
        candidate.on("error", (err) => {
          finish(
            peerErrorType(err) === "unavailable-id" ? "guest" : "gone",
          );
        });
      });
      if (!isAlive()) {
        candidate.destroy();
        return;
      }
      if (settled === "host") {
        becomeHost(candidate);
        return;
      }
      try {
        candidate.destroy();
      } catch {
        // Ignore teardown noise on a failed claimant.
      }
      if (settled === "gone") {
        // No further event will fire for this attempt: publish `reconnecting`
        // and wait for the next liveness event to re-chain the claim.
        setState({ status: "reconnecting" });
        return;
      }
      // Join as a guest with a fresh random id.
      const guest = new Peer();
      const opened = await new Promise<string | null>((resolve) => {
        let done = false;
        guest.on("open", (id) => {
          if (done) return;
          done = true;
          resolve(id);
        });
        guest.on("error", () => {
          if (done) return;
          done = true;
          resolve(null);
        });
      });
      if (!isAlive() || opened === null) {
        try {
          guest.destroy();
        } catch {
          // Ignore teardown noise.
        }
        // As in the `gone` path above: publish `reconnecting` and wait for
        // the next liveness event to re-chain the claim.
        if (isAlive()) setState({ status: "reconnecting" });
        return;
      }
      becomeGuest(guest, opened);
    } finally {
      claimInFlight = false;
    }
  }

  function start(): void {
    if (flags.destroyed || status !== "idle") return;
    void claimOrJoin();
  }

  function send(msg: OutboundMessage): void {
    if (peerId === null) return;
    if ((msg as { kind?: string }).kind === "peer-left") return;
    const stamped = { ...msg, from: peerId } as CoopMessage;
    if (role === "host") {
      broadcast(guests.values(), stamped);
      return;
    }
    if (role === "guest") {
      const conn = hostConn;
      if (conn?.open !== true) return;
      try {
        conn.send(stamped);
      } catch {
        // Transport-level drop; the next pos tick / edit re-covers it.
      }
    }
  }

  function destroy(): void {
    flags.destroyed = true;
    messageHandlers.clear();
    stateHandlers.clear();
    for (const [, conn] of guests) {
      try {
        conn.close();
      } catch {
        // Ignore teardown noise.
      }
    }
    guests.clear();
    if (hostConn !== null) {
      try {
        hostConn.close();
      } catch {
        // Ignore teardown noise.
      }
      hostConn = null;
    }
    if (peer !== null) {
      try {
        peer.destroy();
      } catch {
        // Ignore teardown noise.
      }
      peer = null;
    }
    role = null;
    peerId = null;
    status = "closed";
  }

  return {
    getState,
    onMessage(handler: CoopMessageHandler): () => void {
      messageHandlers.add(handler);
      return () => {
        messageHandlers.delete(handler);
      };
    },
    onStateChange(handler: CoopStateHandler): () => void {
      stateHandlers.add(handler);
      return () => {
        stateHandlers.delete(handler);
      };
    },
    send,
    start,
    destroy,
  };
}

/**
 * React binding. Creates one transport per mount, auto-starts on the client,
 * and exposes live role/status for the "reconnecting…" indicator.
 */
export function useCoopTransport(
  options: CoopTransportOptions & { autoStart?: boolean } = {},
): { state: CoopState; send: (msg: OutboundMessage) => void } {
  const { autoStart = true, ...transportOptions } = options;
  const [transport] = useState(() => createCoopTransport(transportOptions));
  const [state, setState] = useState<CoopState>(() => transport.getState());

  useEffect(() => {
    const unsubscribe = transport.onStateChange(setState);
    if (autoStart) transport.start();
    return () => {
      unsubscribe();
      transport.destroy();
    };
  }, [autoStart, transport]);

  return {
    state,
    send: (msg: OutboundMessage) => transport.send(msg),
  };
}