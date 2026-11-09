// e2e-covers: src/projects/aland-drive/challenge/{coop,session}.ts src/projects/aland-drive/net/online-world.ts
import type { Server } from "node:http";
import type { Browser, Page } from "@playwright/test";
import type { Challenge } from "../src/projects/aland-drive/challenge/types";
import { serveTiles } from "../src/projects/aland-drive/tools/serve-tiles.mjs";
import { along, carAt, challengeOf, layChallenge, offStart } from "./aland-drive-route";
import { LOCAL_RELAY } from "./relay";
import { expect, test } from "./test";
import { WEBGPU_BROWSER } from "./webgpu";

/*
 * A co-op challenge for four, on the run's own relay: four pages in a world of
 * their own (`?drive-world=`) on the fixture's one tile, with a Route of the
 * test's own (`aland-drive-route.ts`) given to each. This is the wiring alone:
 * the invite, three joins filling the room and starting it, the ready gate
 * across four pages, one leaving while the rest carry on, and a retry reaching
 * those still in. Results, the averages and every race between messages are
 * `challenge/coop.test.ts`'s. The invite goes to everyone in the world, so
 * those who join are down the road from the ring, and one goes back there
 * when it leaves. Four game pages are all the GPU pages the budget shares
 * out, so they're small, and each starts while the others stand still.
 */

const PAGE = "/games/3d-games/aland-drive";
const FIXTURE_TILES = "src/projects/aland-drive/fixture";
const ID = "fixture-coop";
const TITLE = "Fixture co-op";
const PREVIOUS_CAR = "skerry-gt";

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
test.setTimeout(240_000);

async function joinWorld(browser: Browser, world: string): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
  await page.goto(`${PAGE}?tiles=local:${tilesPort}&${LOCAL_RELAY}&drive-world=${world}`);
  await page.waitForFunction(() => window.__alandDrive?.online().status === "connected" && window.__alandDrive.mapReady(), null, { timeout: 90_000 });
  return page;
}

/** Waits until a page's run is on this attempt with every car still in on its place and the lights counting down. */
const countingDown = (page: Page, attempt: number) =>
  page.waitForFunction((wanted) => {
    const run = window.__alandDrive?.challenge();
    return run?.attempt === wanted && run.phase === "countdown";
  }, attempt, { timeout: 30_000 });

test("a co-op Route for four: asked from its ring, the room filled from down the road over the relay, counted down together, one leaving and the rest retrying", async ({ browser }) => {
  const world = `coop-${crypto.randomUUID()}`;
  // Each page starts while those before it stand still (`holdDrawing`): its pipelines compile on the browser's one GPU
  // process behind every frame the others draw, and a fourth page's never finished behind three drawing.
  const pages: Page[] = [];
  for (let count = 0; count < 4; count++) {
    const page = await joinWorld(browser, world);
    await page.evaluate(() => window.__alandDrive?.holdDrawing(true));
    pages.push(page);
  }
  for (const page of pages) await page.evaluate(() => window.__alandDrive?.holdDrawing(false));
  const [first, ...joiners] = pages;
  const { challenge, line } = await layChallenge(first, { id: ID, title: TITLE, target: { s: 600 } });
  for (const page of pages) await page.evaluate((added: Challenge) => window.__alandDrive?.addChallenge(added), challenge);

  // The first drives into the ring and the others are down the road, out of it: Co-op is offered all the same.
  await first.evaluate(({ x, z }) => window.__alandDrive?.placeNear(x, z), challenge.starts[0]);
  for (const [index, page] of joiners.entries()) await page.evaluate(({ x, z }) => window.__alandDrive?.placeNear(x, z), along(line, 200 + 60 * index));
  await expect(first.getByLabel("Co-op with")).toContainText("3", { timeout: 30_000 });
  for (const page of pages) await page.evaluate(() => window.__alandDrive?.hold(true));
  const [awayX, , awayZ] = await carAt(joiners[1]);

  // The first's button offers Solo or Co-op; Co-op asks everyone, and each joiner's button answers it where they are.
  await first.keyboard.press("KeyE");
  const choice = first.getByRole("dialog", { name: "Start challenge" });
  await choice.getByRole("button", { name: /^Co-op/ }).click();
  await expect(choice).toBeHidden();
  for (const [index, page] of joiners.entries()) {
    await expect(page.getByLabel("Co-op invite")).toContainText(TITLE);
    await page.keyboard.press("KeyE");
    const invite = page.getByRole("dialog", { name: "Co-op invite" });
    await expect(invite.getByRole("button", { name: /^Join / })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(invite).toBeHidden();
    // The invite stays open for more until the room is full, the inviter's HUD counting who's in.
    if (index < 2) await expect(first.getByLabel("Joined")).toContainText(String(index + 1));
  }

  // The third join filled the room, which started at once: each is in their own seat and place, in the challenge's car, counting down once all four are ready.
  for (const page of pages) await countingDown(page, 1);
  for (const [seat, page] of pages.entries()) {
    expect(await challengeOf(page)).toMatchObject({ id: ID, seat, players: 4, clockS: -3, teamReady: true });
    expect(await page.evaluate(() => window.__alandDrive?.carId())).toBe("sten");
    expect(await offStart(page, challenge.starts[seat])).toBeLessThan(0.3);
  }

  // The third player leaves: the rest carry on, told who left, and the one who left is back where the invite took them from.
  const [, second, third, fourth] = pages;
  await third.keyboard.press("Escape");
  await third.getByRole("dialog", { name: "Game menu" }).getByRole("button", { name: "Leave challenge" }).click();
  expect(await challengeOf(third)).toBeNull();
  expect(await third.evaluate(() => window.__alandDrive?.carId())).toBe(PREVIOUS_CAR);
  expect(await offStart(third, { x: awayX, z: awayZ })).toBeLessThan(1);
  const stillIn = [first, second, fourth];
  for (const page of stillIn) {
    await expect(page.getByLabel("Co-op notice")).toBeVisible();
    expect(await challengeOf(page)).toMatchObject({ id: ID, players: 4 });
    await page.waitForFunction(() => window.__alandDrive?.coop().team.length === 2);
  }

  // The second's Retry takes everyone still in back for the next attempt, the gate waiting for no one who has gone.
  expect(await second.evaluate(() => window.__alandDrive?.retryChallenge())).toBe(true);
  for (const page of stillIn) await countingDown(page, 2);

  for (const page of pages) await page.context().close();
});
