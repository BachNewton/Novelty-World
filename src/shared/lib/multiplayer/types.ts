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
  /** Total capacity including host. Undefined = no limit (open room). */
  maxPlayers?: number;
  createdAt: number;
}

export interface UseGameRoomOptions {
  /** Lobby channel name — determines which game's rooms are visible */
  game: string;
  /** Total players including the host. Omit for open rooms where host starts manually via start(). */
  maxPlayers?: number;
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

  /** Manually start the game. Required when maxPlayers is omitted. No-op if room already transitioned. */
  start: () => void;

  // Messaging — only usable after phase is "ready"
  send: <T>(type: string, payload: T) => void;
  sendTo: <T>(peerId: string, type: string, payload: T) => void;
  onMessage: <T>(type: string, handler: MessageHandler<T>) => () => void;

  // Player events
  /** Listen for individual players leaving (disconnected or failed). Returns unsubscribe fn. */
  onPlayerLeave: (handler: (peerId: string) => void) => () => void;

  // Lifecycle
  leave: () => void;
}

/** Internal protocol message prefix — never exposed to game code */
export const MP_PREFIX = "__mp:";

/** Game message prefix — applied automatically by useGameRoom */
export const GAME_PREFIX = "__game:";

export type { PeerState, DataMessage, MessageHandler };
