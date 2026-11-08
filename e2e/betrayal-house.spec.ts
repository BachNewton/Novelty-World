import type { Page } from "@playwright/test";
import { test, expect } from "./test";
import { HOUSE } from "./betrayal-game";

/**
 * The Betrayal house demo's free camera, driven by real input: the mouse's
 * wheel and drags, one finger panning and two pinching, and the walls button
 * held by a finger that slides off it. What each input does is unit-tested
 * (`input/`, `shared/lib/input/gestures.test.ts`); these check the browser's
 * own events reach the camera. Every wait is on the view's own state
 * (window.__betrayalHouse), never a pause.
 */

// The house is WebGL: run it on the GPU, as the shots tools do, rather than a slow software renderer.
test.use({ launchOptions: { args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"] } });
test.setTimeout(90_000);

async function openHouse(page: Page): Promise<void> {
  page.on("pageerror", (error) => {
    throw error;
  });
  await page.goto(HOUSE);
  await page.waitForFunction(() => window.__betrayalHouse?.isReady() === true && window.__betrayalHouse.state().phase === "choosing" && !window.__betrayalHouse.state().walking, null, {
    timeout: 60_000,
  });
}

const cameraNow = (page: Page) =>
  page.evaluate(() => {
    const house = window.__betrayalHouse;
    if (!house) throw new Error("No house view");
    return house.camera();
  });

test("keyboard and mouse: the wheel zooms, a right-drag orbits, and a left-drag pans", async ({ page }) => {
  await openHouse(page);
  const centre = await page.evaluate(() => ({ x: window.innerWidth / 2, y: window.innerHeight / 2 }));
  const before = await cameraNow(page);
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.wheel(0, -300);
  await expect.poll(async () => (await cameraNow(page)).zoom).toBeGreaterThan(before.zoom);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(centre.x + 120, centre.y, { steps: 6 });
  await page.mouse.up({ button: "right" });
  expect((await cameraNow(page)).yaw).not.toBeCloseTo(before.yaw, 2);
  // Dragging up with the right button tilts the camera down towards eye level.
  await page.mouse.down({ button: "right" });
  await page.mouse.move(centre.x + 120, centre.y - 80, { steps: 6 });
  await page.mouse.up({ button: "right" });
  expect((await cameraNow(page)).pitch).toBeLessThan(before.pitch - 0.3);
  const turned = await cameraNow(page);
  await page.mouse.down();
  await page.mouse.move(centre.x - 100, centre.y + 60, { steps: 6 });
  await page.mouse.up();
  const panned = await cameraNow(page);
  expect(Math.hypot(panned.target.x - turned.target.x, panned.target.z - turned.target.z)).toBeGreaterThan(1);
  expect(panned.yaw).toBeCloseTo(turned.yaw, 5);
  // A drag is not a click: nothing was chosen.
  expect(await page.evaluate(() => window.__betrayalHouse?.state().explorers[0].room)).toBe("library");
});

test.describe("touch", () => {
  test.use({ viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true });

  test("holding the walls button raises the walls until the finger lifts, even slid off it", async ({ page }) => {
    await openHouse(page);
    const button = await page.getByRole("button", { name: "Raise the walls" }).boundingBox();
    if (!button) throw new Error("No walls button");
    const cdp = await page.context().newCDPSession(page);
    const [x, y] = [button.x + button.width / 2, button.y + button.height / 2];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
    await page.waitForFunction(() => window.__betrayalHouse?.state().wallsRaised === true);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - 120, id: 1 }] });
    expect(await page.evaluate(() => window.__betrayalHouse?.state().wallsRaised)).toBe(true);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForFunction(() => window.__betrayalHouse?.state().wallsRaised === false);
  });
});

test.describe("touch", () => {
  test.use({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true });

  test("one finger pans, and two fingers spread apart zoom in", async ({ page }) => {
    await openHouse(page);
    const cdp = await page.context().newCDPSession(page);
    type Finger = { x: number; y: number; id: number };
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", touchPoints: Finger[]) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints });
    /** Moves fingers from where they start to where they end, in steps, one event each. */
    const gesture = async (from: Finger[], to: Finger[]) => {
      await touch("touchStart", from);
      for (let step = 1; step <= 8; step++) {
        await touch(
          "touchMove",
          from.map((finger, i) => ({ id: finger.id, x: finger.x + ((to[i].x - finger.x) * step) / 8, y: finger.y + ((to[i].y - finger.y) * step) / 8 })),
        );
      }
      await touch("touchEnd", []);
    };
    const [cx, cy] = [206, 400];
    const before = await cameraNow(page);

    await gesture([{ x: cx, y: cy, id: 1 }], [{ x: cx - 120, y: cy + 40, id: 1 }]);
    const panned = await cameraNow(page);
    expect(Math.hypot(panned.target.x - before.target.x, panned.target.z - before.target.z)).toBeGreaterThan(1);
    expect(panned.zoom).toBe(before.zoom);

    await gesture(
      [
        { x: cx - 40, y: cy, id: 1 },
        { x: cx + 40, y: cy, id: 2 },
      ],
      [
        { x: cx - 120, y: cy, id: 1 },
        { x: cx + 120, y: cy, id: 2 },
      ],
    );
    const pinched = await cameraNow(page);
    expect(pinched.zoom).toBeGreaterThan(panned.zoom * 2);
    expect(pinched.yaw).toBeCloseTo(panned.yaw, 5);
    // No gesture chose anything.
    expect(await page.evaluate(() => window.__betrayalHouse?.state().walking)).toBe(false);
  });
});
