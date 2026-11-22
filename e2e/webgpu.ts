/**
 * The browser a WebGPU page's tests run in. Chrome's own build, since Playwright's headless shell falls back to
 * WebGL2, on the fastest GPU there is: an eGPU when one is plugged in. A page's own `powerPreference` and Chrome's
 * WebGPU power flag both still got the integrated GPU on this laptop; only `--force-high-performance-gpu` moves
 * Chrome's GPU process to the eGPU, and with none plugged in it stays on the integrated one. `E2E_INTEGRATED_GPU=1`
 * keeps it on the integrated GPU: set by hand so a run needn't wait for the eGPU while a long job holds it, and by the
 * machine's budget for a run it started with none plugged in. The budget reads a spec's GPU from these launch flags,
 * here or in the spec (scripts/e2e-claims.mjs).
 */
const onEgpu = process.env.E2E_INTEGRATED_GPU !== "1";

export const WEBGPU_BROWSER = {
  channel: "chromium",
  launchOptions: { args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--enable-gpu", ...(onEgpu ? ["--force-high-performance-gpu"] : [])] },
};
