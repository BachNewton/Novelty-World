import { cpSync, mkdtempSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serveTiles } from "../src/projects/aland-drive/tools/serve-tiles.mjs";
import { expect, test } from "./test";

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

test.use({ channel: "chromium", launchOptions: { args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--enable-gpu"] } });
test.setTimeout(90_000);

test("the drive starts on WebGPU and the car moves under the keyboard", async ({ page }) => {
  await page.goto(onFixture);
  await page.waitForFunction(() => window.__alandDrive !== undefined && window.__alandDrive.frames() > 0, null, { timeout: 60_000 });

  const counts = await page.evaluate(() => window.__alandDrive?.counts());
  expect(counts?.webGpu).toBe(true);

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

test("a place picked on the world map sets a route on both maps, and the map closes back to the drive", async ({ page }) => {
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
  await expect(page.getByLabel("Next direction")).toBeVisible();

  // Clearing goes through the map, and takes the direction with it.
  await page.keyboard.press("KeyM");
  await expect(map).toBeVisible();
  await page.keyboard.press("KeyX");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__alandDrive?.routePoints() === null);
});

test("a browser that only gets WebGL2 is told the game needs WebGPU", async ({ page }) => {
  // The failure three hides: an adapter is there, the device can't be made, and it quietly drops to WebGL2.
  await page.addInitScript(() => {
    GPUAdapter.prototype.requestDevice = () => Promise.reject(new Error("no device in this test"));
  });
  await page.goto(onFixture);
  await expect(page.getByText("needs a browser with WebGPU")).toBeVisible({ timeout: 60_000 });
  expect(await page.evaluate(() => window.__alandDrive)).toBeUndefined();
});

test("a tile that can't be fetched says so, and the page doesn't pretend otherwise", async ({ page }) => {
  // A world whose tiles aren't there: the same path a dropped connection or a bad deploy takes.
  const folder = mkdtempSync(join(tmpdir(), "aland-drive-"));
  for (const file of ["world.json", "overview-heights.bin.gz", "overview.webp", "map.json.gz"]) cpSync(`${FIXTURE_TILES}/${file}`, join(folder, file));
  const { server, port } = await serveTiles(folder);
  await page.goto(`${PAGE}?tiles=local:${port}`);
  await expect(page.getByText("lost part of the map")).toContainText(": 404", { timeout: 60_000 });
  expect(await page.evaluate(() => window.__alandDrive)).toBeUndefined();
  server.close();
  rmSync(folder, { recursive: true });
});
