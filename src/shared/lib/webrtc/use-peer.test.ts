import { describe, it, expect, vi } from "vitest";
import type { MessageHandler, DataMessage } from "./types";

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

  it("handler fires on new connections before unsub is called", () => {
    const { connections, createConn, onMessage } = createPeerPattern();
    const handler = vi.fn();

    createConn("A");
    onMessage("move", handler);
    createConn("B");

    connections.get("B")!.simulateMessage("move", { x: 1, y: 2 });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
