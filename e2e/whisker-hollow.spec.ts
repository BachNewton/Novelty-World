import type { Browser, Page } from "@playwright/test";
import { expect, test } from "./test";
import { LOCAL_RELAY } from "./relay";
import { LEVEL, SPAWN } from "../src/projects/whisker-hollow/level";
import type { World } from "../src/projects/whisker-hollow/types";
import { newWorld } from "../src/projects/whisker-hollow/world";

/**
 * Whisker Hollow: finding a pair, carrying both home and naming them, alone
 * and with a friend. Each test plays its own world (`?world=`) on this run's
 * relay, saved in the host's browser (`?save=local`), so nothing reaches
 * Supabase or the real relay. The host's browser starts with a saved world in
 * which one pair waits by the spawn, a few steps from their home, so the walks
 * are short and clear of junk. The page's probe (`window.__whiskerHollow`)
 * reports where the player stands, what interact would do, the camera, whether
 * the pointer is locked, and the world.
 */

/** Small, because the test browser draws the island in software: two islands at once share the CPU. */
const VIEWPORT = { width: 640, height: 400 };

type Probe = {
  frames(): number;
  position(): { x: number; z: number };
  heading(): number;
  locked(): boolean;
  camera(): { mode: "third" | "first"; yaw: number; pitch: number };
  target(): { kind: string; right?: boolean } | null;
  world(): World | null;
};
declare global {
  interface Window {
    __whiskerHollow?: Probe;
  }
}

/** The pair whose home is nearest the spawn, and a world with both of them waiting just short of it. */
const HOME = [...LEVEL.homes].sort((a, b) => Math.hypot(a.x - SPAWN.x, a.z - SPAWN.z) - Math.hypot(b.x - SPAWN.x, b.z - SPAWN.z))[0];
function worldWithPairNearby(): World {
  const world = newWorld();
  return {
    ...world,
    animals: world.animals.map((a) =>
      a.species !== HOME.species ? a : { ...a, where: { kind: "lost", at: { x: HOME.x, z: a.id.endsWith("/a") ? 14 : 12.6 } } },
    ),
  };
}

async function enterIsland(browser: Browser, world: string, name: string, saved: World | null = null): Promise<Page> {
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  if (saved !== null) {
    await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [`whisker-hollow:world:${world}`, JSON.stringify(saved)] as const);
  }
  await page.goto(`/games/3d-games/whisker-hollow?world=${world}&save=local&${LOCAL_RELAY}`);
  await page.getByLabel("Your name").fill(name);
  await page.getByRole("button", { name: "Onto the island" }).click();
  await page.waitForFunction(() => window.__whiskerHollow?.world() != null, null, { timeout: 120_000 });
  return page;
}

/**
 * Hold a key until `done` holds in the page. The camera starts behind the
 * player looking into the backyard's village, so D walks +x, A −x, S +z and
 * W −z.
 */
async function walkUntil(page: Page, key: string, done: () => boolean): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForFunction(done, null, { timeout: 60_000 });
  await page.keyboard.up(key);
}

async function walkAxis(page: Page, axis: "x" | "z", to: number): Promise<void> {
  const from = await page.evaluate((a) => window.__whiskerHollow?.position()[a] ?? 0, axis);
  const forward = to > from;
  const key = axis === "x" ? (forward ? "KeyD" : "KeyA") : forward ? "KeyS" : "KeyW";
  await page.keyboard.down(key);
  await page.waitForFunction(
    ([a, target, up]) => {
      const p = window.__whiskerHollow?.position()[a as "x" | "z"] ?? 0;
      return up ? p >= (target as number) : p <= (target as number);
    },
    [axis, to, forward] as const,
    { timeout: 60_000 },
  );
  await page.keyboard.up(key);
}

const canPickUp = () => window.__whiskerHollow?.target()?.kind === "pick-up";
const atRightHome = () => window.__whiskerHollow?.target()?.right === true;

// Software drawing is slow: a few steps take seconds.
test.describe.configure({ timeout: 240_000 });

