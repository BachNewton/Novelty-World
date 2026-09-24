import { describe, expect, it, vi } from "vitest";

vi.mock("peerjs", () => ({ Peer: class MockPeer {} }));

import {
  SNAPSHOT_CHUNK_BYTES,
  applyCellsToGrid,
  applyClearToGrid,
  beatsCell,
  buildSnapshotCells,
  chunkCells,
  createEditorSyncCore,
  sanitizeInboundCells,
  stampLocalPaint,
  type PaintClock,
  type SeqMap,
  type SyncTile,
} from "./map-sync";
import type { CoopMessage, TileCell } from "./types";
import type { CoopTransport } from "./transport";

type Grid = (SyncTile | null)[][];

const GRASS = "/rpg/tiles/Grass/Grass_Tiles_1.png";
const WATER = "/rpg/tiles/Water/Water_Stone_Tile_1.png";

function emptyGrid(rows = 28, cols = 40): Grid {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => null),
  );
}

function cell(
  c: number,
  r: number,
  tile: SyncTile | null,
  seq: number,
  author: string,
): TileCell {
  return {
    c,
    r,
    tile: tile === null ? null : { ...tile },
    seq,
    author,
  };
}

const A_TILE: SyncTile = { src: GRASS, sx: 1, sy: 2 };
const B_TILE: SyncTile = { src: WATER, sx: 0, sy: 0 };

describe("beatsCell (LWW tiebreak)", () => {
  it("first write to an empty cell always wins", () => {
    expect(beatsCell(0, "a", undefined)).toBe(true);
  });

  it("higher seq wins, lower seq loses", () => {
    expect(beatsCell(5, "a", { seq: 4, author: "b" })).toBe(true);
    expect(beatsCell(3, "a", { seq: 4, author: "b" })).toBe(false);
  });

  it("seq tie breaks by author, identically on all peers", () => {
    expect(beatsCell(4, "b", { seq: 4, author: "a" })).toBe(true);
    expect(beatsCell(4, "a", { seq: 4, author: "b" })).toBe(false);
    expect(beatsCell(4, "a", { seq: 4, author: "a" })).toBe(false);
  });
});

describe("applyCellsToGrid", () => {
  it("applies newer cells and drops stale ones; different cells never conflict", () => {
    const seqs: SeqMap = new Map();
    const grid = emptyGrid();
    const first = applyCellsToGrid(
      grid,
      [cell(1, 1, A_TILE, 1, "a"), cell(2, 2, B_TILE, 1, "b")],
      seqs,
    );
    expect(first.applied).toBe(2);
    expect(first.grid[1]?.[1]).toEqual(A_TILE);
    expect(first.grid[2]?.[2]).toEqual(B_TILE);

    // Stale same-cell write loses; concurrent different-cell write wins.
    const second = applyCellsToGrid(
      first.grid,
      [cell(1, 1, B_TILE, 0, "z"), cell(3, 3, A_TILE, 9, "a")],
      seqs,
    );
    expect(second.applied).toBe(1);
    expect(second.grid[1]?.[1]).toEqual(A_TILE);
    expect(second.grid[3]?.[3]).toEqual(A_TILE);
  });

  it("erase (null tile) wins with a higher seq", () => {
    const seqs: SeqMap = new Map();
    const painted = applyCellsToGrid(emptyGrid(), [cell(0, 0, A_TILE, 2, "a")], seqs);
    const erased = applyCellsToGrid(
      painted.grid,
      [cell(0, 0, null, 3, "b")],
      seqs,
    );
    expect(erased.applied).toBe(1);
    expect(erased.grid[0]?.[0]).toBeNull();
  });

  it("re-applying the same batch is a no-op returning the same reference", () => {
    const seqs: SeqMap = new Map();
    const batch = [cell(5, 5, A_TILE, 1, "a")];
    const once = applyCellsToGrid(emptyGrid(), batch, seqs);
    const twice = applyCellsToGrid(once.grid, batch, seqs);
    expect(twice.applied).toBe(0);
    expect(twice.grid).toBe(once.grid);
  });
});

