import type { Server } from "node:http";
import type { Browser, Page } from "@playwright/test";
import type { RaceChallenge } from "../src/projects/aland-drive/challenge/types";
import { serveTiles } from "../src/projects/aland-drive/tools/serve-tiles.mjs";
import { along, challengeOf, COUNTDOWN_STEPS, layRace, offStart, STEPS_A_SECOND } from "./aland-drive-route";
import { LOCAL_RELAY } from "./relay";
import { expect, test } from "./test";

/*
 * A race of the test's own on the fixture's one tile (`aland-drive-route.ts`),
 * a sprint, played solo and then as a co-op team on the run's own relay. Each
 * page's simulation is held and stepped by hand once the race is chosen, so the
 * countdown and the run play out the same however fast the machine draws. Laps
 * have their fiddly cases in `challenge/race.test.ts`; this is the whole loop
 * in the game: the ring, the card, the grid, the finish, the result card, the
 * medal kept, retry and leave. With no racers yet, a finish is first.
 */

const PAGE = "/games/3d-games/aland-drive";
const FIXTURE_TILES = "src/projects/aland-drive/fixture";
const TITLE = "Fixture race";
const PREVIOUS_CAR = "skerry-gt";
/** The scripted driver's speeds for two players, one quicker than the other. */
const FAST_MS = 24;
const SLOW_MS = 12;

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
test.setTimeout(240_000);

/** Steps a held page by hand, with the scripted driver along the race's route at this speed, until its own finish is in. */
const driveToFinish = (page: Page, cruiseMS: number) =>
  page.evaluate(
    ({ cruise, limit }) => {
      const probe = window.__alandDrive;
      if (!probe) throw new Error("no probe");
      probe.driveChallenge(cruise);
      for (let step = 0; step < limit; step++) {
        const run = probe.challenge();
        if (!run || run.outcome || run.results[run.seat] !== null) break;
        probe.advance(1);
      }
      return probe.challenge();
    },
    { cruise: cruiseMS, limit: 240 * STEPS_A_SECOND },
  );

const advance = (page: Page, steps: number) => page.evaluate((count) => window.__alandDrive?.advance(count), steps);

