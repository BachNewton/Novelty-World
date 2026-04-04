import { createClient } from "@/shared/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { SignalingMessage } from "./types";

export interface SignalingChannel {
  /** The underlying Supabase Realtime channel */
  channel: RealtimeChannel;
  /** This peer's unique ID */
  peerId: string;
  /** Send an SDP offer/answer or ICE candidate to a specific peer */
  sendSignal: (message: Omit<SignalingMessage, "from">) => void;
  /** Listen for signaling messages addressed to this peer. Returns unsubscribe fn. */
  onSignal: (callback: (message: SignalingMessage) => void) => () => void;
  /** Listen for peers joining via Presence. Returns unsubscribe fn. */
  onPeerJoined: (callback: (peerId: string) => void) => () => void;
  /** Promise that resolves when the channel is subscribed and presence is tracked */
  ready: Promise<void>;
  /** Clean up: untrack presence, remove channel */
  destroy: () => void;
}

export function createSignalingChannel(
  roomId: string,
  peerId: string,
): SignalingChannel {
  const supabase = createClient();
  const channel = supabase.channel(`room:${roomId}`);

  const signalListeners = new Set<(msg: SignalingMessage) => void>();
  const peerJoinedListeners = new Set<(peerId: string) => void>();
  let destroyed = false;

  // Listen for broadcast signaling messages (SDP/ICE)
  channel.on("broadcast", { event: "signal" }, ({ payload }) => {
    const msg = payload as SignalingMessage;
    // Ignore our own messages and messages not addressed to us
    if (msg.from === peerId) return;
    if (msg.to !== peerId && msg.to !== "*") return;
    // Snapshot to avoid calling listeners added during iteration
    for (const listener of [...signalListeners]) {
      listener(msg);
    }
  });

  // Listen for Presence join events (peer discovery)
  channel.on("presence", { event: "join" }, ({ newPresences }) => {
    for (const presence of newPresences) {
      const joinedId = presence.peerId as string;
      if (joinedId === peerId) continue;
      for (const listener of [...peerJoinedListeners]) {
        listener(joinedId);
      }
    }
  });

  // Subscribe and track presence
  const ready = new Promise<void>((resolve, reject) => {
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        try {
          await channel.track({ peerId });
          resolve();
        } catch (err) {
          reject(err);
        }
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        reject(new Error(`Channel subscription failed: ${status}`));
      }
    });
  });

  return {
    channel,
    peerId,

    sendSignal(message) {
      if (destroyed) return;
      channel.send({
        type: "broadcast",
        event: "signal",
        payload: { ...message, from: peerId },
      });
    },

    onSignal(callback) {
      signalListeners.add(callback);
      return () => {
        signalListeners.delete(callback);
      };
    },

    onPeerJoined(callback) {
      peerJoinedListeners.add(callback);
      return () => {
        peerJoinedListeners.delete(callback);
      };
    },

    ready,

    destroy() {
      if (destroyed) return;
      destroyed = true;
      signalListeners.clear();
      peerJoinedListeners.clear();
      supabase.removeChannel(channel);
    },
  };
}
