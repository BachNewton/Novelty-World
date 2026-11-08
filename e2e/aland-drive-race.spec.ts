// e2e-covers: src/projects/aland-drive/challenge/{session,run,standings}.ts src/projects/aland-drive/render/challenge-marks.ts src/projects/aland-drive/components/aland-drive.tsx
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
 * finish and its result card. Laps, co-op finishes and the bests kept are
 * `challenge/race.test.ts`'s and `passes.test.ts`'s. With no racers yet, a
 * finish is first.
 */

const PAGE = "/games/3d-games/aland-drive";
const FIXTURE_TILES = "src/projects/aland-drive/fixture";
const TITLE = "Fixture race";
/** The scripted driver's speed. */
const FAST_MS = 24;

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

test("a solo race: its card from its ring, the grid, and a finish in first for gold", async ({ page }) => {
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

  // Over the finish line: first and gold, with no time shown.
  await advance(page, COUNTDOWN_STEPS + 1);
  const finished = await driveToFinish(page, FAST_MS);
  expect(finished?.outcome?.passed).toBe(true);
  const result = page.getByRole("dialog", { name: "Race result" });
  await expect(result.getByLabel("Place", { exact: true })).toHaveText("1st");
  await expect(result.getByLabel("Gold").first()).toBeVisible();
  await expect(result.getByLabel("Time")).toHaveCount(0);
});
