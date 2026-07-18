import { existsSync, copyFileSync } from "node:fs";
import { join } from "node:path";

// Import this module for its SIDE EFFECTS, FIRST — ahead of any module that pulls
// in `@tensorflow/tfjs-node`. It does two things tfjs-node needs on this setup:
//
// 1. WINDOWS DLL PLACEMENT (mirrors `scripts/fix-tfjs-windows.mjs`): tfjs-node's
//    native binding resolves `tensorflow.dll` from its OWN directory, but the DLL
//    ships under deps/lib/ — so copy it next to the binding. No-op off Windows or
//    once the copy exists. Makes an entry point self-healing if postinstall didn't
//    run.
//
// 2. ARGV SHIELDING: tfjs-node loads its binary via node-pre-gyp, which parses
//    `process.argv` with `nopt` AT IMPORT TIME. nopt's abbreviation matching
//    hijacks flags meant for OUR CLI — notably `--dir` → its `--directory` — and
//    derives a bogus binding path from the value, crashing the import. So we
//    CAPTURE our args here and clear `process.argv` before tfjs loads; the CLI
//    reads `cliArgv` instead of `process.argv.slice(2)`.

/** Our CLI arguments, captured before they're hidden from tfjs-node. */
export const cliArgv: readonly string[] = process.argv.slice(2);
process.argv = process.argv.slice(0, 2);

const base = join(process.cwd(), "node_modules", "@tensorflow", "tfjs-node");
const src = join(base, "deps", "lib", "tensorflow.dll");
const dst = join(base, "lib", "napi-v8", "tensorflow.dll");

if (process.platform === "win32" && existsSync(src) && !existsSync(dst)) {
  copyFileSync(src, dst);
}