describe("applyClearToGrid", () => {
  it("clears cells it beats and stamps the seq map", () => {
    const seqs: SeqMap = new Map();
    const painted = applyCellsToGrid(
      emptyGrid(),
      [cell(0, 0, A_TILE, 2, "a"), cell(1, 1, B_TILE, 2, "a")],
      seqs,
    );
    const cleared = applyClearToGrid(painted.grid, 3, "a", seqs);
    expect(cleared[0]?.[0]).toBeNull();
    expect(cleared[1]?.[1]).toBeNull();
    // A late stale write loses to the clear stamp (no resurrection).
    const late = applyCellsToGrid(cleared, [cell(0, 0, A_TILE, 2, "b")], seqs);
    expect(late.applied).toBe(0);
    expect(late.grid[0]?.[0]).toBeNull();
  });

  it("a strictly concurrent higher-seq write survives — identically everywhere", () => {
    const seqs: SeqMap = new Map();
    const painted = applyCellsToGrid(emptyGrid(), [cell(0, 0, A_TILE, 2, "a")], seqs);
    const cleared = applyClearToGrid(painted.grid, 3, "a", seqs);
    const concurrent = applyCellsToGrid(
      cleared,
      [cell(1, 1, B_TILE, 9, "b")],
      seqs,
    );
    expect(concurrent.applied).toBe(1);
    expect(concurrent.grid[1]?.[1]).toEqual(B_TILE);
  });
});

describe("snapshot sparse round-trip", () => {
  it("serializes only non-null cells and merges through a fresh seq map", () => {
    const seqs: SeqMap = new Map();
    const grid = emptyGrid();
    grid[0]![0] = { ...A_TILE };
    grid[27]![39] = { ...B_TILE };
    const snapshot = buildSnapshotCells(grid, seqs, "a");
    expect(snapshot).toHaveLength(2);

    const joinerSeqs: SeqMap = new Map();
    const joiner = applyCellsToGrid(emptyGrid(), snapshot, joinerSeqs);
    expect(joiner.applied).toBe(2);
    expect(joiner.grid).toEqual(grid);
  });

  it("carries stored (seq, author) so joiner clocks converge", () => {
    const seqs: SeqMap = new Map();
    const painted = applyCellsToGrid(
      emptyGrid(),
      [cell(4, 4, A_TILE, 7, "peer-x")],
      seqs,
    );
    const snapshot = buildSnapshotCells(painted.grid, seqs, "a");
    expect(snapshot).toEqual([cell(4, 4, A_TILE, 7, "peer-x")]);
  });
});

describe("chunkCells", () => {
  it("splits a full-map snapshot into <=16KB chunks that round-trip", () => {
    const grid = emptyGrid();
    for (let r = 0; r < 28; r += 1) {
      for (let c = 0; c < 40; c += 1) {
        grid[r]![c] = { src: GRASS, sx: c % 16, sy: r % 10 };
      }
    }
    const snapshot = buildSnapshotCells(grid, new Map(), "a");
    expect(snapshot).toHaveLength(40 * 28);
    const chunks = chunkCells(snapshot);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(JSON.stringify(chunk).length).toBeLessThanOrEqual(
        SNAPSHOT_CHUNK_BYTES,
      );
    }
    expect(chunks.flat()).toEqual(snapshot);
  });

  it("returns no chunks for an empty snapshot", () => {
    expect(chunkCells([])).toEqual([]);
  });
});

describe("sanitizeInboundCells", () => {
  it("accepts manifest paint srcs and erases", () => {
    const cells = sanitizeInboundCells([
      { c: 0, r: 0, tile: { src: GRASS, sx: 1, sy: 2 }, seq: 1, author: "a" },
      { c: 39, r: 27, tile: null, seq: 0, author: "b" },
    ]);
    expect(cells).toHaveLength(2);
  });

  it("drops out-of-bounds cells, unknown srcs, and malformed entries", () => {
    const cells = sanitizeInboundCells([
      { c: 40, r: 0, tile: null, seq: 1, author: "a" },
      { c: 0, r: 28, tile: null, seq: 1, author: "a" },
      { c: -1, r: 0, tile: null, seq: 1, author: "a" },
      { c: 0, r: 0, tile: { src: "/evil.png", sx: 0, sy: 0 }, seq: 1, author: "a" },
      { c: 0, r: 0, tile: { src: "", sx: 0, sy: 0 }, seq: 1, author: "a" },
      { c: 1, r: 1, tile: { src: GRASS, sx: -1, sy: 0 }, seq: 1, author: "a" },
      { c: 1, r: 1, tile: { src: GRASS, sx: 1.5, sy: 0 }, seq: 1, author: "a" },
      { c: 2, r: 2, tile: null, seq: -1, author: "a" },
      { c: 2, r: 2, tile: null, seq: 1, author: "" },
      "nope",
      null,
    ]);
    expect(cells).toEqual([]);
  });

  it("migrates legacy /tiles/ prefixes before manifest validation", () => {
    const cells = sanitizeInboundCells([
      {
        c: 3,
        r: 3,
        tile: { src: "/tiles/Grass/Grass_Tiles_1.png", sx: 0, sy: 0 },
        seq: 1,
        author: "a",
      },
    ]);
    expect(cells).toEqual([
      { c: 3, r: 3, tile: { src: GRASS, sx: 0, sy: 0 }, seq: 1, author: "a" },
    ]);
  });

  it("rejects non-array payloads", () => {
    expect(sanitizeInboundCells(undefined)).toEqual([]);
    expect(sanitizeInboundCells({})).toEqual([]);
  });
});

