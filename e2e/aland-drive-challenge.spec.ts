import type { Server } from "node:http";
import { serveTiles } from "../src/projects/aland-drive/tools/serve-tiles.mjs";
import { carAt, challengeOf as challenge, COUNTDOWN_STEPS, layChallenge, offStart, STEPS_A_SECOND } from "./aland-drive-route";
import { expect, test } from "./test";

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

test.use({ channel: "chromium", launchOptions: { args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--enable-gpu"] } });
test.setTimeout(120_000);

test("a solo Route: started from its ring by its button, held through the countdown, driven to a pass, retried mid-run and left", async ({ page }) => {
  await page.goto(onFixture);
  await page.waitForFunction(() => window.__alandDrive !== undefined && window.__alandDrive.frames() > 0, null, { timeout: 60_000 });
  const { challenge: laid } = await layChallenge(page, { id: ID, title: TITLE, target: { s: 600 } });
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
  const menu = page.getByRole("dialog", { name: "Game menu" });

  // The start's tile is loaded, so the car is on the line at once, in the challenge's car.
  expect(await challenge(page)).toMatchObject({ id: ID, attempt: 1, phase: "countdown", clockS: -3 });
  expect(await page.evaluate(() => window.__alandDrive?.carId())).toBe("sten");
  expect(await offStart(page, start)).toBeLessThan(0.3);
  await expect(page.getByLabel("Challenge", { exact: true })).toContainText(TITLE);

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
  expect(finished?.gates).toEqual({ passed: 3, of: 3 });
  expect(await page.evaluate((id) => window.__alandDrive?.challengeBest(id), ID)).toBe(finished?.outcome?.average);

  // The result card opens on Retry: Enter presses it, and the car is back on the line with a fresh clock.
  const result = page.getByRole("dialog", { name: "Challenge result" });
  await expect(result).toContainText("Passed");
  await expect(result.getByRole("button", { name: "Retry" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(result).toBeHidden();
  expect(await challenge(page)).toMatchObject({ attempt: 2, phase: "countdown", clockS: -3, outcome: null });
  expect(await offStart(page, start)).toBeLessThan(0.3);

  // Mid-run, the menu's Retry does the same.
  await page.evaluate((steps) => {
    const probe = window.__alandDrive;
    if (!probe) throw new Error("no probe");
    probe.advance(steps);
    probe.driveChallenge(20);
    probe.advance(4 * 120);
  }, COUNTDOWN_STEPS + 1);
  const midRun = await challenge(page);
  expect(midRun?.phase).toBe("running");
  expect(midRun?.clockS).toBeGreaterThan(3);
  expect(await offStart(page, start)).toBeGreaterThan(20);
  await page.keyboard.press("Escape");
  await menu.getByRole("button", { name: "Retry" }).click();
  await expect(menu).toBeHidden();
  expect(await challenge(page)).toMatchObject({ attempt: 3, phase: "countdown", clockS: -3 });
  expect(await offStart(page, start)).toBeLessThan(0.3);

  // Leaving gives back the car from before, where the car is now.
  const before = await carAt(page);
  await page.keyboard.press("Escape");
  await menu.getByRole("button", { name: "Leave challenge" }).click();
  await expect(menu).toBeHidden();
  expect(await challenge(page)).toBeNull();
  expect(await page.evaluate(() => window.__alandDrive?.carId())).toBe(PREVIOUS_CAR);
  const after = await carAt(page);
  expect(Math.hypot(after[0] - before[0], after[2] - before[2])).toBeLessThan(0.5);
  await expect(page.getByLabel("Challenge", { exact: true })).toBeHidden();
});
