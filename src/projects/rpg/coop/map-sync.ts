/**
 * Shared map editing sync (chunk 2): LWW per cell, host rebroadcasts,
 * join snapshot, clear broadcast.
 *
 * - `useEditorMapSync`: binds to map-editor's `paintAt`/`handleClear`.
 *   Outbound drag paints dedupe per cell and flush one `tiles` array
 *   message per paint event; `clear {seq}` bumps seq past max-seen.
 * - `usePlayMapSync`: subscribes to `tiles`/`snapshot`/`clear` and merges
 *   into the play canvas's `mapRef` live; answers `snapshot-request`.
 * - LWW: receivers apply iff incoming `(seq, author)` beats stored
 *   per cell; ties broken by author string. No CRDT needed at 1120 cells.
 * - Join flow: snapshot requested on mount and on every reconnect;
 *   responders send sparse non-null cells chunked at ~16 KB; all inbound
 *   cells go through `sanitizeInboundCells` (bounds + manifest src +
 *   legacy `/tiles/` migration) then LWW.
 * - Shared transport: both bindings use `getSharedCoopTransport(roomId)`
 *   so presence + map-sync share one PeerJS peer per tab.
 */

"use client";

import { useEffect, useRef } from "react";
import {
  COOP_HOST_ID,
  COOP_MAP_COLS,
  COOP_MAP_ROWS,
  COOP_ROOM_PARAM,
  sanitizeCoopRoomId,
  type CoopMessage,
  type CoopState,
  type CoopTransport,
  type OutboundMessage,
  type TileCell,
} from "./types";
import { sheetForTileSrc } from "../tile-anim";
import type { MapGrid, PlacedTile } from "../map-editor";

export const SNAPSHOT_CHUNK_BYTES = 16 * 1024;

export type SeqEntry = { seq: number; author: string };
export type SeqMap = Map<string, SeqEntry>; // key: `${c},${r}`

export interface SyncTile {
  src: string;
  sx: number;
  sy: number;
}

export type PaintClock = number; // monotonic local seq

export interface EditorSyncCore {
  /** Queue a local paint/erase; stamps seq, sends `tiles` array. */
  queueLocalPaint: (c: number, r: number, tile: SyncTile | null) => void;
  /** Broadcast `clear {seq}` with seq > any seen. */
  broadcastClear: () => void;
}

/** Single-room transport singleton map (roomId -> CoopTransport). */
const transportByRoom = new Map<string, CoopTransport>();

export function getSharedCoopTransport(roomId: string = COOP_HOST_ID): CoopTransport {
  const key = sanitizeCoopRoomId(roomId);
  let t = transportByRoom.get(key);
  if (t === undefined || t.getState().status === "closed") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createCoopTransport } = require("./transport") as {
      createCoopTransport: (opts?: { hostId?: string }) => CoopTransport;
    };
    t = createCoopTransport({ hostId: key });
    transportByRoom.set(key, t);
  }
  return t;
}

/** Resolve the room id from the current URL (client-only, post-mount). */
export function getCoopRoomId(): string {
  if (typeof window === "undefined") return COOP_HOST_ID;
  const params = new URLSearchParams(window.location.search);
  return sanitizeCoopRoomId(params.get(COOP_ROOM_PARAM));
}

/** Check if incoming seq/author beats stored per cell. */
export function beatsCell(
  incomingSeq: number,
  incomingAuthor: string,
  stored: SeqEntry | undefined,
): boolean {
  if (!stored) return true;
  if (incomingSeq !== stored.seq) return incomingSeq > stored.seq;
  return incomingAuthor > stored.author;
}

/** Validate + sanitize inbound cells: bounds, manifest src, legacy migrate. */
export function sanitizeInboundCells(cells: TileCell[]): TileCell[] {
  const out: TileCell[] = [];
  for (const cell of cells) {
    if (
      cell.c < 0 ||
      cell.c >= COOP_MAP_COLS ||
      cell.r < 0 ||
      cell.r >= COOP_MAP_ROWS
    ) continue;
    const tile = cell.tile;
    if (tile !== null) {
      const src = tile.src;
      // Legacy migration: old `/tiles/` prefix
      const normalizedSrc = src.startsWith("/tiles/")
        ? src.replace("/tiles/", "/rpg/tiles/")
        : src;
      const sheet = sheetForTileSrc(normalizedSrc);
      if (!sheet) continue;
      if (!Number.isInteger(tile.sx) || !Number.isInteger(tile.sy)) continue;
      out.push({ ...cell, tile: { ...tile, src: normalizedSrc } });
    } else {
      out.push(cell);
    }
  }
  return out;
}

