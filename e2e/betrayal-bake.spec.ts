import { test, expect } from "./test";

/**
 * The Betrayal house's light bakes in the background, in passes: the house
 * is ready to play once its direct light shows, a small mark says the light
 * is still refining, with its progress for work of a kind that usually takes
 * a while (the bounce, many seconds of it on the house's first bake), the
 * house answers input while it bakes, and the mark goes when the light is
 * done. Every wait is on the view's own state (window.__betrayalHouse) or
 * the page, never a pause.
 */

const HOUSE = "/board-games/betrayal?house";
const MARK = "[data-bake-indicator]";

// The house is WebGL: run it on the GPU, as the shots tools do, rather than a slow software renderer.
test.use({ launchOptions: { args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"] } });
test.setTimeout(240_000);

test("the house is ready on its direct light, answers input while the rest bakes, and the refining mark comes and goes", async ({ page }) => {
  page.on("pageerror", (error) => {
    throw error;
  });
  await page.goto(HOUSE);
  await page.waitForFunction(() => window.__betrayalHouse?.isReady() === true, null, { timeout: 120_000 });
  // Ready to play with the bounce still on its way, and the mark saying so, with its progress.
  expect(await page.evaluate(() => window.__betrayalHouse?.isFullyLit())).toBe(false);
  await expect(page.locator(`${MARK}[data-bake-indicator="progress"]`)).toBeVisible();

  // The wheel zooms at once, while the bake is still running.
  const canvas = page.locator("canvas").first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("No canvas");
  const before = await page.evaluate(() => window.__betrayalHouse?.camera().zoom ?? 0);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -400);
  const zoomed = await page.waitForFunction((was) => {
    const house = window.__betrayalHouse;
    return house && house.camera().zoom !== was ? { pending: house.bake().pending } : null;
  }, before);
  expect(await zoomed.jsonValue()).toEqual({ pending: true });

  // Frames keep coming while it bakes.
  const frame = await page.evaluate(() => window.__betrayalHouse?.frameCount() ?? 0);
  const drawing = await page.waitForFunction((from) => {
    const house = window.__betrayalHouse;
    return house && house.frameCount() >= from + 10 ? { pending: house.bake().pending } : null;
  }, frame);
  expect(await drawing.jsonValue()).toEqual({ pending: true });

  // The mark goes when the light is done.
  await expect(page.locator(MARK)).toHaveCount(0, { timeout: 180_000 });
  expect(await page.evaluate(() => window.__betrayalHouse?.isFullyLit())).toBe(true);
  expect(await page.evaluate(() => window.__betrayalHouse?.bake())).toMatchObject({ pending: false, done: 0, total: 0 });
});
