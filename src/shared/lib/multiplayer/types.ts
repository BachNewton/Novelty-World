import type { PeerState, DataMessage, MessageHandler } from "../webrtc";

export type RoomPhase =
  | "lobby"
  | "waiting"
  | "connecting"
  | "ready"
  | "disconnected"
  | "failed";

/** A room visible in the lobby */
export interface LobbyRoom {
  roomCode: string;
  game: string;
  playerCount: number;
  maxPlayers: number;
  createdAt: number;
}

export interface UseGameRoomOptions {
  /** Lobby channel name — determines which game's rooms are visible */
  game: string;
  /** Total players including the host */
  maxPlayers: number;
}

export interface GameRoom {
  // Lobby
  rooms: LobbyRoom[];
  createRoom: () => void;
  joinRoom: (code: string) => void;

  // State
  phase: RoomPhase;
  roomCode: string | null;
  isHost: boolean;
  players: PeerState[];

  // Messaging — only usable after phase is "ready"
  send: <T>(type: string, payload: T) => void;
  sendTo: <T>(peerId: string, type: string, payload: T) => void;
  onMessage: <T>(type: string, handler: MessageHandler<T>) => () => void;

  // Lifecycle
  leave: () => void;
}

/** Internal protocol message prefix — never exposed to game code */
export const MP_PREFIX = "__mp:";

/** Game message prefix — applied automatically by useGameRoom */
export const GAME_PREFIX = "__game:";

export type { PeerState, DataMessage, MessageHandler };
