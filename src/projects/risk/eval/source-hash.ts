import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// What a piece of code depends on, as a hash: the source files a module reaches through
// its imports, read from disk. A remembered result keyed by it is good until any of
// those files changes, comments included, which costs a replay but can never keep a
// stale answer. Packages are not followed: the lockfile pins them.

/** The repo's `src/`, which the `@/` alias names. */
const SRC = fileURLToPath(new URL("../../../", import.meta.url));

/** `… from "x"` (imports and re-exports), and `import "x"` or `import("x")`. */
const IMPORTS = [/\bfrom\s*["']([^"']+)["']/g, /\bimport\s*\(?\s*["']([^"']+)["']/g];

function resolve(spec: string, from: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  const stem = base.replace(/\.js$/, "");
  for (const candidate of [base, `${stem}.ts`, `${stem}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- a path inside this repo, resolved from its own imports
    if (statSync(candidate, { throwIfNoEntry: false })?.isFile() === true) return candidate;
  }
  throw new Error(`can't resolve "${spec}" imported by ${from}`);
}

/** Every source file `entries` reach through their imports, not following into any file
 *  `skip` names (those count as outside the code). */
export function sourceClosure(entries: readonly string[], skip: (file: string) => boolean = () => false): string[] {
  const seen = new Set<string>();
  const stack = [...entries];
  while (stack.length > 0) {
    const file = stack.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    if (!/\.tsx?$/.test(file)) continue;
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- a source file of this repo, reached through its imports
    const text = readFileSync(file, "utf8");
    for (const pattern of IMPORTS) {
      for (const m of text.matchAll(pattern)) {
        const target = resolve(m[1], file);
        if (target !== null && !skip(target)) stack.push(target);
      }
    }
  }
  return [...seen].sort();
}

/** A hash of the files' paths (from `src/`) and contents, line endings aside. */
export function hashSources(files: readonly string[]): string {
  const hash = createHash("sha256");
  for (const file of [...files].sort()) {
    hash.update(path.relative(SRC, file).replaceAll("\\", "/"));
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- a source file of this repo, from `sourceClosure`
    hash.update(readFileSync(file, "utf8").replaceAll("\r\n", "\n"));
  }
  return hash.digest("hex").slice(0, 16);
}
