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
 * A co-op challenge for two, on the run's own relay: two pages in a world of
 * their own (`?drive-world=`) on the fixture's one tile, with a Route of the
 * test's own (`aland-drive-route.ts`) given to both. This is the wiring alone:
 * the invite, the join and the synced start crossing the relay, and leaving
 * ending it for both. Retries, results and every race between messages are
 * `challenge/coop.test.ts`'s. The invite goes to everyone in the world, so the
 * one who joins is down the road from the ring, and goes back there after.
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
test.setTimeout(180_000);

async function joinWorld(browser: Browser, world: string): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await page.goto(`${PAGE}?tiles=local:${tilesPort}&${LOCAL_RELAY}&drive-world=${world}`);
  await page.waitForFunction(() => window.__alandDrive?.online().status === "connected" && window.__alandDrive.mapReady(), null, { timeout: 90_000 });
  return page;
}

/** Waits until a page's run is on this attempt with both cars on their places and the lights counting down. */
const countingDown = (page: Page, attempt: number) =>
  page.waitForFunction((wanted) => {
    const run = window.__alandDrive?.challenge();
    return run?.attempt === wanted && run.phase === "countdown";
  }, attempt, { timeout: 30_000 });

test("a co-op Route for two: asked from its ring, joined from down the road over the relay, counted down together, and left", async ({ browser }) => {
  const world = `coop-${crypto.randomUUID()}`;
  const first = await joinWorld(browser, world);
  const second = await joinWorld(browser, world);
  const { challenge, line } = await layChallenge(first, { id: ID, title: TITLE, target: { s: 600 } });
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

  // The first leaves: it's over for the second, with a notice, and both have their cars back, the second where the invite took it from.
  await first.keyboard.press("Escape");
  await first.getByRole("dialog", { name: "Game menu" }).getByRole("button", { name: "Leave challenge" }).click();
  expect(await challengeOf(first)).toBeNull();
  await second.waitForFunction(() => window.__alandDrive?.challenge() === null);
  await expect(second.getByLabel("Co-op notice")).toBeVisible();
  for (const page of [first, second]) expect(await page.evaluate(() => window.__alandDrive?.carId())).toBe(PREVIOUS_CAR);
  expect(await offStart(second, { x: awayX, z: awayZ })).toBeLessThan(1);

  await first.context().close();
  await second.context().close();
});
