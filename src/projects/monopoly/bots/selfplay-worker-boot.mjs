// Worker bootstrap shim. A worker_thread spawned under tsx does NOT inherit tsx's
// ESM loader, so a `.ts` worker can't resolve its (extensionless, .ts) imports
// (`ERR_MODULE_NOT_FOUND` on the first import). This file is PLAIN ESM (`.mjs`), so
// Node loads it with no loader; it then registers tsx's loader for THIS thread and
// dynamically imports the real `.ts` worker, which now resolves. The canonical
// tsx-programmatic-API pattern for worker_threads. Dev-only (training runs under
// tsx); a built JS pipeline would point the Worker straight at the compiled worker.
import { register } from "tsx/esm/api";
register();
await import("./selfplay-worker.ts");