describe("stampLocalPaint", () => {
  function clock(): PaintClock {
    return { seqs: new Map(), localSeq: 0, maxSeen: 0 };
  }

  it("stamps one cell with a bumped seq", () => {
    const c = clock();
    expect(stampLocalPaint(c, "me", 1, 2, A_TILE)).toEqual({
      c: 1,
      r: 2,
      tile: { ...A_TILE },
      seq: 1,
      author: "me",
    });
    expect(c.localSeq).toBe(1);
  });

  it("supports erases and rejects out-of-bounds paints", () => {
    const c = clock();
    expect(stampLocalPaint(c, "me", 0, 0, null)?.tile).toBeNull();
    expect(stampLocalPaint(c, "me", 40, 0, A_TILE)).toBeNull();
    expect(stampLocalPaint(c, "me", 0, 28, A_TILE)).toBeNull();
    expect(stampLocalPaint(c, "me", -1, 0, A_TILE)).toBeNull();
    expect(c.localSeq).toBe(1);
  });
});

describe("createEditorSyncCore synchronous flush", () => {
  function harness() {
    const sent: CoopMessage[] = [];
    const transport = {
      send: (msg: Parameters<CoopTransport["send"]>[0]): void => {
        sent.push({ ...msg, from: "me" } as CoopMessage);
      },
      getState: () => ({
        role: "guest",
        status: "connected",
        peerId: "me",
        peers: [],
      }),
    } as unknown as CoopTransport;
    const gridRef = { current: emptyGrid() };
    const setGrid = (
      updater: (prev: Grid) => Grid,
    ): void => {
      gridRef.current = updater(gridRef.current);
    };
    const core = createEditorSyncCore<SyncTile>({
      gridRef,
      setGrid,
      getTransport: () => transport,
    });
    return { sent, transport, gridRef, core };
  }

  it("sends each paint synchronously in the same call", () => {
    const { sent, core } = harness();
    core.queueLocalPaint(1, 1, A_TILE);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual({
      kind: "tiles",
      from: "me",
      cells: [{ c: 1, r: 1, tile: { ...A_TILE }, seq: 1, author: "me" }],
    });
    core.queueLocalPaint(2, 2, B_TILE);
    expect(sent).toHaveLength(2);
    expect((sent[1] as { cells: TileCell[] }).cells[0]?.seq).toBe(2);
  });

  it("drops out-of-bounds paints without sending", () => {
    const { sent, core } = harness();
    core.queueLocalPaint(40, 0, A_TILE);
    core.queueLocalPaint(0, 28, A_TILE);
    expect(sent).toEqual([]);
  });

  it("broadcastClear beats seen seqs locally and on the wire", () => {
    const { sent, core, gridRef, transport } = harness();
    core.handleMessage(
      {
        kind: "tiles",
        from: "peer-x",
        cells: [cell(0, 0, A_TILE, 5, "peer-x")],
      },
      transport,
    );
    expect(gridRef.current[0]?.[0]).toEqual(A_TILE);
    core.broadcastClear();
    expect(gridRef.current[0]?.[0]).toBeNull();
    const clear = sent.at(-1);
    expect(clear).toMatchObject({ kind: "clear", from: "me", seq: 6 });
  });

  it("inbound clear merges through the seq map", () => {
    const { sent, core, gridRef, transport } = harness();
    core.queueLocalPaint(3, 3, A_TILE);
    core.handleMessage({ kind: "clear", from: "peer-x", seq: 9 }, transport);
    expect(gridRef.current[3]?.[3]).toBeNull();
    // A stale local-seq paint still sends (wire LWW resolves it on peers).
    expect(sent).toHaveLength(1);
  });
});
