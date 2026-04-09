import { spawn, type ChildProcess } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let wsProcess: ChildProcess;

export default async function globalSetup() {
  // Start the WS relay server for mock signaling
  wsProcess = spawn("npx", ["tsx", resolve(__dirname, "ws-relay.ts")], {
    stdio: "pipe",
    shell: true,
  });

  // Wait for it to be ready
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("WS relay startup timeout")), 5000);
    wsProcess.stdout?.on("data", (data: Buffer) => {
      if (data.toString().includes("listening")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    wsProcess.stderr?.on("data", (data: Buffer) => {
      console.error("WS relay error:", data.toString());
    });
    wsProcess.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  // Store PID for teardown
  process.env.WS_RELAY_PID = String(wsProcess.pid);
}
