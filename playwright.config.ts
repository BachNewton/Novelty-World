import { defineConfig } from "@playwright/test";
import { resultsDir } from "./e2e/run-dir";

/**
 * Every run is self-contained, so any number can go at once: it builds and
 * serves the app itself (e2e/next-server.ts) and starts its own PeerJS
 * signalling server (e2e/peer-server.ts), each on a port the OS picks, and
 * writes to its own folders: the build to `.next-e2e/run-<id>/` (deleted when
 * the run ends) and test output to `test-results/run-<id>/` (kept when a test
 * failed). The build is a snapshot of the code when the run starts: edits
 * saved during the run never reach it.
 *
 * E2E_BASE_URL=http://localhost:3001 runs against a server that is already up
 * (the dev server, for quick debugging) instead of building one.
 */

// The runner names the run after its own process; its workers load this config again and inherit the name.
process.env.E2E_RUN_ID ??= String(process.pid);
const RUN_ID = process.env.E2E_RUN_ID;
const ownServer = process.env.E2E_BASE_URL === undefined;

export default defineConfig({
  testDir: "./e2e",
  outputDir: resultsDir(RUN_ID),
  timeout: 30_000,
  retries: 0,
  fullyParallel: true,
  // Half the logical cores, so a few runs side by side still share the machine. `--workers` overrides.
  workers: "50%",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    // Set in the runner by the Next server's startup line (below), before any worker starts; or by hand.
    baseURL: process.env.E2E_BASE_URL,
    // Disable mDNS so WebRTC works on the same machine
    launchOptions: {
      args: ["--disable-features=WebRtcHideLocalIpsWithMdns"],
    },
  },
  webServer: [
    {
      name: "PeerJS",
      command: "npx tsx e2e/peer-server.ts",
      // Playwright stores a startup line's named groups as env vars: E2E_PEER_PORT here, E2E_BASE_URL below.
      // `new RegExp` because the tsconfig's ES2017 target rejects named groups in a regex literal.
      wait: { stdout: new RegExp("listening on port (?<e2e_peer_port>\\d+)") },
    },
    ...(ownServer
      ? [
          {
            name: "Next",
            command: "npx tsx e2e/next-server.ts",
            wait: { stdout: new RegExp("Local:\\s+(?<e2e_base_url>http://\\S+)") },
            timeout: 300_000,
          },
        ]
      : []),
  ],
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
