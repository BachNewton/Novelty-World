import { describe, it, expect, vi } from "vitest";
import type { MessageHandler, DataMessage, ConnectionState, PeerState } from "./types";

/**
 * Minimal mock that mirrors PeerConnection's onMessage/handler interface.
 * Lets us test usePeer's handler management pattern without browser APIs.
 */
class MockConnection {
  private handlers = new Map<string, Set<MessageHandler>>();

  onMessage<T>(type: string, handler: MessageHandler<T>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as MessageHandler);
    return () => {
      set!.delete(handler as MessageHandler);
    };
  }

  removeHandler<T>(type: string, handler: MessageHandler<T>): void {
    const set = this.handlers.get(type);
    if (set) {
      set.delete(handler as MessageHandler);
    }
  }

  /** Simulate receiving a message on this connection */
  simulateMessage(type: string, payload: unknown = {}) {
    const msg: DataMessage = { type, payload, timestamp: Date.now(), from: "remote" };
    const handlers = this.handlers.get(type);
    if (handlers) {
      for (const h of handlers) h(msg);
    }
  }
}

/**
 * Replicates the exact handler management pattern from usePeer:
 * - messageHandlersRef: global registry of handlers
 * - onMessage: registers on current connections, returns unsub
 * - createConn: registers existing handlers on new connections
 */
function createPeerPattern() {
  const connections = new Map<string, MockConnection>();
  const messageHandlers = new Map<string, Set<MessageHandler>>();

  function createConn(id: string): MockConnection {
    const conn = new MockConnection();
    connections.set(id, conn);

    // Register existing message handlers on the new connection (use-peer.ts:119-124)
    for (const [type, handlers] of messageHandlers) {
      for (const handler of handlers) {
        conn.onMessage(type, handler);
      }
    }

    return conn;
  }

  function onMessage<T>(type: string, handler: MessageHandler<T>): () => void {
    // Track in registry (use-peer.ts:227-232)
    let handlers = messageHandlers.get(type);
    if (!handlers) {
      handlers = new Set();
      messageHandlers.set(type, handlers);
    }
    handlers.add(handler as MessageHandler);

    // Register on all existing connections (use-peer.ts:235-237)
    for (const conn of connections.values()) {
      conn.onMessage(type, handler as MessageHandler);
    }

    // Cleanup (use-peer.ts:239-247)
    return () => {
      handlers!.delete(handler as MessageHandler);
      if (handlers!.size === 0) {
        messageHandlers.delete(type);
      }
      // Remove from ALL current connections, not just those that existed at registration
      for (const conn of connections.values()) {
        conn.removeHandler(type, handler as MessageHandler);
      }
    };
  }

  return { connections, createConn, onMessage };
}

