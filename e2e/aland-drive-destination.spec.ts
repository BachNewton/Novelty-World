import type { Server } from "node:http";
import type { Browser, Page } from "@playwright/test";
import { serveTiles } from "../src/projects/aland-drive/tools/serve-tiles.mjs";
import { LOCAL_RELAY } from "./relay";
import { expect, test } from "./test";

/*
 * The room's shared GPS destination, on this run's own relay: one player's
 * pick reaches a player who arrives after it, named for who set it, and a
 * later pick by anyone replaces it for everyone.
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

test.use({ channel: "chromium", launchOptions: { args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--enable-gpu"] } });
test.setTimeout(180_000);

async function joinWorld(browser: Browser, world: string): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await page.goto(`${PAGE}?tiles=local:${tilesPort}&${LOCAL_RELAY}&drive-world=${world}`);
  await page.waitForFunction(() => window.__alandDrive?.online().status === "connected" && window.__alandDrive.mapReady(), null, { timeout: 90_000 });
  return page;
}

/** Picks a place on the map this far from the car, as a click there would, and returns where the route ends. */
async function pick(page: Page, eastM: number, southM: number): Promise<[number, number]> {
  return page.evaluate(([east, south]) => {
    const game = window.__alandDrive;
    if (!game) throw new Error("no game");
    const [x, , z] = game.car().position;
    if (!game.setDestination(x + east, z + south)) throw new Error("no road to the pick");
    const points = game.routePoints() ?? [];
    return [points[points.length - 3], points[points.length - 1]];
  }, [eastM, southM]);
}

/** Waits until this page's GPS routes to the end given, set by another player. */
const routesTo = (page: Page, [x, z]: [number, number]) =>
  page.waitForFunction(([endX, endZ]) => {
    const game = window.__alandDrive;
    const points = game?.routePoints();
    if (!game || !points || game.routeSetter() === null) return false;
    return Math.hypot(points[points.length - 3] - endX, points[points.length - 1] - endZ) < 30;
  }, [x, z], { timeout: 30_000 });

test("a destination one player sets reaches a player who arrives later, and the latest pick is everyone's", async ({ browser }) => {
  const world = `destination-${crypto.randomUUID()}`;
  const first = await joinWorld(browser, world);
  const end = await pick(first, 400, 300);

  const second = await joinWorld(browser, world);
  await routesTo(second, end);

  const changed = await pick(second, -300, -400);
  await routesTo(first, changed);
  expect(await first.evaluate(() => window.__alandDrive?.routeSetter())).not.toBeNull();
  expect(await second.evaluate(() => window.__alandDrive?.routeSetter())).toBeNull();

  await first.context().close();
  await second.context().close();
});
