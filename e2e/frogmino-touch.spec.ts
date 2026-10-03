import { test, expect, devices } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * Frogmino's touch controls on an emulated phone. The game mirrors
 * the frog's rule state in data attributes, so every wait is on the game's
 * own state, never a pause.
 */
const PIXEL = devices["Pixel 7"];
test.use({ viewport: PIXEL.viewport, deviceScaleFactor: PIXEL.deviceScaleFactor, isMobile: true, hasTouch: true });

const SOLO = "/games/3d-games/frogmino?play=solo";

// Playwright's touchscreen only taps, so a drag goes through the DevTools
// protocol as a real touch sequence.
async function drag(page: Page, x: number, fromY: number, toY: number): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const point = (y: number) => [{ x, y, id: 1 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(fromY) });
  const steps = 6;
  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: point(fromY + ((toY - fromY) * i) / steps),
    });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

test("a drag up drops the frog from the overpass, and then a tap in the centre hops", async ({ page }) => {
  await page.goto(SOLO);
  const layer = page.getByTestId("frogmino-touch");
  const game = page.getByTestId("frogmino-game");
  await expect(layer).toBeVisible({ timeout: 30_000 });
  const box = await layer.boundingBox();
  if (box === null) throw new Error("The touch layer has no box");
  const centreX = box.x + box.width / 2;
  const centreY = box.y + box.height / 2;

  // The frog starts on the overpass, where a hop does nothing; a jump
  // forward drops it onto the road.
  await expect(game).toHaveAttribute("data-depth", "0");
  await drag(page, centreX, centreY + 20, centreY - 30);
  await expect(game).not.toHaveAttribute("data-depth", "0");

  await expect(game).toHaveAttribute("data-hopped-at", "");
  await page.touchscreen.tap(centreX, centreY);
  await expect(game).toHaveAttribute("data-hopped-at", /\d/);

  // Pieces change at gates in the road, so there is nothing to swap.
  await expect(page.getByRole("button", { name: "Swap" })).toHaveCount(0);
});