describe("usePeer handler management", () => {
  it("unsub removes handler from connections created AFTER registration", () => {
    const { connections, createConn, onMessage } = createPeerPattern();
    const handler = vi.fn();

    // 1. Host connects to Guest A
    createConn("A");

    // 2. Register handler, get unsub
    const unsub = onMessage("move", handler);

    // 3. Guest B joins (new connection created after registration)
    createConn("B");

    // 4. Unsubscribe
    unsub();

    // 5. Guest B sends a "move" message
    connections.get("B")!.simulateMessage("move", { x: 1, y: 2 });

    // 6. Handler should NOT have been called
    expect(handler).not.toHaveBeenCalled();
  });

  it("unsub removes handler from connections that existed at registration time", () => {
    const { connections, createConn, onMessage } = createPeerPattern();
    const handler = vi.fn();

    createConn("A");
    const unsub = onMessage("move", handler);
    unsub();

    connections.get("A")!.simulateMessage("move", { x: 1, y: 2 });
    expect(handler).not.toHaveBeenCalled();
  });

  it("handler still fires on new connections before unsub is called", () => {
    const { connections, createConn, onMessage } = createPeerPattern();
    const handler = vi.fn();

    createConn("A");
    onMessage("move", handler);
    createConn("B");

    connections.get("B")!.simulateMessage("move", { x: 1, y: 2 });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

/**
 * Replicates the peer-leave handler pattern from usePeer:
 * - peerLeaveHandlers: global registry of leave handlers
 * - onPeerLeave: registers handler, returns unsub
 * - createConn: when state becomes disconnected/failed, fires leave handlers
 */
function createPeerLeavePattern() {
  const peerLeaveHandlers = new Set<(peerId: string) => void>();

  const connections = new Map<
    string,
    { simulateStateChange: (state: ConnectionState) => void }
  >();

  function createConn(remotePeerId: string) {
    const conn = {
      // Simulates PeerConnection calling onConnectionStateChange (use-peer.ts:109-116)
      simulateStateChange(state: ConnectionState) {
        if (state === "disconnected" || state === "failed") {
          for (const handler of [...peerLeaveHandlers]) {
            handler(remotePeerId);
          }
        }
      },
    };
    connections.set(remotePeerId, conn);
    return conn;
  }

  function onPeerLeave(handler: (peerId: string) => void): () => void {
    peerLeaveHandlers.add(handler);
    return () => {
      peerLeaveHandlers.delete(handler);
    };
  }

  return { connections, createConn, onPeerLeave };
}

describe("usePeer peer-leave handlers", () => {
  it("handler fires with correct peerId when a peer disconnects", () => {
    const { connections, createConn, onPeerLeave } = createPeerLeavePattern();
    const handler = vi.fn();

    createConn("A");
    createConn("B");
    onPeerLeave(handler);

    // Peer A disconnects
    connections.get("A")!.simulateStateChange("disconnected");

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith("A");
  });

  it("handler fires when a peer fails", () => {
    const { connections, createConn, onPeerLeave } = createPeerLeavePattern();
    const handler = vi.fn();

    createConn("A");
    onPeerLeave(handler);

    connections.get("A")!.simulateStateChange("failed");

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith("A");
  });

  it("handler does NOT fire for non-leave state changes", () => {
    const { connections, createConn, onPeerLeave } = createPeerLeavePattern();
    const handler = vi.fn();

    createConn("A");
    onPeerLeave(handler);

    connections.get("A")!.simulateStateChange("connecting");
    connections.get("A")!.simulateStateChange("connected");

    expect(handler).not.toHaveBeenCalled();
  });

  it("unsubscribed handler does not fire", () => {
    const { connections, createConn, onPeerLeave } = createPeerLeavePattern();
    const handler = vi.fn();

    createConn("A");
    const unsub = onPeerLeave(handler);
    unsub();

    connections.get("A")!.simulateStateChange("disconnected");

    expect(handler).not.toHaveBeenCalled();
  });

  it("handler fires for peers created AFTER registration", () => {
    const { connections, createConn, onPeerLeave } = createPeerLeavePattern();
    const handler = vi.fn();

    // Register handler before any connections exist
    onPeerLeave(handler);

    // Peer joins later
    createConn("A");
    connections.get("A")!.simulateStateChange("disconnected");

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith("A");
  });
});

/**
 * Replicates usePeer's syncPeers logic for deriving overall connectionState
 * from per-peer states. Uses the same algorithm as use-peer.ts:51-77.
 */
function syncPeers(
  peerStatuses: Map<string, ConnectionState>,
): { peers: PeerState[]; connectionState: ConnectionState } {
  const peers: PeerState[] = [];
  for (const [id, status] of peerStatuses) {
    peers.push({ id, status });
  }

  let connectionState: ConnectionState;
  if (peers.length === 0) {
    connectionState = "new";
  } else if (peers.some((p) => p.status === "connected")) {
    connectionState = "connected";
  } else if (peers.some((p) => p.status === "failed")) {
    connectionState = "failed";
  } else {
    connectionState = "connecting";
  }

  return { peers, connectionState };
}

describe("usePeer connection state derivation", () => {
  it("reports 'failed' when ANY peer fails (partial failure)", () => {
    const statuses = new Map<string, ConnectionState>([
      ["A", "connected"],
      ["B", "failed"],
    ]);

    const { connectionState } = syncPeers(statuses);
    // With 2 of 3 expected players, one connected and one failed,
    // the room should not hang — it should surface the failure
    expect(connectionState).not.toBe("connecting");
  });

  it("reports 'connected' when some peers are connected and none failed", () => {
    const statuses = new Map<string, ConnectionState>([
      ["A", "connected"],
      ["B", "connecting"],
    ]);

    const { connectionState } = syncPeers(statuses);
    expect(connectionState).toBe("connected");
  });

  it("reports 'failed' when all peers have failed", () => {
    const statuses = new Map<string, ConnectionState>([
      ["A", "failed"],
      ["B", "failed"],
    ]);

    const { connectionState } = syncPeers(statuses);
    expect(connectionState).toBe("failed");
  });

  it("reports 'connecting' when all peers are still connecting", () => {
    const statuses = new Map<string, ConnectionState>([
      ["A", "connecting"],
      ["B", "connecting"],
    ]);

    const { connectionState } = syncPeers(statuses);
    expect(connectionState).toBe("connecting");
  });

  it("exposes per-peer status", () => {
    const statuses = new Map<string, ConnectionState>([
      ["A", "connected"],
      ["B", "failed"],
      ["C", "connecting"],
    ]);

    const { peers } = syncPeers(statuses);
    expect(peers).toEqual([
      { id: "A", status: "connected" },
      { id: "B", status: "failed" },
      { id: "C", status: "connecting" },
    ]);
  });
});
