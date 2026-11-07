// e2e-covers: src/projects/aland-drive/challenge/** src/projects/aland-drive/net/**
import type { Server } from "node:http";
import type { Browser, Page } from "@playwright/test";
import type { Challenge } from "../src/projects/aland-drive/challenge/types";
import { serveTiles } from "../src/projects/aland-drive/tools/serve-tiles.mjs";
import { along, carAt, challengeOf, COUNTDOWN_STEPS, layChallenge, offStart, STEPS_A_SECOND } from "./aland-drive-route";
import { LOCAL_RELAY } from "./relay";
import { expect, test } from "./test";

/*
 * A co-op challenge for two, on the run's own relay: two pages in a world of
 * their own (`?drive-world=`) on the fixture's one tile, with a Route of the
 * test's own (`aland-drive-route.ts`) given to both. Once the two are in its
 * ring, each page's simulation is held and stepped by hand, so every countdown
 * and run plays out the same however fast the machine draws; what crosses the
 * wire is waited on as an event (the probe's challenge state, and the count of
 * messages each page has heard). The invite goes to everyone in the world, so
 * the one who joins is down the road from the ring, and goes back there after.
 */

const PAGE = "/games/3d-games/aland-drive";
const FIXTURE_TILES = "src/projects/aland-drive/fixture";
const ID = "fixture-coop";
const TITLE = "Fixture co-op";
const PREVIOUS_CAR = "skerry-gt";
/** The scripted driver's speeds for a strong run and a weak one, and a target between them, as a speed over the route's length. */
const FAST_MS = 24;
const SLOW_MS = 12;
const TARGET_MS = 14;

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

async function joinWorld(browser: Browser, world: string, startMs = 90_000): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await page.goto(`${PAGE}?tiles=local:${tilesPort}&${LOCAL_RELAY}&drive-world=${world}`);
  await page.waitForFunction(() => window.__alandDrive?.online().status === "connected" && window.__alandDrive.mapReady(), null, { timeout: startMs });
  return page;
}

/** Steps a held page by hand, with the scripted driver along the challenge's route at this speed, until its own result is in or the run is over. */
const driveToResult = (page: Page, cruiseMS: number) =>
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

const heard = (page: Page, type: "retry" | "ready" | "result") => page.evaluate((kind) => window.__alandDrive?.coop().heard[kind] ?? 0, type);
/** Steps a held page by hand: flooring it, or with whatever drives the car (the scripted driver, or nothing). */
const advance = (page: Page, steps: number, floored = false) =>
  page.evaluate(({ count, floor }) => window.__alandDrive?.advance(count, floor ? { throttle: 1, brake: 0, steer: 0, handbrake: false } : undefined), { count: steps, floor: floored });
/** Waits until a page's run is on this attempt with both cars on their places and the lights counting down. */
const countingDown = (page: Page, attempt: number) =>
  page.waitForFunction((wanted) => {
    const run = window.__alandDrive?.challenge();
    return run?.attempt === wanted && run.phase === "countdown";
  }, attempt, { timeout: 30_000 });

