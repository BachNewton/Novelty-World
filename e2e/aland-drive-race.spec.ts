import type { Server } from "node:http";
import type { Browser, Page } from "@playwright/test";
import type { RaceChallenge } from "../src/projects/aland-drive/challenge/types";
import { serveTiles } from "../src/projects/aland-drive/tools/serve-tiles.mjs";
import { along, challengeOf, COUNTDOWN_STEPS, layRace, offStart, STEPS_A_SECOND } from "./aland-drive-route";
import { LOCAL_RELAY } from "./relay";
import { expect, test } from "./test";

/*
 * A race of the test's own on the fixture's one tile (`aland-drive-route.ts`),
 * a sprint whose rivals are timed at a pace of the test's choosing, played
 * solo and then as a co-op team on the run's own relay. Each page's simulation
 * is held and stepped by hand once the race is chosen, so the countdown and the
 * run play out the same however fast the machine draws. Laps, places and team
 * points have their fiddly cases in `challenge/race.test.ts`; this is the
 * whole loop in the game: the ring, the card, the grid, the finish, the result
 * card, the medal kept, retry and leave.
 */

const PAGE = "/games/3d-games/aland-drive";
const FIXTURE_TILES = "src/projects/aland-drive/fixture";
const TITLE = "Fixture race";
const PREVIOUS_CAR = "skerry-gt";
/** The rivals' pace, and the scripted driver's speeds for a run that beats them all and one that beats none. */
const PACE_MS = 16;
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
  const { race } = await layRace(page, { id: "fixture-race", title: TITLE, paceMS: PACE_MS });
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
  expect(await challengeOf(page)).toMatchObject({ id: race.id, phase: "countdown", lap: { lap: 1, of: 1 }, place: null });
  expect(await offStart(page, race.grid[0])).toBeLessThan(0.3);
  expect(await page.evaluate(() => window.__alandDrive?.carId())).toBe("sten");
  await expect(page.getByLabel("Race", { exact: true })).toContainText(TITLE);

  // Ahead of every rival at every line, and first at the finish: gold, kept as the solo medal with the time.
  await advance(page, COUNTDOWN_STEPS + 1);
  const finished = await driveToFinish(page, FAST_MS);
  expect(finished?.outcome?.passed).toBe(true);
  expect(finished?.place).toEqual({ place: 1, of: 4 });
  const result = page.getByRole("dialog", { name: "Race result" });
  await expect(result.getByLabel("Place", { exact: true })).toHaveText("1 / 4");
  await expect(result.getByLabel("Gold").first()).toBeVisible();
  expect(await page.evaluate((id) => window.__alandDrive?.challengeBest(id), race.id)).toBe(finished?.outcome?.average);

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

test("a co-op race for two: asked from the card, the front row, a winner carrying a last to bronze on the team's points", async ({ browser }) => {
  const world = `race-${crypto.randomUUID()}`;
  const first = await joinWorld(browser, world);
  const second = await joinWorld(browser, world);
  const { race, line } = await layRace(first, { id: "fixture-team-race", title: TITLE, paceMS: PACE_MS });
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

  // A win over three rivals (350 points) and a last (none) are 175 each: all but two beaten on average, bronze, on both.
  for (const page of [first, second]) await advance(page, COUNTDOWN_STEPS + 1);
  expect((await driveToFinish(first, FAST_MS))?.place).toEqual({ place: 1, of: 4 });
  await second.waitForFunction(() => window.__alandDrive?.challenge()?.results[0] !== null);
  const last = await driveToFinish(second, SLOW_MS);
  expect(last?.place).toEqual({ place: 4, of: 4 });
  await first.waitForFunction(() => window.__alandDrive?.challenge()?.outcome != null);
  expect((await challengeOf(first))?.outcome).toEqual(last?.outcome);
  for (const page of [first, second]) {
    const result = page.getByRole("dialog", { name: "Race result" });
    await expect(result.getByLabel("Team points per player")).toHaveText("175");
    await expect(result.getByLabel("Bronze").first()).toBeVisible();
    await expect(result.getByLabel("Places").getByRole("listitem")).toHaveCount(5);
  }
  expect(await first.evaluate((id) => window.__alandDrive?.challengeBest(id, "coop"), race.id)).toBe(last?.outcome?.average);
  expect(await first.evaluate((id) => window.__alandDrive?.challengeBest(id, "solo"), race.id)).toBeNull();

  await first.context().close();
  await second.context().close();
});
