/**
 * Tiny WebSocket relay server for e2e tests.
 *
 * Replaces Supabase Realtime for signaling and lobby presence in tests.
 * Each named channel is a room — messages are relayed to all other
 * WebSocket connections in that room.
 */
import { WebSocketServer, WebSocket } from "ws";

const PORT = 3002;

interface Client {
  ws: WebSocket;
  id: string;
  channels: Set<string>;
}

interface RelayMessage {
  action: "join" | "leave" | "broadcast" | "track" | "untrack" | "presence";
  channel: string;
  senderId: string;
  event?: string;
  payload?: unknown;
  presenceData?: Record<string, unknown>;
}

// Channel state
const channels = new Map<string, Set<Client>>();
const presence = new Map<string, Map<string, Record<string, unknown>>>();

function getChannel(name: string): Set<Client> {
  let set = channels.get(name);
  if (!set) {
    set = new Set();
    channels.set(name, set);
  }
  return set;
}

function getPresence(name: string): Map<string, Record<string, unknown>> {
  let map = presence.get(name);
  if (!map) {
    map = new Map();
    presence.set(name, map);
  }
  return map;
}

function relay(channel: string, sender: Client, msg: RelayMessage) {
  const clients = getChannel(channel);
  const data = JSON.stringify(msg);
  for (const client of clients) {
    if (client !== sender && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(data);
    }
  }
}

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws) => {
  const client: Client = {
    ws,
    id: Math.random().toString(36).slice(2, 10),
    channels: new Set(),
  };

  ws.on("message", (raw) => {
    const msg: RelayMessage = JSON.parse(raw.toString());

    switch (msg.action) {
      case "join": {
        const ch = getChannel(msg.channel);
        ch.add(client);
        client.channels.add(msg.channel);
        // Send current presence state to the new client
        const pres = getPresence(msg.channel);
        const presState: Record<string, Record<string, unknown>[]> = {};
        for (const [key, data] of pres.entries()) {
          presState[key] = [data];
        }
        ws.send(
          JSON.stringify({
            action: "presence",
            channel: msg.channel,
            senderId: "server",
            payload: presState,
          }),
        );
        break;
      }
      case "leave": {
        const ch = channels.get(msg.channel);
        if (ch) {
          ch.delete(client);
          client.channels.delete(msg.channel);
        }
        break;
      }
      case "track": {
        const pres = getPresence(msg.channel);
        pres.set(msg.senderId, msg.presenceData!);
        // Notify others of the new presence
        relay(msg.channel, client, msg);
        break;
      }
      case "untrack": {
        const pres = getPresence(msg.channel);
        pres.delete(msg.senderId);
        relay(msg.channel, client, msg);
        break;
      }
      case "broadcast": {
        relay(msg.channel, client, msg);
        break;
      }
    }
  });

  ws.on("close", () => {
    // Clean up all channels this client was in
    for (const chName of client.channels) {
      const ch = channels.get(chName);
      if (ch) {
        ch.delete(client);
      }
      const pres = presence.get(chName);
      if (pres) {
        // Find and remove any presence tracked by this client
        // (we track by senderId, not client, so we can't directly clean up here
        // — the application layer handles this via untrack on component cleanup)
      }
    }
  });
});

console.log(`WS relay server listening on port ${PORT}`);
