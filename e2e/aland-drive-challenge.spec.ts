// e2e-covers: src/projects/aland-drive/challenge/{session,run,conditions}.ts src/projects/aland-drive/render/{challenge-marks,day-and-night}.ts src/projects/aland-drive/components/game-menu.tsx
import type { Server } from "node:http";
import { serveTiles } from "../src/projects/aland-drive/tools/serve-tiles.mjs";
import { carAt, challengeOf as challenge, COUNTDOWN_STEPS, layChallenge, offStart, STEPS_A_SECOND } from "./aland-drive-route";
import { expect, test } from "./test";
import { WEBGPU_BROWSER } from "./webgpu";

/*
 * A solo challenge played on the fixture's one tile, a Route of the test's own
 * on its main road (`aland-drive-route.ts`), started from its ring by its own
 * button. The simulation is held and stepped by hand, so the countdown and the
 * run play out the same however fast the machine draws.
 */

const PAGE = "/games/3d-games/aland-drive";
const FIXTURE_TILES = "src/projects/aland-drive/fixture";
const ID = "fixture-sprint";
const TITLE = "Fixture sprint";
const PREVIOUS_CAR = "skerry-gt";

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

test.use(WEBGPU_BROWSER);
test.setTimeout(120_000);

test("a solo Route: started from its ring by its button, in its own conditions, held through the countdown, driven to a pass and left", async ({ page }) => {
  await page.goto(onFixture);
  await page.waitForFunction(() => window.__alandDrive !== undefined && window.__alandDrive.frames() > 0, null, { timeout: 60_000 });
  const { challenge: laid } = await layChallenge(page, { id: ID, title: TITLE, target: { s: 600 }, conditions: { date: { year: 2026, month: 10, day: 14 }, hour: 17.5, weather: "rain" } });
  expect(await page.evaluate(() => window.__alandDrive?.day().date)).not.toBe("2026-10-14");
  const [start] = laid.starts;
  await page.evaluate((added) => {
    const probe = window.__alandDrive;
    if (!probe) throw new Error("no probe");
    probe.addChallenge(added);
    // The simulation moves only when the test steps it, from here on.
    probe.hold(true);
    probe.placeNear(added.starts[0].x, added.starts[0].z);
  }, laid);
  expect(await page.evaluate(() => window.__alandDrive?.carId())).toBe(PREVIOUS_CAR);

  // In the ring, the HUD prompts its button, and with no one else there it starts the challenge solo at once.
  await expect(page.getByLabel("Challenge here")).toContainText(TITLE);
  await page.keyboard.press("KeyE");
  await expect(page.getByLabel("Challenge here")).toBeHidden();

  // The start's tile is loaded, so the car is on the line at once, in the challenge's car.
  expect(await challenge(page)).toMatchObject({ id: ID, attempt: 1, phase: "countdown", clockS: -3 });
  expect(await page.evaluate(() => window.__alandDrive?.carId())).toBe("sten");
  expect(await offStart(page, start)).toBeLessThan(0.3);
  await expect(page.getByLabel("Challenge", { exact: true })).toContainText(TITLE);

  // Its own date, hour and rain show over the tool page's dry day, behind the time cover, and the car drives on a wet road.
  await page.waitForFunction(() => window.__alandDrive?.day().date === "2026-10-14");
  expect(await page.evaluate(() => ({ hour: window.__alandDrive?.day().hour, rain: window.__alandDrive?.weather()?.state, ground: window.__alandDrive?.condition() }))).toEqual({ hour: 17.5, rain: "rain", ground: "wet" });

  // The run's Settings hold all but the tyres, which are the challenge's car's, and Esc steps back out to the run.
  await page.keyboard.press("Escape");
  await page.getByRole("dialog", { name: "Game menu" }).getByRole("button", { name: "Settings" }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await expect(settings.getByRole("button", { name: "ABS" })).toBeFocused();
  await expect(settings.getByRole("radiogroup", { name: "Tyres" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Game menu" })).toBeHidden();

  // Flooring it through the countdown goes nowhere: the car is held on the handbrake until green.
  await page.evaluate((steps) => window.__alandDrive?.advance(steps, { throttle: 1, brake: 0, steer: 0, handbrake: false }), COUNTDOWN_STEPS - 1);
  expect((await challenge(page))?.phase).toBe("countdown");
  expect(await offStart(page, start)).toBeLessThan(0.3);
  await page.evaluate(() => window.__alandDrive?.advance(2));
  expect((await challenge(page))?.phase).toBe("running");

  // The scripted driver takes it through every gate in order to the finish, inside the target.
  const finished = await page.evaluate((limit) => {
    const probe = window.__alandDrive;
    if (!probe) throw new Error("no probe");
    probe.driveChallenge(20);
    for (let step = 0; step < limit && !probe.challenge()?.outcome; step++) probe.advance(1);
    return probe.challenge();
  }, 120 * STEPS_A_SECOND);
  expect(finished?.outcome?.passed).toBe(true);
  await expect(page.getByRole("dialog", { name: "Challenge result" })).toContainText("Passed");

  // Esc on the result card leaves: the car from before is back, where the car is now.
  const before = await carAt(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Challenge result" })).toBeHidden();
  expect(await challenge(page)).toBeNull();
  expect(await page.evaluate(() => window.__alandDrive?.carId())).toBe(PREVIOUS_CAR);
  const after = await carAt(page);
  expect(Math.hypot(after[0] - before[0], after[2] - before[2])).toBeLessThan(0.5);
  await expect(page.getByLabel("Challenge", { exact: true })).toBeHidden();

  // Leaving gives back the world's day, which ran on beneath: its own date, no weather on a tool's page, and a dry road.
  await page.waitForFunction(() => window.__alandDrive?.weather() === null);
  const back = await page.evaluate(() => ({ date: window.__alandDrive?.day().date, ground: window.__alandDrive?.condition() }));
  expect(back.date).not.toBe("2026-10-14");
  expect(back.ground).toBe("dry");
});
