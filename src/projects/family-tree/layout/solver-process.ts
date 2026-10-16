// Runs one of the CP-SAT models in solver/ in a Python child process from the
// repo's venv (`npm run setup:family-tree-solver` creates it). d3-dag's
// operators are synchronous, hence spawnSync.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const solverPath = (relative: string): string =>
  fileURLToPath(new URL(`./solver/${relative}`, import.meta.url));

// The nearest `.venv` above `from`, the way Node finds node_modules, so a
// worktree nested in the main checkout uses the main checkout's venv.
export function findVenvPython(from: string): string {
  const python = process.platform === "win32" ? join("Scripts", "python.exe") : join("bin", "python");
  for (let dir = from; ; dir = dirname(dir)) {
    const candidate = join(dir, ".venv", python);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- the path is this file's own folder and its ancestors, never outside input
    if (existsSync(candidate)) return candidate;
    if (dirname(dir) === dir) {
      throw new Error(
        `No Python venv in any folder above ${from}. Run \`npm run setup:family-tree-solver\` (layout/solver/setup_venv.py) from the repo root.`,
      );
    }
  }
}

export interface SolverOptions {
  // Stream the solver's search progress to stderr, so a long solve isn't silent.
  progress?: boolean;
}

// The search threads a solve may use: the share of the machine its caller owns. The CLI owns the whole machine;
// a test runner whose workers already fill the cores gives each worker's solves that worker's share instead, through
// FAMILY_TREE_SOLVER_THREADS (the vitest configs), since a solve blocks its worker but runs threads of its own.
function solverThreads(): number {
  const share = process.env.FAMILY_TREE_SOLVER_THREADS;
  if (share === undefined) return availableParallelism();
  const threads = Number(share);
  if (!Number.isInteger(threads) || threads < 1) throw new Error(`FAMILY_TREE_SOLVER_THREADS must be a whole number of threads, not "${share}"`);
  return threads;
}

// Hands `input` to the script as JSON on stdin and parses its JSON answer.
export function runSolver(script: string, input: unknown, options: SolverOptions): unknown {
  const progress = options.progress === true;
  const python = findVenvPython(dirname(fileURLToPath(import.meta.url)));
  const run = spawnSync(python, [solverPath(script), "--workers", String(solverThreads()), ...(progress ? ["--progress"] : [])], {
    input: JSON.stringify(input),
    stdio: ["pipe", "pipe", progress ? "inherit" : "pipe"],
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (run.error !== undefined) {
    throw new Error(`Could not run the layout solver (${python}): ${run.error.message}`);
  }
  if (run.status !== 0) {
    // With progress on, stderr went straight to the terminal.
    const detail = progress ? "see its output above" : run.stderr.trim();
    throw new Error(`The layout solver (${script}) failed (${run.signal ?? `exit code ${run.status}`}): ${detail}`);
  }
  return JSON.parse(run.stdout) as unknown;
}