/** Apply sanitized cells to grid via LWW with seq map. */
export function applyCellsToGrid(
  grid: MapGrid,
  seqMap: SeqMap,
  cells: TileCell[],
): boolean {
  let changed = false;
  for (const cell of cells) {
    const key = `${cell.c},${cell.r}`;
    const stored = seqMap.get(key);
    if (beatsCell(cell.seq, cell.author, stored)) {
      seqMap.set(key, { seq: cell.seq, author: cell.author });
      if (cell.tile === null) {
        if (grid[cell.r][cell.c] !== null) {
          grid[cell.r][cell.c] = null;
          changed = true;
        }
      } else {
        const next: PlacedTile = {
          src: cell.tile.src,
          sx: cell.tile.sx,
          sy: cell.tile.sy,
        };
        const existing = grid[cell.r][cell.c];
        if (!existing || existing.src !== next.src || existing.sx !== next.sx || existing.sy !== next.sy) {
          grid[cell.r][cell.c] = next;
          changed = true;
        }
      }
    }
  }
  return changed;
}

/** Apply clear: wipe grid and bump seq to beat any in-flight stale cells. */
export function applyClearToGrid(
  grid: MapGrid,
  seqMap: SeqMap,
  seq: number,
): boolean {
  const newSeq = seq + 1;
  for (const [key, entry] of seqMap.entries()) {
    if (entry.seq < newSeq) {
      seqMap.set(key, { seq: newSeq, author: entry.author });
    }
  }
  let changed = false;
  for (let r = 0; r < COOP_MAP_ROWS; r++) {
    for (let c = 0; c < COOP_MAP_COLS; c++) {
      if (grid[r][c] !== null) {
        grid[r][c] = null;
        changed = true;
      }
    }
  }
  return changed;
}

/** Build sparse snapshot: only non-null cells, chunked at ~16 KB. */
export function buildSnapshotCells(grid: MapGrid): TileCell[] {
  const out: TileCell[] = [];
  for (let r = 0; r < COOP_MAP_ROWS; r++) {
    for (let c = 0; c < COOP_MAP_COLS; c++) {
      const cell = grid[r][c];
      if (cell !== null) {
        out.push({ c, r, tile: cell, seq: 0, author: "" }); // seq/author filled by caller
      }
    }
  }
  return out;
}

