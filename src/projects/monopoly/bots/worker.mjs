// worker.mjs — bridge so Node v20 worker_threads can load worker.ts via tsx.
// Node v20 worker_threads don't inherit tsx's ESM loader. This .mjs stub uses
// tsx's programmatic tsImport() API to load the real worker.ts.
import { tsImport } from "tsx/esm/api";
await tsImport("./worker.ts", import.meta.url);
