import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: "http://localhost:3001",
    // Disable mDNS so WebRTC works on the same machine
    launchOptions: {
      args: ["--disable-features=WebRtcHideLocalIpsWithMdns"],
    },
  },
  webServer: {
    command: "pnpm dev",
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
