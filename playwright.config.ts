import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: 0,
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL: "http://localhost:3001",
    // Disable mDNS so WebRTC works on the same machine
    launchOptions: {
      args: ["--disable-features=WebRtcHideLocalIpsWithMdns"],
    },
  },
  webServer: {
    command: "npm run dev",
    port: 3001,
    reuseExistingServer: true,
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
