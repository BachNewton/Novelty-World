// Runs one of the CP-SAT models in solver/ in a Python child process from the
// venv beside them (`npm run setup:family-tree-solver` creates it). d3-dag's
// operators are synchronous, hence spawnSync.

import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

const solverPath = (relative: string): string =>
  fileURLToPath(new URL(`./solver/${relative}`, import.meta.url));
const PYTHON = solverPath(
  process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python",
);

export interface SolverOptions {
  // Stream the solver's search progress to stderr, so a long solve isn't silent.
  progress?: boolean;
}

// Hands `input` to the script as JSON on stdin and parses its JSON answer.
export function runSolver(script: string, input: unknown, options: SolverOptions): unknown {
  const progress = options.progress === true;
  const run = spawnSync(PYTHON, [solverPath(script), ...(progress ? ["--progress"] : [])], {
    input: JSON.stringify(input),
    stdio: ["pipe", "pipe", progress ? "inherit" : "pipe"],
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (run.error !== undefined) {
    const missing = (run.error as NodeJS.ErrnoException).code === "ENOENT";
    throw new Error(
      missing
        ? `The layout solver's Python venv is missing (${PYTHON}). Run \`npm run setup:family-tree-solver\` from the repo root.`
        : `Could not run the layout solver: ${run.error.message}`,
    );
  }
  if (run.status !== 0) {
    // With progress on, stderr went straight to the terminal.
    const detail = progress ? "see its output above" : run.stderr.trim();
    throw new Error(`The layout solver (${script}) failed (${run.signal ?? `exit code ${run.status}`}): ${detail}`);
  }
  return JSON.parse(run.stdout) as unknown;
}