test("a solo race: its card from its ring, the grid, a finish in first for gold, kept, retried and left", async ({ page }) => {
  await page.goto(`${PAGE}?tiles=local:${tilesPort}`);
  await page.waitForFunction(() => window.__alandDrive !== undefined && window.__alandDrive.frames() > 0, null, { timeout: 60_000 });
  const { race } = await layRace(page, { id: "fixture-race", title: TITLE });
  await page.evaluate((added: RaceChallenge) => {
    const probe = window.__alandDrive;
    if (!probe) throw new Error("no probe");
    probe.addChallenge(added);
    probe.hold(true);
    probe.placeNear(added.starts[0].x, added.starts[0].z);
  }, race);

  // In the ring, the button opens the race's card, even alone, and its Start puts the car on the pole.
  await expect(page.getByLabel("Race here")).toContainText(TITLE);
  await page.keyboard.press("KeyE");
  const card = page.getByRole("dialog", { name: "Race" });
  await expect(card.getByLabel("Race card")).toContainText("T1");
  await expect(card.getByRole("button", { name: "Start" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(card).toBeHidden();
  expect(await challengeOf(page)).toMatchObject({ id: race.id, phase: "countdown", lap: { lap: 1, of: 1 } });
  expect(await offStart(page, race.grid[0])).toBeLessThan(0.3);
  expect(await page.evaluate(() => window.__alandDrive?.carId())).toBe("sten");
  await expect(page.getByLabel("Race", { exact: true })).toContainText(TITLE);

  // Over the finish line: first, gold, and first kept as the solo best, with no time shown.
  await advance(page, COUNTDOWN_STEPS + 1);
  const finished = await driveToFinish(page, FAST_MS);
  expect(finished?.outcome?.passed).toBe(true);
  const result = page.getByRole("dialog", { name: "Race result" });
  await expect(result.getByLabel("Place", { exact: true })).toHaveText("1st");
  await expect(result.getByLabel("Gold").first()).toBeVisible();
  await expect(result.getByLabel("Time")).toHaveCount(0);
  expect(await page.evaluate((id) => window.__alandDrive?.challengeBest(id), race.id)).toBe(1);

  // Retry from the result card puts the car back on the pole; Leave gives the car from before back.
  await result.getByRole("button", { name: "Retry" }).click();
  expect(await challengeOf(page)).toMatchObject({ attempt: 2, phase: "countdown" });
  expect(await offStart(page, race.grid[0])).toBeLessThan(0.3);
  await page.keyboard.press("Escape");
  await page.getByRole("dialog", { name: "Game menu" }).getByRole("button", { name: "Leave race" }).click();
  expect(await challengeOf(page)).toBeNull();
  expect(await page.evaluate(() => window.__alandDrive?.carId())).toBe(PREVIOUS_CAR);
});

async function joinWorld(browser: Browser, world: string): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await page.goto(`${PAGE}?tiles=local:${tilesPort}&${LOCAL_RELAY}&drive-world=${world}`);
  await page.waitForFunction(() => window.__alandDrive?.online().status === "connected" && window.__alandDrive.mapReady(), null, { timeout: 90_000 });
  return page;
}

test("a co-op race for two: asked from the card, the front row, over once both have finished, first and gold on both", async ({ browser }) => {
  const world = `race-${crypto.randomUUID()}`;
  const first = await joinWorld(browser, world);
  const second = await joinWorld(browser, world);
  const { race, line } = await layRace(first, { id: "fixture-team-race", title: TITLE });
  for (const page of [first, second]) await page.evaluate((added: RaceChallenge) => window.__alandDrive?.addChallenge(added), race);
  await first.evaluate(({ x, z }) => window.__alandDrive?.placeNear(x, z), race.starts[0]);
  await second.evaluate(({ x, z }) => window.__alandDrive?.placeNear(x, z), along(line, 7));
  await expect(first.getByLabel("Co-op with")).toBeVisible({ timeout: 30_000 });
  for (const page of [first, second]) await page.evaluate(() => window.__alandDrive?.hold(true));

  // The card offers Co-op with the other player in the ring, who joins with the same button.
  await first.keyboard.press("KeyE");
  const card = first.getByRole("dialog", { name: "Race" });
  await card.getByRole("button", { name: /^Co-op with / }).click();
  await expect(second.getByLabel("Co-op invite")).toContainText(TITLE);
  await second.keyboard.press("KeyE");
  await second.getByRole("dialog", { name: "Co-op invite" }).getByRole("button", { name: /^Join / }).click();
  for (const page of [first, second]) await page.waitForFunction(() => window.__alandDrive?.challenge()?.phase === "countdown", null, { timeout: 30_000 });
  expect(await offStart(first, race.grid[0])).toBeLessThan(0.3);
  expect(await offStart(second, race.grid[1])).toBeLessThan(0.3);

  // The first over the line waits for the second; once both are over, it's the same finish on both, first and gold.
  for (const page of [first, second]) await advance(page, COUNTDOWN_STEPS + 1);
  expect((await driveToFinish(first, FAST_MS))?.outcome).toBeNull();
  await second.waitForFunction(() => window.__alandDrive?.challenge()?.results[0] !== null);
  const last = await driveToFinish(second, SLOW_MS);
  expect(last?.outcome?.passed).toBe(true);
  await first.waitForFunction(() => window.__alandDrive?.challenge()?.outcome != null);
  expect((await challengeOf(first))?.outcome).toEqual(last?.outcome);
  for (const page of [first, second]) {
    const result = page.getByRole("dialog", { name: "Race result" });
    await expect(result.getByLabel("Place", { exact: true })).toHaveText("1st");
    await expect(result.getByLabel("Gold").first()).toBeVisible();
  }
  expect(await first.evaluate((id) => window.__alandDrive?.challengeBest(id, "coop"), race.id)).toBe(1);
  expect(await first.evaluate((id) => window.__alandDrive?.challengeBest(id, "solo"), race.id)).toBeNull();

  await first.context().close();
  await second.context().close();
});
