import type { Server } from "node:http";
import { serveTiles } from "../src/projects/aland-drive/tools/serve-tiles.mjs";
import { expect, test } from "./test";
import { WEBGPU_BROWSER } from "./webgpu";

/*
 * The real game on the real renderer. Playwright's default headless shell has
 * no WebGPU here, so these ask for the full Chromium by name, with the switches
 * that let it use the machine's GPU. Tiles come from a server of the test's own,
 * holding the one committed tile: a world small enough to live in the repo.
 */

const PAGE = "/games/3d-games/aland-drive";
const FIXTURE_TILES = "src/projects/aland-drive/fixture";

let tiles: Server;
let onFixture: string;

test.beforeAll(async () => {
  const { server, port } = await serveTiles(FIXTURE_TILES);
  tiles = server;
  onFixture = `${PAGE}?tiles=local:${port}`;
});

test.afterAll(() => {
  tiles.close();
});

test.use(WEBGPU_BROWSER);
test.setTimeout(90_000);

// e2e-covers: src/projects/aland-drive/render/game.ts src/projects/aland-drive/render/stream.ts src/projects/aland-drive/render/graphics-settings.ts src/projects/aland-drive/render/{verge,planting}.ts src/projects/aland-drive/components/aland-drive*.tsx src/projects/aland-drive/sim/{drive,car}.ts src/projects/aland-drive/input/**
test("the drive starts on WebGPU at every physical pixel, grows its verge, and the car moves under the keyboard", async ({ page }) => {
  await page.goto(onFixture);
  await page.waitForFunction(() => window.__alandDrive !== undefined && window.__alandDrive.frames() > 0, null, { timeout: 60_000 });

  const counts = await page.evaluate(() => window.__alandDrive?.counts());
  expect(counts?.webGpu).toBe(true);
  expect(counts?.width).toBe(await page.evaluate(() => Math.floor(window.innerWidth * window.devicePixelRatio)));
  await page.waitForFunction(() => {
    const verge = window.__alandDrive?.vergeDrawn();
    return verge !== undefined && verge.near > 0 && verge.far > 0;
  });

  const start = await page.evaluate(() => window.__alandDrive?.car().position);
  await page.keyboard.down("KeyW");
  await page.waitForFunction(
    (from) => {
      const position = window.__alandDrive?.car().position;
      return position !== undefined && from !== undefined && Math.hypot(position[0] - from[0], position[2] - from[2]) > 5;
    },
    start,
    { timeout: 30_000 },
  );
  await page.keyboard.up("KeyW");

  await expect(page.getByRole("status")).not.toHaveText("0");
});

// e2e-covers: src/projects/aland-drive/components/game-menu.tsx src/projects/aland-drive/render/game-menu.ts
test("Esc opens the game menu, which pauses the drive and fits the tyres picked, and Resume or Esc closes it", async ({ page }) => {
  await page.goto(onFixture);
  await page.waitForFunction(() => window.__alandDrive !== undefined && window.__alandDrive.frames() > 0, null, { timeout: 60_000 });
  const menu = page.getByRole("dialog", { name: "Game menu" });

  await page.keyboard.press("Escape");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("button", { name: "Resume" })).toBeFocused();
  await menu.getByRole("radio", { name: "Studded tyres" }).click();
  await expect(menu.getByRole("radio", { name: "Studded tyres" })).toBeChecked();
  expect(await page.evaluate(() => window.__alandDrive?.tyres())).toBe("studded");

  // Held throttle does nothing while it's open: the drive isn't stepped at all.
  const paused = await page.evaluate(() => window.__alandDrive?.car().position);
  await page.keyboard.down("KeyW");
  const frames = await page.evaluate(() => window.__alandDrive?.frames() ?? 0);
  await page.waitForFunction((from) => (window.__alandDrive?.frames() ?? 0) > from + 30, frames);
  expect(await page.evaluate(() => window.__alandDrive?.car().position)).toEqual(paused);

  await menu.getByRole("button", { name: "Resume" }).click();
  await expect(menu).toBeHidden();
  await page.waitForFunction(
    (from) => {
      const position = window.__alandDrive?.car().position;
      return position !== undefined && from !== undefined && Math.hypot(position[0] - from[0], position[2] - from[2]) > 1;
    },
    paused,
    { timeout: 30_000 },
  );
  await page.keyboard.up("KeyW");

  await page.keyboard.press("Escape");
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
});

