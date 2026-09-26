import type { Tree } from "./types";

// Writes `tree` if the stored row is still at `expectedVersion`; resolves to
// the new version, or null when someone else saved first.
export type WriteTree = (tree: Tree, expectedVersion: number) => Promise<number | null>;

// Why saving stopped for good in this tab.
export type SaveHalt =
  | { kind: "conflict" }
  | { kind: "error"; message: string };

export interface TreeSaver {
  save: (tree: Tree) => Promise<void>;
}

interface SaverCallbacks {
  onSavingChange: (saving: boolean) => void;
  onHalt: (halt: SaveHalt) => void;
}

// Saves run strictly one after another: each needs the version the previous
// one produced, and two overlapping writes from the same tab would conflict
// with each other. The first conflict or failure halts the saver, because
// every later save would be built on a tree that isn't the stored one.
export function createTreeSaver(
  write: WriteTree,
  loadedVersion: number,
  { onSavingChange, onHalt }: SaverCallbacks,
): TreeSaver {
  let version = loadedVersion;
  let halted = false;
  let queue: Promise<void> = Promise.resolve();

  async function run(tree: Tree): Promise<void> {
    if (halted) return;
    onSavingChange(true);
    try {
      const next = await write(tree, version);
      if (next === null) {
        halted = true;
        onHalt({ kind: "conflict" });
      } else {
        version = next;
      }
    } catch (err) {
      halted = true;
      onHalt({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    } finally {
      onSavingChange(false);
    }
  }

  return {
    save: (tree) => {
      queue = queue.then(() => run(tree));
      return queue;
    },
  };
}
