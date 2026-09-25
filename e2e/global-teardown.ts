import { execSync } from "child_process";

/**
 * Kills the services spawned by global-setup. They are spawned with
 * `shell:true`, so each recorded PID is the shell — not the service itself —
 * and a bare `process.kill(pid)` only kills the shell, leaking the service as
 * a stale listener on its port (`EADDRINUSE` on the next run). Kill the
 * whole process TREE instead. Dependency-free (node builtins only).
 */
function killTree(pid: number): void {
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
    } else {
      process.kill(pid);
    }
  } catch {
    // taskkill may fail if the shell already exited while the service lives
    // on — fall back to a direct kill so a survivor never leaks its port.
    try {
      process.kill(pid);
    } catch {
      // Process is already gone.
    }
  }
}

export default async function globalTeardown() {
  const pids = (process.env.E2E_SERVICE_PIDS ?? "")
    .split(",")
    .map(Number)
    .filter((pid) => Number.isFinite(pid) && pid > 0);
  for (const pid of pids) killTree(pid);
}