test("find both of a pair, carry them home and name them", async ({ browser }) => {
  const page = await enterIsland(browser, `wh-solo-${Date.now()}`, "Sonja", worldWithPairNearby());

  await walkAxis(page, "x", HOME.x);
  await walkUntil(page, "KeyW", canPickUp);
  await page.keyboard.press("Space");
  await walkUntil(page, "KeyW", atRightHome);
  await page.keyboard.press("Space");
  await page.waitForFunction((n) => (window.__whiskerHollow?.world()?.animals.filter((a) => a.where.kind === "home").length ?? 0) === n, 1);

  // The second waits a step back the way they came.
  await walkUntil(page, "KeyS", canPickUp);
  await page.keyboard.press("Space");
  await walkUntil(page, "KeyW", atRightHome);
  await page.keyboard.press("Space");

  // Both home: the one who brought the second is asked for the pair's name.
  const name = page.getByLabel("Name", { exact: true });
  await expect(name).toBeVisible();
  await name.fill("Pip and Pop");
  await page.getByRole("button", { name: "Welcome home" }).click();
  await page.waitForFunction(() => window.__whiskerHollow?.world()?.pairs[0]?.naming?.name === "Pip and Pop");

  // The album remembers who named whom.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("listitem").filter({ hasText: "Pip and Pop" })).toContainText("Sonja");
  await page.context().close();
});

test("two friends share one island, and it stays when the host leaves", async ({ browser }) => {
  const world = `wh-coop-${Date.now()}`;
  const host = await enterIsland(browser, world, "Elliott", worldWithPairNearby());
  const guest = await enterIsland(browser, world, "Sonja");
  // The host comes first on the badge, then guests as they arrived.
  await expect(guest.getByTestId("players")).toHaveText("ElliottSonja");
  await expect(host.getByTestId("players")).toHaveText("ElliottSonja");

  // The guest picks up one of the pair; the host sees it carried.
  const carried = () => window.__whiskerHollow?.world()?.animals.some((a) => a.where.kind === "carried") === true;
  await walkAxis(guest, "x", HOME.x);
  await walkUntil(guest, "KeyW", canPickUp);
  await guest.keyboard.press("Space");
  await host.waitForFunction(carried);

  // The host leaves: the guest takes the island over, still carrying it.
  await host.context().close();
  await guest.waitForFunction(carried);
  await expect(guest.getByTestId("players")).toHaveText("Sonja");
  await guest.keyboard.press("Space");
  await guest.waitForFunction(() => window.__whiskerHollow?.world()?.animals.some((a) => a.where.kind === "carried") === false);
  await guest.context().close();
});

test("the mouse plays under pointer lock, in either view, and a lost lock pauses", async ({ browser }) => {
  const page = await enterIsland(browser, `wh-look-${Date.now()}`, "Elliott");
  const centre = { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 };
  // Pointer events are sent on the next frame, so the pointer is in place before the click locks it.
  await page.mouse.move(centre.x, centre.y);
  const frames = await page.evaluate(() => window.__whiskerHollow?.frames() ?? 0);
  await page.waitForFunction((n) => (window.__whiskerHollow?.frames() ?? 0) > n + 1, frames);
  await page.mouse.click(centre.x, centre.y);
  await page.waitForFunction(() => window.__whiskerHollow?.locked() === true);

  // First person: walking forward goes where the eyes look, and the caretaker faces it.
  await page.keyboard.press("KeyV");
  await page.waitForFunction(() => window.__whiskerHollow?.camera().mode === "first");
  const start = await page.evaluate(() => window.__whiskerHollow?.position().z ?? 0);
  await walkAxis(page, "z", start - 1);
  const look = await page.evaluate(() => ({ yaw: window.__whiskerHollow?.camera().yaw, heading: window.__whiskerHollow?.heading() }));
  expect(Math.cos((look.heading ?? 0) - Math.PI)).toBeCloseTo(1, 2);
  expect(look.yaw).toBeCloseTo(0, 2);

  // The mouse turns the view.
  await page.mouse.move(centre.x + 100, centre.y);
  await page.waitForFunction(() => Math.abs(window.__whiskerHollow?.camera().yaw ?? 0) > 0.1);

  // A card frees the mouse without pausing; closing it with its key locks it again.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Close" })).toBeVisible();
  await page.waitForFunction(() => window.__whiskerHollow?.locked() === false);
  await page.keyboard.press("Tab");
  await page.waitForFunction(() => window.__whiskerHollow?.locked() === true);
  await expect(page.getByRole("button", { name: "Resume" })).toHaveCount(0);

  // Losing the lock mid-play (Esc, another window) opens the pause menu; Resume locks again.
  await page.evaluate(() => document.exitPointerLock());
  const resume = page.getByRole("button", { name: "Resume" });
  await expect(resume).toBeVisible();
  await resume.click();
  await expect(resume).toBeHidden();
  await page.waitForFunction(() => window.__whiskerHollow?.locked() === true);

  await page.keyboard.press("KeyV");
  await page.waitForFunction(() => window.__whiskerHollow?.camera().mode === "third");
  await page.context().close();
});
