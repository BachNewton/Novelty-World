// e2e-covers: src/projects/aland-drive/challenge/{session,run,standings,grid-places}.ts src/projects/aland-drive/render/challenge-marks.ts src/projects/aland-drive/components/aland-drive.tsx src/projects/aland-drive/render/game-menu.ts src/projects/aland-drive/racers/{grid,racer,driver,racing-line,speed-plan,race-line-file}.ts
import type { Server } from "node:http";
import type { Page } from "@playwright/test";
import type { RaceChallenge } from "../src/projects/aland-drive/challenge/types";
import { serveTiles } from "../src/projects/aland-drive/tools/serve-tiles.mjs";
import { challengeOf, COUNTDOWN_STEPS, layRace, offStart, STEPS_A_SECOND } from "./aland-drive-route";
import { expect, test } from "./test";
import { WEBGPU_BROWSER } from "./webgpu";

/*
 * A race of the test's own on the fixture's one tile (`aland-drive-route.ts`),
 * a sprint played solo. The simulation is held and stepped by hand once the race
 * is chosen, so the countdown and the run play out the same however fast the
 * machine draws. This is the wiring alone: the card from the ring, the grid, the
 * finish and its result card, alone and against one racer, whose car takes a
 * grid place, drives the race's line (drawn here from the fixture's own roads,
 * since a race of the page's own has no line file) and sets the player's
 * place. Laps, co-op finishes and the bests kept are `challenge/race.test.ts`'s
 * and `passes.test.ts`'s; how a racer drives is `racers/`'s own tests' and the
 * vetting tool's.
 */

const PAGE = "/games/3d-games/aland-drive";
const FIXTURE_TILES = "src/projects/aland-drive/fixture";
const TITLE = "Fixture race";
/** The scripted driver's speed alone, and behind a racer, where it keeps out of the racer's way: this is wiring, not racecraft. */
const FAST_MS = 24;
const BEHIND_MS = 14;

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
test.setTimeout(120_000);

/** Steps a held page by hand, with the scripted driver along the race's route at this speed, until its own finish is in. */
const driveToFinish = (page: Page, cruiseMS: number, longestS = 240) =>
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
    { cruise: cruiseMS, limit: longestS * STEPS_A_SECOND },
  );

const advance = (page: Page, steps: number) => page.evaluate((count) => window.__alandDrive?.advance(count), steps);

test("a solo race: its card from its ring, the grid, and a finish in first for gold", async ({ page }) => {
  await page.goto(`${PAGE}?tiles=local:${tilesPort}&racers=0`);
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
  await page.keyboard.press("KeyF");
  const card = page.getByRole("dialog", { name: "Race" });
  await expect(card.getByLabel("Race card")).toContainText("T1");
  await expect(card.getByRole("button", { name: "Start" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(card).toBeHidden();
  expect(await challengeOf(page)).toMatchObject({ id: race.id, phase: "countdown", lap: { lap: 1, of: 1 } });
  expect(await offStart(page, race.grid[0])).toBeLessThan(0.3);
  expect(await page.evaluate(() => window.__alandDrive?.carId())).toBe("sten");
  await expect(page.getByLabel("Race", { exact: true })).toContainText(TITLE);

  // Over the finish line: first and gold, with no time shown.
  await advance(page, COUNTDOWN_STEPS + 1);
  const finished = await driveToFinish(page, FAST_MS);
  expect(finished?.outcome?.passed).toBe(true);
  const result = page.getByRole("dialog", { name: "Race result" });
  await expect(result.getByLabel("Place", { exact: true })).toHaveText("1st");
  await expect(result.getByLabel("Gold").first()).toBeVisible();
  await expect(result.getByLabel("Time")).toHaveCount(0);
  // Won, the card opens on Leave rather than Retry.
  await expect(result.getByRole("button", { name: "Leave race" })).toBeFocused();
});

test("a race against one racer: it takes a grid place, drives, and the player's place counts it", async ({ page }) => {
  await page.goto(`${PAGE}?tiles=local:${tilesPort}&racers=1`);
  await page.waitForFunction(() => window.__alandDrive !== undefined && window.__alandDrive.frames() > 0, null, { timeout: 60_000 });
  const { race } = await layRace(page, { id: "fixture-race-with-racer", title: TITLE });
  await page.evaluate((added: RaceChallenge) => {
    const probe = window.__alandDrive;
    if (!probe) throw new Error("no probe");
    probe.addChallenge(added);
    probe.hold(true);
  }, race);
  await page.evaluate((id) => window.__alandDrive?.startChallenge(id), race.id);
  // On the line with the lights to come, the racer is on the grid behind the player.
  expect(await challengeOf(page)).toMatchObject({ id: race.id, phase: "countdown", racers: 1, place: 1 });
  await advance(page, COUNTDOWN_STEPS + 1);
  // The player, driven gently by the scripted driver behind the racer, finishes second to it.
  const finished = await driveToFinish(page, BEHIND_MS, 400);
  expect(finished?.outcome?.passed).toBe(true);
  expect(finished?.racers).toBe(1);
  expect(finished?.place).toBe(2);
  const result = page.getByRole("dialog", { name: "Race result" });
  await expect(result.getByLabel("Place", { exact: true })).toHaveText("2nd");
  await expect(result.getByLabel("Silver").first()).toBeVisible();
  // Not won: the card opens on Retry, for another go at the gold.
  await expect(result.getByRole("button", { name: "Retry" })).toBeFocused();
});
