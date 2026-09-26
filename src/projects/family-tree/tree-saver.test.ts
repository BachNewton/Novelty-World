import { describe, expect, it } from "vitest";
import { createInitialTree, setNotes, ROOT_ID } from "./logic";
import { createTreeSaver, type SaveHalt, type WriteTree } from "./tree-saver";
import type { Tree } from "./types";

// An in-memory row with the database's rule: a write lands only at the
// expected version, and bumps it.
function fakeRow(startVersion: number) {
  const row = { version: startVersion, writes: [] as { tree: Tree; expected: number }[] };
  const write: WriteTree = async (tree, expected) => {
    row.writes.push({ tree, expected });
    // Resolve on a later tick, like a network round trip, so overlapping
    // saves would genuinely interleave if the saver let them.
    await Promise.resolve();
    if (row.version !== expected) return null;
    row.version += 1;
    return row.version;
  };
  return { row, write };
}

function note(text: string): Tree {
  return setNotes(createInitialTree(), ROOT_ID, text);
}

function harness(write: WriteTree, version: number) {
  const halts: SaveHalt[] = [];
  const saving: boolean[] = [];
  const saver = createTreeSaver(write, version, {
    onSavingChange: (s) => { saving.push(s); },
    onHalt: (h) => { halts.push(h); },
  });
  return { saver, halts, saving };
}

describe("createTreeSaver", () => {
  it("chains versions across saves", async () => {
    const { row, write } = fakeRow(3);
    const { saver, halts, saving } = harness(write, 3);
    await saver.save(note("a"));
    await saver.save(note("b"));
    expect(row.writes.map((w) => w.expected)).toEqual([3, 4]);
    expect(row.version).toBe(5);
    expect(halts).toEqual([]);
    expect(saving).toEqual([true, false, true, false]);
  });

  it("runs overlapping saves one at a time so they don't conflict with each other", async () => {
    const { row, write } = fakeRow(0);
    const { saver, halts } = harness(write, 0);
    const first = saver.save(note("a"));
    const second = saver.save(note("b"));
    await Promise.all([first, second]);
    expect(row.writes.map((w) => w.expected)).toEqual([0, 1]);
    expect(halts).toEqual([]);
  });

  it("halts on a conflict and never writes again", async () => {
    const { row, write } = fakeRow(7);
    // Loaded at 6: someone else saved version 7 since.
    const { saver, halts } = harness(write, 6);
    await saver.save(note("a"));
    await saver.save(note("b"));
    expect(halts).toEqual([{ kind: "conflict" }]);
    expect(row.writes).toHaveLength(1);
    expect(row.version).toBe(7);
  });

  it("halts on a failed write with its message", async () => {
    const write: WriteTree = () => Promise.reject(new Error("network down"));
    const { saver, halts, saving } = harness(write, 0);
    await saver.save(note("a"));
    await saver.save(note("b"));
    expect(halts).toEqual([{ kind: "error", message: "network down" }]);
    expect(saving).toEqual([true, false]);
  });
});
