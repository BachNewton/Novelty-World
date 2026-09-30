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
    child.stdout.on("data", (data: Buffer) => {
      if (data.toString().includes("listening")) resolve();
    });
    child.stderr.on("data", (data: Buffer) => {
      console.error(`${script} error:`, data.toString());
    });
    child.on("error", reject);
    // A service that dies before listening (e.g. its port is taken) fails the run.
    child.on("exit", (code) => reject(new Error(`${script} exited with code ${code} before listening`)));
  });

  if (child.pid === undefined) throw new Error(`${script} has no pid`);
  return child.pid;
}

export default async function globalSetup() {
  // PeerJS signalling for every multiplayer suite (`?peer-signal=local`).
  const pids = [await startService("peer-server.ts")];
  // Stored for teardown.
  process.env.E2E_SERVICE_PIDS = pids.join(",");
}
