// e2e-covers: src/projects/aland-drive/net/** src/projects/aland-drive/sim/remote-cars.ts src/projects/aland-drive/render/remote-cars.ts
import type { Server } from "node:http";
import type { Browser, Page } from "@playwright/test";
import { serveTiles } from "../src/projects/aland-drive/tools/serve-tiles.mjs";
import { GAME_DAY_S } from "../src/projects/aland-drive/time/day";
import { LOCAL_RELAY } from "./relay";
import { expect, test } from "./test";
import { WEBGPU_BROWSER } from "./webgpu";

/*
 * The online world: pages join one world on this run's own relay with no code,
 * the first hosting, and each drives its own car on the one committed tile.
 * Each test has a world of its own (`?drive-world=`), so tests never meet.
 */

const PAGE = "/games/3d-games/aland-drive";
const FIXTURE_TILES = "src/projects/aland-drive/fixture";
/** Where the fixture's start road puts the car, and somewhere further along it. */
const START_ALONG_M = 220;
const PARKED_ALONG_M = 270;

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
test.describe.configure({ mode: "serial" });
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

const ownPosition = (page: Page) => page.evaluate(() => window.__alandDrive?.car().position ?? null);
const othersPosition = (page: Page) => page.evaluate(() => window.__alandDrive?.players()[0]?.position ?? null);

test("two players share a world with no code, see each other drive and hit, and both show on both maps", async ({ browser }) => {
  const world = `both-${crypto.randomUUID()}`;
  const first = await joinWorld(browser, world);
  const second = await joinWorld(browser, world);
  expect(await first.evaluate(() => window.__alandDrive?.online().role)).toBe("host");
  expect(await second.evaluate(() => window.__alandDrive?.online().role)).toBe("guest");
  await seesOthers(first, 1);
  await seesOthers(second, 1);

  // The second drives off; the first sees it go, near where its own client has it.
  const from = await othersPosition(first);
  await second.keyboard.down("KeyW");
  await first.waitForFunction((start) => {
    const now = window.__alandDrive?.players()[0]?.position;
    return now !== undefined && now !== null && start !== null && Math.hypot(now[0] - start[0], now[2] - start[2]) > 10;
  }, from, { timeout: 30_000 });
  await second.keyboard.up("KeyW");
  // Held, the second's car stands still for everyone, and the first's copy settles where it is.
  await second.evaluate(() => window.__alandDrive?.hold(true));
  const own = await ownPosition(second);
  await first.waitForFunction((at) => {
    const heard = window.__alandDrive?.players()[0];
    return heard?.drawn === true && heard.position !== null && at !== null && Math.hypot(heard.position[0] - at[0], heard.position[2] - at[2]) < 0.5;
  }, own, { timeout: 30_000 });
  await second.evaluate(() => window.__alandDrive?.hold(false));

  // The second waits further up the road and the first drives into it: the second's own car is shoved.
  await second.evaluate((along) => window.__alandDrive?.placeOnRoad(0, along), PARKED_ALONG_M);
  await first.evaluate((along) => window.__alandDrive?.startRoute(0, 15, along), START_ALONG_M);
  await second.waitForFunction(() => {
    const velocity = window.__alandDrive?.car().velocity ?? [0, 0, 0];
    return Math.hypot(...velocity) > 3;
  }, null, { timeout: 30_000 });

  // Both maps show the other player, the world map wherever it looks.
  for (const page of [first, second]) await page.waitForFunction(() => window.__alandDrive?.mapPlayers().mini === 1);
  await second.keyboard.press("KeyM");
  await second.waitForFunction(() => window.__alandDrive?.mapShown() === 1 && window.__alandDrive.mapPlayers().world === 1);
  await second.mouse.move(640, 360);
  await second.mouse.wheel(0, 40_000);
  await second.waitForFunction(() => window.__alandDrive?.mapPlayers().world === 1);

  await first.context().close();
  await second.context().close();
});

test("when the host leaves, the one left hosts the world, and a newcomer finds them in it", async ({ browser }) => {
  const world = `handover-${crypto.randomUUID()}`;
  const host = await joinWorld(browser, world);
  const guest = await joinWorld(browser, world);
  await seesOthers(guest, 1);
  await host.context().close();

  await guest.waitForFunction(() => {
    const online = window.__alandDrive?.online();
    return online?.status === "connected" && online.role === "host" && window.__alandDrive?.players().length === 0;
  }, null, { timeout: 30_000 });
  const frames = await guest.evaluate(() => window.__alandDrive?.frames() ?? 0);
  await guest.waitForFunction((seen) => (window.__alandDrive?.frames() ?? 0) > seen + 10, frames);

  const newcomer = await joinWorld(browser, world);
  expect(await newcomer.evaluate(() => window.__alandDrive?.online().role)).toBe("guest");
  await seesOthers(newcomer, 1);
  await seesOthers(guest, 1);

  await guest.context().close();
  await newcomer.context().close();
});

const timeOf = (page: Page) => page.evaluate(() => window.__alandDrive?.day().gameDays ?? Number.NaN);
/** Within a few real seconds of each other: two pages are read a moment apart. */
const SAME_TIME_DAYS = 0.003;

test("everyone in the world shares the host's time, and it carries on when the host leaves", async ({ browser }) => {
  const world = `time-${crypto.randomUUID()}`;
  // Half a day from the real hour, so a page that kept its own time would be far off the host's.
  const hour = (new Date().getUTCHours() + 14) % 24;
  const host = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await host.goto(`${PAGE}?tiles=local:${tilesPort}&${LOCAL_RELAY}&drive-world=${world}&hour=${hour}`);
  await host.waitForFunction(() => window.__alandDrive?.online().status === "connected" && window.__alandDrive.mapReady(), null, { timeout: 90_000 });
  const guest = await joinWorld(browser, world);
  await guest.waitForFunction(
    ([hostTime, near]) => Math.abs((window.__alandDrive?.day().gameDays ?? 0) - hostTime) < near,
    [await timeOf(host), SAME_TIME_DAYS] as const,
    { timeout: 30_000 },
  );

  // The one left hosts on from the shared time, not from a clock of its own. A newcomer to it adopts its time as the
  // guest above adopted the first host's, so a third page would only start the game a third time.
  const [before, left] = [await timeOf(guest), Date.now()];
  await host.context().close();
  await guest.waitForFunction(() => window.__alandDrive?.online().role === "host", null, { timeout: 30_000 });
  const after = await timeOf(guest);
  const passed = (Date.now() - left) / 1000 / GAME_DAY_S;
  expect(after - before).toBeGreaterThanOrEqual(0);
  expect(after - before).toBeLessThan(passed + SAME_TIME_DAYS);

  await guest.context().close();
});
