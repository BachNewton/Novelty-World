/**
 * Mock Supabase client for e2e tests.
 *
 * Connects to a local WebSocket relay server (e2e/ws-relay.ts) instead
 * of Supabase Realtime. This eliminates rate limits and external
 * dependencies while keeping all WebRTC and multiplayer lib code unchanged.
 *
 * Only implements the subset of the Supabase API used by:
 *   - signaling.ts (broadcast messages + presence for peer discovery)
 *   - use-lobby.ts (presence for room discovery)
 */

const WS_URL = "ws://localhost:3002";

// --- Types ---

interface PresencePayload {
  key: string;
  newPresences: Record<string, unknown>[];
  currentPresences: Record<string, unknown>[];
  leftPresences: Record<string, unknown>[];
}

type EventCallback = (payload: Record<string, unknown>) => void;
type PresenceCallback = (payload: PresencePayload) => void;
type SubscribeCallback = (status: string) => void;

interface RelayMessage {
  action: "join" | "leave" | "broadcast" | "track" | "untrack" | "presence";
  channel: string;
  senderId: string;
  event?: string;
  payload?: unknown;
  presenceData?: Record<string, unknown>;
}

// --- Mock Channel ---

let channelCounter = 0;

class MockChannel {
  private ws: WebSocket | null = null;
  private broadcastListeners = new Map<string, Set<EventCallback>>();
  private presenceJoinListeners = new Set<PresenceCallback>();
  private presenceSyncListeners = new Set<() => void>();
  private presenceState_ = new Map<string, Record<string, unknown>>();
  private id = `mc-${++channelCounter}-${Math.random().toString(36).slice(2, 6)}`;
  private destroyed = false;
  private pendingMessages: RelayMessage[] = [];
  private connected = false;

  constructor(public readonly name: string) {}

  // --- Supabase API surface ---

  on(
    type: "broadcast" | "presence",
    filter: { event: string },
    callback: EventCallback | PresenceCallback,
  ): this {
    if (type === "broadcast") {
      let set = this.broadcastListeners.get(filter.event);
      if (!set) {
        set = new Set();
        this.broadcastListeners.set(filter.event, set);
      }
      set.add(callback as EventCallback);
    } else {
      // presence
      if (filter.event === "join") {
        this.presenceJoinListeners.add(callback as PresenceCallback);
      } else if (filter.event === "sync") {
        this.presenceSyncListeners.add(callback as () => void);
      }
    }
    return this;
  }

  subscribe(callback: SubscribeCallback): this {
    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      this.connected = true;
      // Join the channel on the relay server
      this.sendRelay({ action: "join", channel: this.name, senderId: this.id });
      // Flush pending messages
      for (const msg of this.pendingMessages) {
        this.sendRelay(msg);
      }
      this.pendingMessages = [];
      callback("SUBSCRIBED");
    };

    this.ws.onmessage = (ev: MessageEvent) => {
      if (this.destroyed) return;
      const msg: RelayMessage = JSON.parse(ev.data as string);
      if (msg.channel !== this.name) return;
      if (msg.senderId === this.id) return;

      switch (msg.action) {
        case "broadcast":
          this.handleBroadcast(msg);
          break;
        case "track":
          this.handlePresenceTrack(msg);
          break;
        case "untrack":
          this.handlePresenceUntrack(msg);
          break;
        case "presence":
          // Initial presence state from server
          this.handlePresenceSync(msg.payload as Record<string, Record<string, unknown>[]>);
          break;
      }
    };

    this.ws.onerror = () => {
      callback("CHANNEL_ERROR");
    };

    return this;
  }

  async track(data: Record<string, unknown>): Promise<void> {
    this.presenceState_.set(this.id, data);
    this.sendRelay({
      action: "track",
      channel: this.name,
      senderId: this.id,
      presenceData: data,
    });
  }

  async untrack(): Promise<void> {
    this.presenceState_.delete(this.id);
    this.sendRelay({
      action: "untrack",
      channel: this.name,
      senderId: this.id,
    });
  }

  send(message: { type: string; event: string; payload: unknown }): void {
    if (this.destroyed) return;
    this.sendRelay({
      action: "broadcast",
      channel: this.name,
      senderId: this.id,
      event: message.event,
      payload: message.payload,
    });
  }

  presenceState(): Record<string, Record<string, unknown>[]> {
    const state: Record<string, Record<string, unknown>[]> = {};
    for (const [key, data] of this.presenceState_.entries()) {
      state[key] = [data];
    }
    return state;
  }

  // --- Internal ---

  private sendRelay(msg: RelayMessage): void {
    if (this.destroyed) return;
    if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.pendingMessages.push(msg);
      return;
    }
    this.ws.send(JSON.stringify(msg));
  }

  private handleBroadcast(msg: RelayMessage): void {
    const listeners = this.broadcastListeners.get(msg.event!);
    if (!listeners) return;
    for (const cb of [...listeners]) {
      cb({ payload: msg.payload } as Record<string, unknown>);
    }
  }

  private handlePresenceTrack(msg: RelayMessage): void {
    const isNew = !this.presenceState_.has(msg.senderId);
    this.presenceState_.set(msg.senderId, msg.presenceData!);

    if (isNew) {
      const payload: PresencePayload = {
        key: msg.senderId,
        newPresences: [msg.presenceData!],
        currentPresences: Array.from(this.presenceState_.values()),
        leftPresences: [],
      };
      for (const cb of [...this.presenceJoinListeners]) {
        cb(payload);
      }
    }

    for (const cb of [...this.presenceSyncListeners]) {
      cb();
    }
  }

  private handlePresenceUntrack(msg: RelayMessage): void {
    this.presenceState_.delete(msg.senderId);
    for (const cb of [...this.presenceSyncListeners]) {
      cb();
    }
  }

  private handlePresenceSync(state: Record<string, Record<string, unknown>[]>): void {
    for (const [key, presences] of Object.entries(state)) {
      for (const data of presences) {
        const isNew = !this.presenceState_.has(key);
        this.presenceState_.set(key, data);
        // Fire join listeners for peers that were already present when we connected
        if (isNew) {
          const payload: PresencePayload = {
            key,
            newPresences: [data],
            currentPresences: Array.from(this.presenceState_.values()),
            leftPresences: [],
          };
          for (const cb of [...this.presenceJoinListeners]) {
            cb(payload);
          }
        }
      }
    }
    for (const cb of [...this.presenceSyncListeners]) {
      cb();
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.broadcastListeners.clear();
    this.presenceJoinListeners.clear();
    this.presenceSyncListeners.clear();
    this.presenceState_.clear();
    this.pendingMessages = [];
    if (this.ws) {
      this.sendRelay({ action: "leave", channel: this.name, senderId: this.id });
      this.ws.close();
      this.ws = null;
    }
  }
}

// --- Mock Client ---

export function createMockSupabaseClient(): Record<string, unknown> {
  const allChannels = new Set<MockChannel>();

  return {
    channel(name: string) {
      const ch = new MockChannel(name);
      allChannels.add(ch);
      return ch;
    },
    removeChannel(channel: MockChannel) {
      channel.destroy();
      allChannels.delete(channel);
    },
    removeAllChannels() {
      for (const ch of allChannels) {
        ch.destroy();
      }
      allChannels.clear();
    },
  };
}