test("a co-op Route for two: asked from its ring, joined from down the road, started and retried together, passed on the average, and left", async ({ browser }) => {
  const world = `coop-${crypto.randomUUID()}`;
  const first = await joinWorld(browser, world);
  const second = await joinWorld(browser, world);
  const { challenge, line } = await layChallenge(first, { id: ID, title: TITLE, target: { ms: TARGET_MS } });
  for (const page of [first, second]) await page.evaluate((added: Challenge) => window.__alandDrive?.addChallenge(added), challenge);

  // The first drives into the ring and the second is down the road, out of it: Co-op is offered all the same.
  const away = along(line, 200);
  await first.evaluate(({ x, z }) => window.__alandDrive?.placeNear(x, z), challenge.starts[0]);
  await second.evaluate(({ x, z }) => window.__alandDrive?.placeNear(x, z), away);
  await expect(first.getByLabel("Co-op with")).toBeVisible({ timeout: 30_000 });
  for (const page of [first, second]) await page.evaluate(() => window.__alandDrive?.hold(true));
  const [awayX, , awayZ] = await carAt(second);

  // The first's button offers Solo or Co-op; Co-op asks everyone, and the second's button answers it where it is.
  await first.keyboard.press("KeyE");
  const choice = first.getByRole("dialog", { name: "Start challenge" });
  await choice.getByRole("button", { name: /^Co-op/ }).click();
  await expect(choice).toBeHidden();
  await expect(second.getByLabel("Co-op invite")).toContainText(TITLE);
  await second.keyboard.press("KeyE");
  const invite = second.getByRole("dialog", { name: "Co-op invite" });
  await expect(invite.getByRole("button", { name: /^Join / })).toBeFocused();
  await second.keyboard.press("Enter");
  await expect(invite).toBeHidden();

  // Each is in its own seat, on its own place, in the challenge's car, and counting down once both are ready.
  await countingDown(first, 1);
  await countingDown(second, 1);
  expect(await challengeOf(first)).toMatchObject({ id: ID, seat: 0, players: 2, clockS: -3 });
  expect(await challengeOf(second)).toMatchObject({ id: ID, seat: 1, players: 2, clockS: -3 });
  for (const page of [first, second]) expect(await page.evaluate(() => window.__alandDrive?.carId())).toBe("sten");
  const startOf = (page: Page) => challenge.starts[page === first ? 0 : 1];

  // Flooring it through the countdown goes nowhere on either: each car is held until its own green.
  for (const page of [first, second]) {
    await advance(page, COUNTDOWN_STEPS - 1, true);
    expect((await challengeOf(page))?.phase).toBe("countdown");
    expect(await offStart(page, startOf(page))).toBeLessThan(0.3);
    await advance(page, 2);
    expect((await challengeOf(page))?.phase).toBe("running");
  }

  // Mid-run, the first's Retry takes both cars back to their places, on attempt 2, with fresh clocks.
  for (const page of [first, second]) {
    await page.evaluate(() => window.__alandDrive?.driveChallenge(20));
    await advance(page, 4 * STEPS_A_SECOND);
    expect(await offStart(page, startOf(page))).toBeGreaterThan(20);
  }
  const retriesHeard = await heard(second, "retry");
  await first.keyboard.press("Escape");
  const menu = first.getByRole("dialog", { name: "Game menu" });
  await menu.getByRole("button", { name: "Retry" }).click();
  await expect(menu).toBeHidden();
  await second.waitForFunction((before) => (window.__alandDrive?.coop().heard.retry ?? 0) > before, retriesHeard);
  await countingDown(first, 2);
  await countingDown(second, 2);
  for (const page of [first, second]) {
    expect(await challengeOf(page)).toMatchObject({ attempt: 2, clockS: -3, outcome: null });
    expect(await offStart(page, startOf(page))).toBeLessThan(0.3);
  }

  // Both retry before either hears the other: one new attempt, not two.
  const readies = await Promise.all([first, second].map((page) => heard(page, "ready")));
  for (const page of [first, second]) await page.evaluate(() => window.__alandDrive?.holdChallengeMessages(true));
  for (const page of [first, second]) expect(await page.evaluate(() => window.__alandDrive?.retryChallenge())).toBe(true);
  // Each page's ready for attempt 3 has reached the other, held behind its retry.
  for (const [index, page] of [first, second].entries()) {
    await page.evaluate(() => window.__alandDrive?.holdChallengeMessages(false));
    await page.waitForFunction((before) => (window.__alandDrive?.coop().heard.ready ?? 0) > before, readies[index]);
  }
  await countingDown(first, 3);
  await countingDown(second, 3);
  for (const page of [first, second]) expect((await challengeOf(page))?.attempt).toBe(3);

  // A fast run and a slow one: the slow one alone misses the target, and the average makes it, the same on both.
  for (const page of [first, second]) await advance(page, COUNTDOWN_STEPS);
  const fast = await driveToResult(first, FAST_MS);
  const fastS = fast?.results[0] ?? null;
  expect(fastS).not.toBeNull();
  expect(fastS).toBeLessThan(challenge.targetS);
  // The second hears the first's time before it drives on, and is shown what it now needs.
  await second.waitForFunction(() => window.__alandDrive?.challenge()?.results[0] !== null);
  await expect(second.getByLabel("Partner needs")).toContainText("Make it by");
  const slow = await driveToResult(second, SLOW_MS);
  expect(slow?.results[1]).toBeGreaterThan(challenge.targetS);
  expect(slow?.outcome?.passed).toBe(true);
  await first.waitForFunction(() => window.__alandDrive?.challenge()?.outcome != null);
  expect((await challengeOf(first))?.outcome).toEqual(slow?.outcome);
  for (const page of [first, second]) await expect(page.getByRole("dialog", { name: "Challenge result" })).toContainText("Passed");

  // The first leaves: it's over for the second, with a notice, and both have their cars back, the second where the invite took it from.
  await first.keyboard.press("Escape");
  await first.getByRole("dialog", { name: "Challenge result" }).waitFor({ state: "hidden" });
  expect(await challengeOf(first)).toBeNull();
  await second.waitForFunction(() => window.__alandDrive?.challenge() === null);
  await expect(second.getByLabel("Co-op notice")).toBeVisible();
  for (const page of [first, second]) expect(await page.evaluate(() => window.__alandDrive?.carId())).toBe(PREVIOUS_CAR);
  expect(await offStart(second, { x: awayX, z: awayZ })).toBeLessThan(1);
  expect(await offStart(first, challenge.starts[0])).toBeGreaterThan(20);

  await first.context().close();
  await second.context().close();
});

