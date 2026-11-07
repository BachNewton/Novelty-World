import type { Server } from "node:http";
import type { Browser, Page } from "@playwright/test";
import { serveTiles } from "../src/projects/aland-drive/tools/serve-tiles.mjs";
import { LOCAL_RELAY } from "./relay";
import { expect, test } from "./test";

/*
 * Computer-driven cars online: each is run by the player nearest it and seen by
 * everyone. Two pages share a world on this run's own relay, with a scripted car
 * rolling along the fixture's start road, and take turns being nearest it.
 */

const PAGE = "/games/3d-games/aland-drive";
const FIXTURE_TILES = "src/projects/aland-drive/fixture";
const CAR_FROM_M = 180;
const CAR_SPEED_MS = 3;
/** Each player waits on the road behind the car: the first nearer it, the second further back. */
const FIRST_AT_M = 165;
const SECOND_AT_M = 120;
/** For the car to change hands, one player moves up this far behind it and the other drops back this far: clearly nearer, and neither in a fight with it. */
const MOVED_UP_M = 11;
const DROPPED_BACK_M = 50;
/**
 * The furthest the car may move in one step on either page: its own speed and
 * the most a stand-in closes on where it should be (4 m/s), with room for the
 * road's rise. Put somewhere rather than steered, as a jump would, it moves 6 m or more.
 */
const FURTHEST_STEP_M = (CAR_SPEED_MS + 4) / 120 + 0.03;
/** Read a moment apart, the pages see the car this near the same place: the one not running it sees it a send late. */
const SAME_PLACE_M = 1;

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

const seesOther = (page: Page) => page.waitForFunction(() => window.__alandDrive?.players().length === 1 && window.__alandDrive.players()[0].position !== null, null, { timeout: 30_000 });

/** Waits until this page has the car run here or elsewhere, after this many handovers; failing, says where everything was. */
async function runs(page: Page, here: boolean, handovers: number): Promise<void> {
  try {
    await page.waitForFunction(
      ([wantHere, wantHandovers]) => {
        const car = window.__alandDrive?.computerCars()[0];
        return car?.runsHere === wantHere && car.handovers === wantHandovers;
      },
      [here, handovers] as const,
      { timeout: 30_000 },
    );
  } catch (error) {
    const seen = await page.evaluate(() => ({ own: window.__alandDrive?.car().position, players: window.__alandDrive?.players(), cars: window.__alandDrive?.computerCars() }));
    throw new Error(`waiting for runsHere ${here} after ${handovers} handovers, the page had ${JSON.stringify(seen)}`, { cause: error });
  }
}

/** Puts this page's car on the road a distance behind the computer-driven car, as this page sees it. */
const behindCar = (page: Page, behind: number) =>
  page.evaluate((metres) => {
    const probe = window.__alandDrive;
    const along = probe?.computerCars()[0]?.driver.along;
    if (typeof along !== "number") throw new Error("no computer-driven car here");
    probe?.placeOnRoad(0, along - metres);
  }, behind);

const carOn = (page: Page) =>
  page.evaluate(() => {
    const cars = window.__alandDrive?.computerCars() ?? [];
    if (cars.length !== 1) throw new Error(`${cars.length} computer-driven cars here`);
    return cars[0];
  });

test("a computer-driven car is run by whichever player is nearest it, looks the same to both, and changes hands with no jump", async ({ browser }) => {
  const world = `computer-${crypto.randomUUID()}`;
  const first = await joinWorld(browser, world);
  const second = await joinWorld(browser, world);
  await seesOther(first);
  await seesOther(second);
  await first.evaluate((along) => window.__alandDrive?.placeOnRoad(0, along), FIRST_AT_M);
  await second.evaluate((along) => window.__alandDrive?.placeOnRoad(0, along), SECOND_AT_M);

  await first.evaluate(([along, speed]) => window.__alandDrive?.addScriptedCar(0, along, speed), [CAR_FROM_M, CAR_SPEED_MS] as const);
  await runs(first, true, 0);
  await runs(second, false, 0);

  // The second moves up behind it, nearer than the first: the car is the second's to run.
  await behindCar(first, DROPPED_BACK_M);
  await behindCar(second, MOVED_UP_M);
  await runs(second, true, 1);
  await runs(first, false, 1);

  // And back.
  await behindCar(second, DROPPED_BACK_M);
  await behindCar(first, MOVED_UP_M);
  await runs(first, true, 2);
  await runs(second, false, 2);

  const [onFirst, onSecond] = await Promise.all([carOn(first), carOn(second)]);
  expect(onSecond.id).toBe(onFirst.id);
  expect(onSecond.runner).toBe(onFirst.runner);
  expect(Math.hypot(onFirst.position[0] - onSecond.position[0], onFirst.position[1] - onSecond.position[1], onFirst.position[2] - onSecond.position[2])).toBeLessThan(SAME_PLACE_M);
  for (const seen of [onFirst, onSecond]) expect(seen.furthestStepM).toBeLessThan(FURTHEST_STEP_M);
  // It drove on throughout, rather than standing for the handovers: each waits half a second of a player being nearer.
  expect(onFirst.driver.along).toBeGreaterThan(CAR_FROM_M + 2 * 0.5 * CAR_SPEED_MS);

  await first.context().close();
  await second.context().close();
});
