import { execSync } from "child_process";

/**
 * Kills the WS relay spawned by global-setup. The relay is spawned with
 * `shell:true`, so the recorded PID is the shell — not the relay itself —
 * and a bare `process.kill(pid)` only kills the shell, leaking the relay as
 * a stale listener on port 3002 (`EADDRINUSE` on the next run). Kill the
 * whole process TREE instead. Dependency-free (node builtins only).
 */
export default async function globalTeardown() {
  const pid = process.env.WS_RELAY_PID;
  if (!pid) return;
  const pidNum = Number(pid);
  if (!Number.isFinite(pidNum) || pidNum <= 0) return;
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /PID ${pidNum} /T /F`, { stdio: "ignore" });
    } else {
      process.kill(pidNum);
    }
  } catch {
    // taskkill may fail if the shell already exited while the relay lives
    // on — fall back to a direct kill so a survivor never leaks port 3002.
    try {
      process.kill(pidNum);
    } catch {
      // Process is already gone.
    }
  }
}
