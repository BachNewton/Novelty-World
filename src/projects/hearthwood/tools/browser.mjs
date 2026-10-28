// The headless browser every Hearthwood screenshot tool draws in: Chromium with WebGPU, on whatever this
// machine has. On Windows that is the GPU through D3D12 (Dawn's own choice); on a Linux machine with no GPU
// (a cloud sandbox, CI) it is SwiftShader through Vulkan, slow but exact, which needs all three Vulkan
// switches: with any missing, WebGPU hands out an adapter whose device is lost on the first draw.
// HEARTHWOOD_CHROME points at a Chromium of its own when Playwright's own build isn't installed.

import { chromium } from "playwright";

const COMMON = ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--disable-gpu-vsync", "--disable-frame-rate-limit"];

function platformArgs() {
  if (process.platform === "linux" && process.env.HEARTHWOOD_GPU !== "1") return ["--enable-features=Vulkan", "--use-vulkan=swiftshader", "--use-angle=swiftshader"];
  return ["--enable-gpu"];
}

export async function launchBrowser() {
  const executablePath = process.env.HEARTHWOOD_CHROME;
  return chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}), args: [...COMMON, ...platformArgs()] });
}
