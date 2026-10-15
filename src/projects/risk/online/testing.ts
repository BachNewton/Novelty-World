import type { RiskEngine } from "../contract";
import type { RowStore, ServerDeps } from "./server";
import type { GameRow } from "./table";

/** A database in memory, with the real store's version check. `beforeWrite` lets a test land
 *  another write between a commit's read and its write. */
export function memoryStore() {
  const rows = new Map<string, GameRow>();
  const hooks = { beforeWrite: null as ((id: string) => void) | null, writes: 0 };
  const put = (row: GameRow) => {
    rows.set(row.id, structuredClone(row));
    return structuredClone(row);
  };
  const store: RowStore = {
    read: (id) => {
      const row = rows.get(id);
      return Promise.resolve(row ? structuredClone(row) : null);
    },
    write: (id, fromVersion, change) => {
      const hook = hooks.beforeWrite;
      hooks.beforeWrite = null;
      hook?.(id);
      const row = rows.get(id);
      if (row?.version !== fromVersion) return Promise.resolve(null);
      hooks.writes++;
      return Promise.resolve(put({ ...row, ...change, version: fromVersion + 1 }));
    },
    insert: (id, change) => Promise.resolve(rows.has(id) ? null : put({ id, version: 0, ...change })),
  };
  return { store, rows, hooks };
}

export function testDeps(engine: RiskEngine, store: RowStore, ids: readonly string[] = ["GAME"]): ServerDeps {
  let next = 0;
  return {
    engine,
    store,
    newId: () => ids[Math.min(next++, ids.length - 1)],
    newSeed: () => "seed",
  };
}
