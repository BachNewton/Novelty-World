import type { PeerState, DataMessage, MessageHandler, ConnectionState } from "../webrtc";

// --- Shared types ---

/** Player profile — persistent identity for a client */
export interface PlayerProfile {
  id: string;
  name: string;
}

/** A room visible in the lobby */
export interface LobbyRoom {
  roomCode: string;
  game: string;
  playerCount: number;
  createdAt: number;
}

/** A player in the room roster — persistent identity + live connection status */
export interface PlayerInfo {
  /** Persistent profile ID (survives reconnects) */
  playerId: string;
  /** Display name (can change) */
  playerName: string;
  /** Ephemeral WebRTC peer ID (changes on reconnect) */
  peerId: string;
  /** Live connection status */
  status: ConnectionState;
}

// --- Lobby Room types ---

export type LobbyRoomPhase =
  | "lobby"
  | "waiting"
  | "connecting"
  | "ready"
  | "disconnected"
  | "failed";

export interface UseLobbyRoomOptions {
  /** Lobby channel name — determines which game's rooms are visible */
  game: string;
  /** Player profile — persistent identity for this client */
  profile: PlayerProfile;
}

export interface LobbyRoomState {
  // Lobby
  rooms: LobbyRoom[];
  createRoom: () => void;
  joinRoom: (code: string) => void;

  // State
  phase: LobbyRoomPhase;
  roomCode: string | null;
  isHost: boolean;
  players: PeerState[];

  // Player identity
  /** This client's persistent player ID (from profile) */
  playerId: string;
  /** All players in the room with persistent identity and live connection status */
  playerRoster: PlayerInfo[];

  /** Manually start the game. Host-only, only callable during "waiting" phase. */
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

// --- World Room types ---

export type WorldRoomPhase =
  | "lobby"
  | "joined"
  | "disconnected"
  | "failed";

export interface UseWorldRoomOptions {
  /** Lobby channel name — determines which game's rooms are visible */
  game: string;
  /** Player profile — persistent identity for this client */
  profile: PlayerProfile;
}

export interface WorldRoomState {
  // Lobby
  rooms: LobbyRoom[];
  create: () => void;
  join: (code: string) => void;

  // State
  phase: WorldRoomPhase;
  roomCode: string | null;

  // Player identity
  /** This client's persistent player ID (from profile) */
  playerId: string;
  /** All players currently known (self + announced peers) */
  playerRoster: PlayerInfo[];

  // Messaging — usable immediately after joining
  send: <T>(type: string, payload: T) => void;
  sendTo: <T>(peerId: string, type: string, payload: T) => void;
  onMessage: <T>(type: string, handler: MessageHandler<T>) => () => void;

  // Player events
  /** Listen for new players joining. Returns unsubscribe fn. */
  onPlayerJoin: (handler: (player: PlayerInfo) => void) => () => void;
  /** Listen for players leaving (disconnected or failed). Returns unsubscribe fn. */
  onPlayerLeave: (handler: (peerId: string) => void) => () => void;

  // Lifecycle
  leave: () => void;
}

/** Internal protocol message prefix — never exposed to game code */
export const MP_PREFIX = "__mp:";

/** Game message prefix — applied automatically by room hooks */
export const GAME_PREFIX = "__game:";

export type { PeerState, DataMessage, MessageHandler };
