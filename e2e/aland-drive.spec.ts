import { expect, test } from "./test";

/*
 * The real game on the real renderer. Playwright's default headless shell has
 * no WebGPU here, so these ask for the full Chromium by name, with the switches
 * that let it use the machine's GPU.
 */

const PAGE = "/games/3d-games/aland-drive";

test.use({ channel: "chromium", launchOptions: { args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--enable-gpu"] } });
test.setTimeout(90_000);

test("the drive starts on WebGPU and the car moves under the keyboard", async ({ page }) => {
  await page.goto(PAGE);
  await page.waitForFunction(() => window.__alandDrive !== undefined && window.__alandDrive.frames() > 0, null, { timeout: 60_000 });

  const counts = await page.evaluate(() => window.__alandDrive?.counts());
  expect(counts?.webGpu).toBe(true);

  const start = await page.evaluate(() => window.__alandDrive?.car().position);
  await page.keyboard.down("KeyW");
  await page.waitForFunction(
    (from) => {
      const position = window.__alandDrive?.car().position;
      return position !== undefined && from !== undefined && Math.hypot(position[0] - from[0], position[2] - from[2]) > 5;
    },
    start,
    { timeout: 30_000 },
  );
  await page.keyboard.up("KeyW");

  await expect(page.getByRole("status")).not.toHaveText("0");
});

test("a browser that only gets WebGL2 is told the game needs WebGPU", async ({ page }) => {
  // The failure three hides: an adapter is there, the device can't be made, and it quietly drops to WebGL2.
  await page.addInitScript(() => {
    GPUAdapter.prototype.requestDevice = () => Promise.reject(new Error("no device in this test"));
  });
  await page.goto(PAGE);
  await expect(page.getByText("needs a browser with WebGPU")).toBeVisible({ timeout: 60_000 });
  expect(await page.evaluate(() => window.__alandDrive)).toBeUndefined();
});
