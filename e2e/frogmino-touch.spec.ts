import { test, expect, devices } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * Frogmino's touch controls on an emulated phone. The touch layer mirrors
 * the frog's rule state in data attributes, so every wait is on the game's
 * own state, never a pause.
 */
const PIXEL = devices["Pixel 7"];
test.use({ viewport: PIXEL.viewport, deviceScaleFactor: PIXEL.deviceScaleFactor, isMobile: true, hasTouch: true });

const SOLO = "/games/3d-games/frogmino?play=solo";

// Playwright's touchscreen only taps, so a swipe goes through the DevTools
// protocol as a real touch sequence.
async function swipe(page: Page, x: number, fromY: number, toY: number): Promise<void> {
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

test("a swipe up hops and a tap in the centre jumps forward", async ({ page }) => {
  await page.goto(SOLO);
  const layer = page.getByTestId("frogmino-touch");
  await expect(layer).toBeVisible({ timeout: 30_000 });
  const box = await layer.boundingBox();
  if (box === null) throw new Error("The touch layer has no box");
  const centreX = box.x + box.width / 2;
  const centreY = box.y + box.height / 2;

  await expect(layer).toHaveAttribute("data-hopped-at", "");
  await swipe(page, centreX, centreY + 40, centreY - 60);
  await expect(layer).toHaveAttribute("data-hopped-at", /\d/);

  const startDepth = await layer.getAttribute("data-frog-depth");
  if (startDepth === null) throw new Error("The touch layer has no frog depth");
  await page.touchscreen.tap(centreX, centreY);
  await expect(layer).not.toHaveAttribute("data-frog-depth", startDepth);
});
