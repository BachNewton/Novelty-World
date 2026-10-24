import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { hashSources } from "../source-hash";

// The native crate's release build, as the harness runs it (`ideas/native-port.md`, "How Node
// uses the crate"), and the sources it is built from.

const CRATE = fileURLToPath(new URL("../../native/", import.meta.url));

export const NATIVE_BINARY = path.join(CRATE, "target", "release", process.platform === "win32" ? "risk-native.exe" : "risk-native");

const BUILD_HINT = "run `cargo build --release` in src/projects/risk/native";

function filesUnder(dir: string): string[] {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- a directory of the crate in this repo
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(file) : [file];
  });
}

/** Every file the binary is built from: the crate's sources, its manifest and its lockfile. */
export function crateSources(): string[] {
  return [...filesUnder(path.join(CRATE, "src")), path.join(CRATE, "Cargo.toml"), path.join(CRATE, "Cargo.lock")];
}

let checked = false;

/** Fails loudly when the release build is missing or older than any of its sources: a stale
 *  binary would measure code that is no longer the crate's. */
export function assertFreshBinary(): void {
  if (checked) return;
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the crate's own build output
  const built = statSync(NATIVE_BINARY, { throwIfNoEntry: false });
  if (built === undefined) throw new Error(`no native build at ${NATIVE_BINARY}: ${BUILD_HINT}`);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the crate's own sources
  const newer = crateSources().filter((file) => statSync(file).mtimeMs > built.mtimeMs);
  if (newer.length > 0) {
    const names = newer.map((file) => path.relative(CRATE, file).replaceAll("\\", "/"));
    throw new Error(`the native build is older than ${names.join(", ")}: ${BUILD_HINT}`);
  }
  checked = true;
}

let code: string | null = null;

/** A hash of the crate's sources: the code a native bot's games depend on, for the ratings cache. */
export function crateCode(): string {
  code ??= hashSources(crateSources());
  return code;
}
