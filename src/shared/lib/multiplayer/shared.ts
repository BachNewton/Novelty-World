import type { MessageHandler, DataMessage } from "../webrtc";
import type { PlayerInfo } from "./types";
import { GAME_PREFIX } from "./types";

/** Generate a random 4-char uppercase room code */
export function generateRoomCode(): string {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

/**
 * Create namespaced messaging functions that prefix all types with GAME_PREFIX.
 * Both useLobbyRoom and useWorldRoom use this to isolate game messages from
 * internal protocol messages.
 */
export function createNamespacedMessaging(
  peerSend: <T>(type: string, payload: T) => void,
  peerSendTo: <T>(peerId: string, type: string, payload: T) => void,
  peerOnMessage: <T>(type: string, handler: MessageHandler<T>) => () => void,
) {
  const send = <T,>(type: string, payload: T): void => {
    peerSend(GAME_PREFIX + type, payload);
  };

  const sendTo = <T,>(peerId: string, type: string, payload: T): void => {
    peerSendTo(peerId, GAME_PREFIX + type, payload);
  };

  const onMessage = <T,>(type: string, handler: MessageHandler<T>): (() => void) => {
    return peerOnMessage(GAME_PREFIX + type, (msg) => {
      handler({ ...msg, type } as DataMessage<T>);
    });
  };

  return { send, sendTo, onMessage };
}

/**
 * Try to update a roster entry for a reconnecting player (same playerId, new peerId).
 *
 * Used by useLobbyRoom so the reconnection logic stays consistent.
 *
 * Returns the updated array and matched index, or null if the playerId was not found.
 */
export function applyReconnect<T extends Pick<PlayerInfo, "playerId" | "peerId" | "playerName">>(
  roster: T[],
  playerId: string,
  newPeerId: string,
  playerName: string,
): { roster: T[]; index: number } | null {
  const index = roster.findIndex((e) => e.playerId === playerId);
  if (index === -1) return null;

  const updated = [...roster];
  updated[index] = { ...updated[index], peerId: newPeerId, playerName };
  return { roster: updated, index };
}
