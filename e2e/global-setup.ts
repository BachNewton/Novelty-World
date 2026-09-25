import { spawn } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Start a local test service and resolve once it logs "listening". */
async function startService(script: string): Promise<number> {
  const child = spawn("npx", ["tsx", resolve(__dirname, script)], {
    stdio: "pipe",
    shell: true,
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${script} startup timeout`)), 5000);
    child.stdout.on("data", (data: Buffer) => {
      if (data.toString().includes("listening")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.stderr.on("data", (data: Buffer) => {
      console.error(`${script} error:`, data.toString());
    });
    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  if (child.pid === undefined) throw new Error(`${script} has no pid`);
  return child.pid;
}

export default async function globalSetup() {
  const pids = await Promise.all([
    // Mock signaling + presence for the shared multiplayer lib.
    startService("ws-relay.ts"),
    // PeerJS signalling for the RPG co-op suite.
    startService("peer-server.ts"),
  ]);
  // Stored for teardown.
  process.env.E2E_SERVICE_PIDS = pids.join(",");
}
