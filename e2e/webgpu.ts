/**
 * The browser a WebGPU page's tests run in. Chrome's own build, since Playwright's headless shell falls back to
 * WebGL2, on the fastest GPU there is: an eGPU when one is plugged in. A page's own `powerPreference` and Chrome's
 * WebGPU power flag both still got the integrated GPU on this laptop; only `--force-high-performance-gpu` moves
 * Chrome's GPU process to the eGPU, and with none plugged in it stays on the integrated one. `E2E_INTEGRATED_GPU=1`
 * leaves it on the integrated GPU, for a night when something else holds the eGPU's memory (a training run).
 */
const onEgpu = process.env.E2E_INTEGRATED_GPU !== "1";

export const WEBGPU_BROWSER = {
  channel: "chromium",
  launchOptions: { args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--enable-gpu", ...(onEgpu ? ["--force-high-performance-gpu"] : [])] },
};
