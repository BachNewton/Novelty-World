// e2e-covers: src/projects/aland-drive/render/shared-racers.ts src/projects/aland-drive/racers/{shared,grid}.ts src/projects/aland-drive/net/{computer-cars,online-world}.ts
import type { Server } from "node:http";
import type { Browser, Page } from "@playwright/test";
import type { RaceChallenge } from "../src/projects/aland-drive/challenge/types";
import { serveTiles } from "../src/projects/aland-drive/tools/serve-tiles.mjs";
import { along, layRace } from "./aland-drive-route";
import { LOCAL_RELAY } from "./relay";
import { expect, test } from "./test";
import { WEBGPU_BROWSER } from "./webgpu";

/*
 * A race's racers shared online, on the run's own relay: two pages in a world
 * of their own race one racer in a co-op race of the test's own on the
 * fixture's one tile. This is the wiring alone: the page whose start place is
 * nearest the racer puts it down and runs it, the other sees the same racer,
 * and once the other player is clearly nearer it (put down the road ahead of
 * it) the racer is handed over and drives on there. Who may run a racer, the
 * handover's rules and the record's round trip are `net/computer-cars.test.ts`'s
 * and `racers/shared.test.ts`'s. The race runs on the pages' own clocks.
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
  await page.goto(`${PAGE}?tiles=local:${tilesPort}&${LOCAL_RELAY}&drive-world=${world}&racers=1`);
  await page.waitForFunction(() => window.__alandDrive?.online().status === "connected" && window.__alandDrive.mapReady(), null, { timeout: 90_000 });
  return page;
}

/** The racers a page knows of: who runs each, how often it has changed hands, whether this page runs it, and where it is. */
const racersOf = (page: Page) =>
  page.evaluate(() =>
    (window.__alandDrive?.computerCars() ?? []).filter(({ driver }) => driver.kind === "racer").map(({ id, runner, handovers, runsHere, position }) => ({ id, runner, handovers, runsHere, position })),
  );

test("two pages race one racer, and it changes hands to the player who gets clearly nearer it", async ({ browser }) => {
  const world = `racers-${crypto.randomUUID()}`;
  const first = await joinWorld(browser, world);
  const second = await joinWorld(browser, world);
  const { race, line } = await layRace(first, { id: "fixture-shared-racer", title: "Fixture shared racer" });
  for (const page of [first, second]) await page.evaluate((added: RaceChallenge) => window.__alandDrive?.addChallenge(added), race);

  // A co-op race for two, asked from its ring, joined from down the road and started.
  await first.evaluate(({ x, z }) => window.__alandDrive?.placeNear(x, z), race.starts[0]);
  await first.waitForFunction(() => window.__alandDrive?.coop().kind === "free");
  await first.evaluate(() => window.__alandDrive?.coopInvite());
  await second.waitForFunction(() => window.__alandDrive?.coop().kind === "invited", null, { timeout: 30_000 });
  await second.evaluate(() => window.__alandDrive?.coopAccept());
  await first.waitForFunction(() => window.__alandDrive?.coop().joined.length === 1, null, { timeout: 30_000 });
  await first.evaluate(() => window.__alandDrive?.coopStart());
  for (const page of [first, second]) await page.waitForFunction(() => window.__alandDrive?.challenge()?.phase === "running", null, { timeout: 60_000 });

  // One racer, the same on both pages: the first's start place is nearest its grid place, so the first runs it.
  for (const page of [first, second]) expect(await page.evaluate(() => window.__alandDrive?.challenge()?.racers)).toBe(1);
  await second.waitForFunction(() => (window.__alandDrive?.computerCars() ?? []).some(({ driver }) => driver.kind === "racer"));
  const [onFirst] = await racersOf(first);
  const [onSecond] = await racersOf(second);
  expect(onFirst).toMatchObject({ runsHere: true, handovers: 0 });
  expect(onSecond).toMatchObject({ id: onFirst.id, runner: onFirst.runner, runsHere: false, handovers: 0 });

  // The second goes down the road ahead of the racer: once the racer is clearly nearer it than the first, it changes hands.
  const ahead = along(line, 300);
  await second.evaluate(({ x, z }) => window.__alandDrive?.placeNear(x, z), ahead);
  await second.waitForFunction(() => (window.__alandDrive?.computerCars() ?? []).some(({ driver, runsHere }) => driver.kind === "racer" && runsHere), null, { timeout: 60_000 });
  await first.waitForFunction(() => (window.__alandDrive?.computerCars() ?? []).some(({ driver, runsHere, handovers }) => driver.kind === "racer" && !runsHere && handovers === 1), null, { timeout: 30_000 });
  const [handed] = await racersOf(second);
  expect(handed).toMatchObject({ id: onFirst.id, handovers: 1, runsHere: true });

  // Run on the second now, it drives on there, and the first sees it go.
  const [hx, , hz] = handed.position;
  await first.waitForFunction(
    ({ x, z }) => {
      const racer = (window.__alandDrive?.computerCars() ?? []).find(({ driver }) => driver.kind === "racer");
      return racer !== undefined && Math.hypot(racer.position[0] - x, racer.position[2] - z) > 20;
    },
    { x: hx, z: hz },
    { timeout: 30_000 },
  );

  await first.context().close();
  await second.context().close();
});
