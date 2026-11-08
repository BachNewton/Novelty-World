// e2e-covers: src/projects/aland-drive/net/{online-world,protocol}.ts src/projects/aland-drive/render/remote-cars.ts
import type { Server } from "node:http";
import type { Browser, Page } from "@playwright/test";
import { serveTiles } from "../src/projects/aland-drive/tools/serve-tiles.mjs";
import { LOCAL_RELAY } from "./relay";
import { expect, test } from "./test";
import { WEBGPU_BROWSER } from "./webgpu";

/*
 * The online world's wiring: two pages join one world on this run's own relay
 * with no code, the first hosting, and one sees the other's car drive. What the
 * world shares, and a host leaving, are `net/online-world.test.ts`'s; two cars
 * hitting each other is `sim/remote-cars.test.ts`'s.
 */

const PAGE = "/games/3d-games/aland-drive";
const FIXTURE_TILES = "src/projects/aland-drive/fixture";

let tiles: Server;
let tilesPort: number;

test.beforeAll(async () => {
  const { server, port } = await serveTiles(FIXTURE_TILES);
  tiles = server;
  tilesPort = port;
});

test.afterAll(() => {
  tiles.close();
});

test.use(WEBGPU_BROWSER);
test.setTimeout(180_000);

async function joinWorld(browser: Browser, world: string): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await page.goto(`${PAGE}?tiles=local:${tilesPort}&${LOCAL_RELAY}&drive-world=${world}`);
  await page.waitForFunction(() => window.__alandDrive?.online().status === "connected" && window.__alandDrive.mapReady(), null, { timeout: 90_000 });
  return page;
}

/** Waits until this page has another player's car, and returns where it is. */
const seesOthers = (page: Page, count: number) =>
  page.waitForFunction((wanted) => {
    const players = window.__alandDrive?.players() ?? [];
    return players.length === wanted && players.every((player) => player.position !== null);
  }, count, { timeout: 30_000 });

const othersPosition = (page: Page) => page.evaluate(() => window.__alandDrive?.players()[0]?.position ?? null);

test("two players share a world with no code, and one sees the other drive", async ({ browser }) => {
  const world = `both-${crypto.randomUUID()}`;
  const first = await joinWorld(browser, world);
  const second = await joinWorld(browser, world);
  expect(await first.evaluate(() => window.__alandDrive?.online().role)).toBe("host");
  expect(await second.evaluate(() => window.__alandDrive?.online().role)).toBe("guest");
  await seesOthers(first, 1);

  // The second drives off; the first sees it go, and draws it.
  const from = await othersPosition(first);
  await second.keyboard.down("KeyW");
  await first.waitForFunction((start) => {
    const now = window.__alandDrive?.players()[0]?.position;
    return now !== undefined && now !== null && start !== null && Math.hypot(now[0] - start[0], now[2] - start[2]) > 10;
  }, from, { timeout: 30_000 });
  await second.keyboard.up("KeyW");
  await first.waitForFunction(() => window.__alandDrive?.players()[0]?.drawn === true);

  await first.context().close();
  await second.context().close();
});