test("a world-wide invite joined by two at once: the first the inviter hears gets the seat, the other is told it was taken", async ({ browser }) => {
  // A page starts more slowly the more game pages are already drawing beside it, so the three start together, with time for that.
  test.setTimeout(480_000);
  const world = `coop-${crypto.randomUUID()}`;
  const [inviter, ...joiners] = await Promise.all([0, 1, 2].map(() => joinWorld(browser, world, 240_000)));
  const { challenge, line } = await layChallenge(inviter, { id: ID, title: TITLE, target: { ms: TARGET_MS } });
  for (const page of [inviter, ...joiners]) await page.evaluate((added: Challenge) => window.__alandDrive?.addChallenge(added), challenge);
  await inviter.evaluate(({ x, z }) => window.__alandDrive?.placeNear(x, z), challenge.starts[0]);
  for (const [index, page] of joiners.entries()) await page.evaluate(({ x, z }) => window.__alandDrive?.placeNear(x, z), along(line, 150 + 100 * index));
  await expect(inviter.getByLabel("Co-op with")).toHaveText("2", { timeout: 30_000 });
  for (const page of [inviter, ...joiners]) await page.evaluate(() => window.__alandDrive?.hold(true));

  await inviter.evaluate(() => window.__alandDrive?.coopInvite());
  for (const page of joiners) await expect(page.getByLabel("Co-op invite")).toContainText(TITLE);
  // Both join before either can hear the inviter's answer to the other.
  for (const page of joiners) await page.evaluate(() => window.__alandDrive?.holdChallengeMessages(true));
  for (const page of joiners) await page.evaluate(() => window.__alandDrive?.coopAccept());
  for (const page of joiners) await page.evaluate(() => window.__alandDrive?.holdChallengeMessages(false));

  await countingDown(inviter, 1);
  expect((await challengeOf(inviter))?.seat).toBe(0);
  const seats = await Promise.all(joiners.map(async (page) => (await page.waitForFunction(() => {
    const probe = window.__alandDrive;
    const run = probe?.challenge();
    if (run) return run.phase === "countdown" ? "seated" : null;
    return probe?.coop().kind === "free" ? "free" : null;
  }, null, { timeout: 30_000 })).jsonValue()));
  expect([...seats].sort()).toEqual(["free", "seated"]);
  const winner = joiners[seats.indexOf("seated")];
  const loser = joiners[seats.indexOf("free")];
  expect((await challengeOf(winner))?.seat).toBe(1);
  expect(await challengeOf(loser)).toBeNull();
  const notice = loser.getByLabel("Co-op notice");
  await expect(notice).toHaveAttribute("title", "Someone joined first");
  await expect(notice.getByLabel("Joined by")).toBeVisible();
  // The invite is gone for the one who missed it, and the pair isn't offered to it.
  expect(await loser.evaluate(() => window.__alandDrive?.coop().kind)).toBe("free");
  await expect(loser.getByLabel("Co-op invite")).toBeHidden();

  for (const page of [inviter, ...joiners]) await page.context().close();
});