// e2e-covers: src/projects/aland-drive/render/{forest,tree-place,tree-shapes,foliage-light}.ts
test("the forest draws only what the GPU picked, and a setting changes that with no rebuild", async ({ page }) => {
  await page.goto(`${onFixture}&forest-lab`);
  const drawnOnce = (reach: number) =>
    page.evaluate(async (forestReachM) => {
      const lab = window.__forestLab;
      if (!lab) throw new Error("no lab");
      lab.setForest({ fullReachM: 464, forestReachM, farDensity: 1 });
      // The count read back when the setting went in may be older than it: only one begun after a frame with it will do.
      for (let reads = 0, seen = lab.state().frames; reads < 2; ) {
        await new Promise(requestAnimationFrame);
        if (lab.state().frames > seen + 8) {
          seen = lab.state().frames;
          reads++;
        }
      }
      return lab.state().drawn;
    }, reach);
  await page.waitForFunction(() => window.__forestLab !== undefined && window.__forestLab.state().frames > 0 && window.__forestLab.state().loading === 0, null, { timeout: 60_000 });
  await page.evaluate(() => window.__forestLab?.nextWorstTree());

  const wide = await drawnOnce(1500);
  expect(wide.turned + wide.cone).toBeGreaterThan(0);
  const narrow = await drawnOnce(500);
  expect(narrow.turned + narrow.cone).toBeLessThan(wide.turned + wide.cone);
});

// e2e-covers: src/projects/aland-drive/map/{world-map,navigator,draw}.ts
test("a place clicked on the world map sets a route, and Esc closes the map back to the drive", async ({ page }) => {
  await page.goto(onFixture);
  await page.waitForFunction(() => window.__alandDrive?.mapReady() === true, null, { timeout: 60_000 });
  await expect(page.getByLabel("Mini map")).toBeVisible();

  await page.keyboard.press("KeyM");
  const map = page.getByLabel("Island map");
  await expect(map).toBeVisible();
  // The map's view only exists once it has fitted itself to the canvas, a frame after it shows.
  await page.waitForFunction(() => window.__alandDrive?.mapShown() === 1);
  const box = await map.boundingBox();
  if (!box) throw new Error("the world map has no size");

  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.6);
  await page.waitForFunction(() => (window.__alandDrive?.routePoints()?.length ?? 0) > 6);

  await page.keyboard.press("Escape");
  await expect(map).toBeHidden();
  await expect(page.getByLabel("Distance to go")).toBeVisible();
});

// e2e-covers: src/projects/aland-drive/render/game.ts src/projects/aland-drive/components/aland-drive*.tsx
test("a browser that only gets WebGL2 is told the game needs WebGPU", async ({ page }) => {
  // The failure three hides: an adapter is there, the device can't be made, and it quietly drops to WebGL2.
  await page.addInitScript(() => {
    GPUAdapter.prototype.requestDevice = () => Promise.reject(new Error("no device in this test"));
  });
  await page.goto(onFixture);
  await expect(page.getByText("needs a browser with WebGPU")).toBeVisible({ timeout: 60_000 });
  expect(await page.evaluate(() => window.__alandDrive)).toBeUndefined();
});

// e2e-covers: src/projects/aland-drive/render/game.ts src/projects/aland-drive/components/aland-drive.tsx
test("a GPU lost under the drive stops it and says so", async ({ page }) => {
  // A driver reset as the browser reports it: the device stops working and its `lost` gives no reason of ours.
  await page.addInitScript(() => {
    const requestDevice = GPUAdapter.prototype.requestDevice;
    GPUAdapter.prototype.requestDevice = async function (this: GPUAdapter, descriptor?: GPUDeviceDescriptor) {
      const device = await requestDevice.call(this, descriptor);
      device.destroy();
      const lost = Promise.resolve({ reason: "unknown", message: "the driver reset" } as GPUDeviceLostInfo);
      Object.defineProperty(device, "lost", { get: () => lost });
      return device;
    };
  });
  await page.goto(onFixture);
  await expect(page.getByText("lost the graphics card")).toBeVisible({ timeout: 60_000 });
  expect(await page.evaluate(() => window.__alandDrive?.frames() ?? 0)).toBe(0);
});