/** Chunk cells array into ~16 KB JSON chunks. */
export function chunkCells(cells: TileCell[]): TileCell[][] {
  const chunks: TileCell[][] = [];
  let current: TileCell[] = [];
  let currentBytes = 0;
  for (const cell of cells) {
    const json = JSON.stringify(cell);
    if (currentBytes + json.length > SNAPSHOT_CHUNK_BYTES && current.length > 0) {
      chunks.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(cell);
    currentBytes += json.length;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/** Highest seq seen across all cells (for clear bumping). */
export function maxCellSeq(seqMap: SeqMap): number {
  let max = 0;
  for (const entry of seqMap.values()) {
    if (entry.seq > max) max = entry.seq;
  }
  return max;
}

/** Validate a paint src against the tile manifest. */
export function isValidPaintSrc(src: string): boolean {
  return !!sheetForTileSrc(src);
}

/** Key for a cell in the seq map. */
export function cellKey(c: number, r: number): string {
  return `${c},${r}`;
}

/** Create a local paint clock and seq map for the editor. */
export function createEditorSyncCore(
  gridRef: { current: MapGrid },
  seqMap: SeqMap,
  send: (msg: OutboundMessage) => void,
): EditorSyncCore {
  let localSeq = 0;
  return {
    queueLocalPaint(c: number, r: number, tile: SyncTile | null): void {
      localSeq += 1;
      const cell: TileCell = {
        c,
        r,
        tile,
        seq: localSeq,
        author: "local", // placeholder; transport stamps real `from`
      };
      send({ kind: "tiles", cells: [cell] });
    },
    broadcastClear(): void {
      const newSeq = Math.max(localSeq, maxCellSeq(seqMap)) + 1;
      localSeq = newSeq;
      send({ kind: "clear", seq: newSeq });
    },
  };
}

export interface EditorMapSyncApi {
  queueLocalPaint: (c: number, r: number, tile: SyncTile | null) => void;
  broadcastClear: () => void;
}

/** Bind editor paint/clear to the co-op transport. */
export function useEditorMapSync(
  gridRef: React.MutableRefObject<MapGrid>,
  setGrid: React.Dispatch<React.SetStateAction<MapGrid>>,
  roomId: string = getCoopRoomId(),
): EditorMapSyncApi {
  const seqMapRef = useRef<SeqMap>(new Map());
  const transportRef = useRef<CoopTransport | null>(null);

  useEffect(() => {
    const transport = getSharedCoopTransport(roomId);
    transportRef.current = transport;

    const offMessage = transport.onMessage((msg) => {
      if (msg.kind === "tiles") {
        const sanitized = sanitizeInboundCells(msg.cells);
        if (sanitized.length === 0) return;
        const grid = gridRef.current.map((row) => row.slice());
        applyCellsToGrid(grid, seqMapRef.current, sanitized);
        setGrid(grid);
      } else if (msg.kind === "snapshot") {
        const sanitized = sanitizeInboundCells(msg.cells);
        if (sanitized.length === 0) return;
        const grid = gridRef.current.map((row) => row.slice());
        applyCellsToGrid(grid, seqMapRef.current, sanitized);
        setGrid(grid);
      } else if (msg.kind === "clear") {
        const grid = gridRef.current.map((row) => row.slice());
        applyClearToGrid(grid, seqMapRef.current, msg.seq);
        setGrid(grid);
      }
    });

    const offState = transport.onStateChange((state) => {
      if (state.status === "connected") {
        // Request snapshot on (re)connect
        transport.send({ kind: "snapshot-request" });
      }
    });

    transport.start();
    return () => {
      offMessage();
      offState();
    };
  }, [roomId, gridRef, setGrid]);

  const core = createEditorSyncCore(gridRef, seqMapRef.current, (msg) => {
    transportRef.current?.send(msg);
  });

  return core;
}

/** Subscribe play canvas to remote map changes. */
export function usePlayMapSync(
  mapRef: React.MutableRefObject<MapGrid>,
  roomId: string = getCoopRoomId(),
): void {
  const seqMapRef = useRef<SeqMap>(new Map());
  const transportRef = useRef<CoopTransport | null>(null);

  useEffect(() => {
    const transport = getSharedCoopTransport(roomId);
    transportRef.current = transport;

    const offMessage = transport.onMessage((msg) => {
      if (msg.kind === "tiles") {
        const sanitized = sanitizeInboundCells(msg.cells);
        if (sanitized.length === 0) return;
        const grid = mapRef.current.map((row) => row.slice());
        applyCellsToGrid(grid, seqMapRef.current, sanitized);
        mapRef.current = grid;
      } else if (msg.kind === "snapshot") {
        const sanitized = sanitizeInboundCells(msg.cells);
        if (sanitized.length === 0) return;
        const grid = mapRef.current.map((row) => row.slice());
        applyCellsToGrid(grid, seqMapRef.current, sanitized);
        mapRef.current = grid;
      } else if (msg.kind === "clear") {
        const grid = mapRef.current.map((row) => row.slice());
        applyClearToGrid(grid, seqMapRef.current, msg.seq);
        mapRef.current = grid;
      } else if (msg.kind === "snapshot-request") {
        // Answer with our current sparse snapshot
        const cells = buildSnapshotCells(mapRef.current).map((cell, i) => ({
          ...cell,
          seq: i + 1,
          author: "snapshot",
        }));
        const chunks = chunkCells(cells);
        for (const chunk of chunks) {
          transport.send({ kind: "snapshot", cells: chunk });
        }
      }
    });

    const offState = transport.onStateChange((state) => {
      if (state.status === "connected") {
        transport.send({ kind: "snapshot-request" });
      }
    });

    transport.start();
    return () => {
      offMessage();
      offState();
    };
  }, [roomId, mapRef]);
}