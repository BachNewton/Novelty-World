import { execSync } from "child_process";
import { existsSync, readFileSync, rmSync } from "fs";
import { runDir } from "./run-dir";

/**
 * Stops this run's Next server (e2e/next-server.ts) and deletes its build.
 * Playwright would stop the server after this, but its build can only be
 * deleted once nothing is serving it. The server runs under a shell, and on
 * Windows killing a process leaves its children running, so kill the whole
 * process tree. Dependency-free (node builtins only).
 */
function killTree(pid: number): void {
  if (process.platform === "win32") execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
  else process.kill(pid, "SIGTERM");
}

export default function globalTeardown(): void {
  const runId = process.env.E2E_RUN_ID;
  if (runId === undefined) throw new Error("E2E_RUN_ID is unset: playwright.config.ts sets it");
  const dir = runDir(runId);
  // No folder: the run used an already-running server (E2E_BASE_URL).
  if (!existsSync(dir)) return;
  killTree(Number(readFileSync(`${dir}/server.pid`, "utf8")));
  rmSync(dir, { recursive: true, force: true });
}
