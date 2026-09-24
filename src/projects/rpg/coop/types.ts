/**
 * Co-op wire message types (chunk 0: transport foundation).
 *
 * Chunk 1 (presence + remote avatars) consumes `pos` / `peer-left`.
 * Chunk 2 (shared map editing) consumes `tiles` / `snapshot` /
 * `snapshot-request` / `clear`. This module only defines and validates the
 * shapes — game-loop wiring lives in later chunks.
 *
 * Size notes (from the idea doc): a `pos` message is ~140 B on the wire;
 * each `tiles` cell is ~15 B plus ~100 B envelope per batch.
 */

export const COOP_HOST_ID = "novelty-rpg-world";

/** Guest re-election cadence when the host is unreachable (compat field). */
export const REELECT_RETRY_MS = 1500;

/** Per-room query param for test/dev isolation; prod ignores it. */
export const COOP_ROOM_PARAM = "coop-room";
export const COOP_ROOM_MAX_LENGTH = 64;

/** Map bounds shared with `map-editor.tsx` (40x28). */
export const COOP_MAP_COLS = 40;
export const COOP_MAP_ROWS = 28;

export type AvatarDir = "front" | "side" | "back";

export interface PosPayload {
  x: number;
  y: number;
  dir: AvatarDir;
  flip: boolean;
  moving: boolean;
  /** Optional character identity; omitted if unset. */
  characterId?: string;
  /** Monotonic send timestamp for keepalive gate. */
  timestamp: number;
}

export interface WireTile {
  src: string;
  sx: number;
  sy: number;
}

export interface TileCell {
  c: number;
  r: number;
  tile: WireTile | null;
  seq: number;
  author: string;
}

interface MessageBase {
  from: string;
}

export interface PosMessage extends MessageBase {
  kind: "pos";
  pos: PosPayload;
}

export interface TilesMessage extends MessageBase {
  kind: "tiles";
  cells: TileCell[];
}

export interface SnapshotRequestMessage extends MessageBase {
  kind: "snapshot-request";
}

export interface SnapshotMessage extends MessageBase {
  kind: "snapshot";
  /** Sparse list of non-null cells (a few KB typical). */
  cells: TileCell[];
}

export interface ClearMessage extends MessageBase {
  kind: "clear";
  seq: number;
}

/**
 * Host-synthesized only — never sent by clients. Dropped off the wire if
 * spoofed. `peerId` is the id of the peer that left.
 */
export interface PeerLeftMessage extends MessageBase {
  kind: "peer-left";
  peerId: string;
}

export type CoopMessage =
  | PosMessage
  | TilesMessage
  | SnapshotRequestMessage
  | SnapshotMessage
  | ClearMessage
  | PeerLeftMessage;

/** Client-sendable subset: everything except host-synthesized `peer-left`. */
export type SendableMessage =
  | Omit<PosMessage, "from">
  | Omit<TilesMessage, "from">
  | Omit<SnapshotRequestMessage, "from">
  | Omit<SnapshotMessage, "from">
  | Omit<ClearMessage, "from">;

/** Outbound shape: callers omit `from`; the transport stamps the peer id. */
export type OutboundMessage = SendableMessage & { from?: never };

const MESSAGE_KINDS = new Set([
  "pos",
  "tiles",
  "snapshot-request",
  "snapshot",
  "clear",
  "peer-left",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isPosPayload(value: unknown): value is PosPayload {
  if (!isRecord(value)) return false;
  return (
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    (value.dir === "front" ||
      value.dir === "side" ||
      value.dir === "back") &&
    typeof value.flip === "boolean" &&
    typeof value.moving === "boolean" &&
    (value.characterId === undefined ||
      typeof value.characterId === "string") &&
    isFiniteNumber(value.timestamp)
  );
}

export function isTileCell(value: unknown): value is TileCell {
  if (!isRecord(value)) return false;
  if (
    !Number.isInteger(value.c) ||
    !Number.isInteger(value.r) ||
    (value.c as number) < 0 ||
    (value.c as number) >= COOP_MAP_COLS ||
    (value.r as number) < 0 ||
    (value.r as number) >= COOP_MAP_ROWS
  ) {
    return false;
  }
  if (
    !Number.isInteger(value.seq) ||
    (value.seq as number) < 0 ||
    !isFiniteNumber(value.seq)
  ) {
    return false;
  }
  if (typeof value.author !== "string" || value.author.length === 0) {
    return false;
  }
  const tile = value.tile;
  if (tile === null) return true;
  if (!isRecord(tile)) return false;
  return (
    typeof tile.src === "string" &&
    tile.src.length > 0 &&
    Number.isInteger(tile.sx) &&
    Number.isInteger(tile.sy)
  );
}

/** Trust peers for content, validate the envelope + bounds. */
export function isCoopMessage(value: unknown): value is CoopMessage {
  if (!isRecord(value)) return false;
  if (typeof value.from !== "string" || value.from.length === 0) return false;
  if (typeof value.kind !== "string" || !MESSAGE_KINDS.has(value.kind)) {
    return false;
  }
  switch (value.kind) {
    case "pos":
      return isPosPayload(value.pos);
    case "tiles":
      return (
        Array.isArray(value.cells) &&
        value.cells.length > 0 &&
        value.cells.every(isTileCell)
      );
    case "snapshot-request":
      return true;
    case "snapshot":
      return (
        Array.isArray(value.cells) && value.cells.every(isTileCell)
      );
    case "clear":
      return (
        Number.isInteger(value.seq) &&
        (value.seq as number) >= 0 &&
        isFiniteNumber(value.seq)
      );
    case "peer-left":
      return typeof value.peerId === "string" && value.peerId.length > 0;
    default:
      return false;
  }
}

/**
 * Sanitize the `?coop-room=` query param: non-empty, <= 64 chars,
 * charset [A-Za-z0-9_-]; otherwise fall back to the default room.
 */
export function sanitizeCoopRoomId(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return COOP_HOST_ID;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > COOP_ROOM_MAX_LENGTH) {
    return COOP_HOST_ID;
  }
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) return COOP_HOST_ID;
  return trimmed;
}

/** Transport role in the star topology. */
export type CoopRole = "host" | "guest" | null;

/** Transport connection status. */
export type CoopStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "closed";

/** Snapshot of the transport state exposed to hooks/UI. */
export interface CoopState {
  role: CoopRole;
  status: CoopStatus;
  /** This peer's id once the PeerJS handshake completes. */
  peerId: string | null;
  /** Host view: connected guest ids. Guest view: [hostId] when linked. */
  peers: string[];
}

/** Options for creating a transport (hostId/reelectRetryMs are compat fields). */
export interface CoopTransportOptions {
  hostId?: string;
  reelectRetryMs?: number;
}

/** Message handler type for transport subscriptions. */
export type CoopMessageHandler = (msg: CoopMessage) => void;

/** State handler type for transport subscriptions. */
export type CoopStateHandler = (state: CoopState) => void;

/** Transport interface returned by `createCoopTransport`. */
export interface CoopTransport {
  getState(): CoopState;
  onMessage(handler: CoopMessageHandler): () => void;
  onStateChange(handler: CoopStateHandler): () => void;
  send(msg: OutboundMessage): void;
  start(): void;
  destroy(): void;
}