import type { Page } from "@playwright/test";
import { test, expect } from "./test";
import { BUTTON, frames, holdButton, pointOf, readout, resume, seededGame, tapButton, until, withPad } from "./betrayal-game";

/**
 * Things that live in rooms (v1): Zoe drops the Revolver in the Entrance
 * Hall and ends her turn, and it lies there on its plate, an object of the
 * room. On Ox's turn, pointing at it names it, choosing it opens its card's
 * text over it, and its Pick up there is the turn's own (a card dropped this
 * turn can't be picked up again in it): the card goes to his hand and
 * leaves the floor. The same on each input alone: keyboard and mouse, touch, and a
 * controller, whose reticle is brought onto it with the stick.
 */

test.use({ launchOptions: { args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"] } });
test.setTimeout(120_000);

const HOLDING = seededGame({ explorers: [{ seat: 0, cards: ["revolver"] }] });
const REVOLVER = "card:revolver";
const LYING = `play.holder === 1 && play.pending?.kind === 'turn' && play.things.some((thing) => thing.id === '${REVOLVER}')`;
const PICKED_UP = `play.pending?.kind === 'turn' && play.sheet === null && !play.things.some((thing) => thing.id === '${REVOLVER}')`;

/** Waits until the dropped card has joined the house and shows on the floor showing. */
async function shows(page: Page): Promise<{ x: number; y: number }> {
  await until(page, LYING);
  await expect.poll(() => page.evaluate((id) => window.__betrayalPlay?.screenPoint(id) ?? null, REVOLVER)).not.toBeNull();
  return pointOf(page, REVOLVER);
}

/** What the readout says lies in the room. */
async function lying(page: Page) {
  return (await readout(page)).things.find((thing) => thing.id === REVOLVER);
}

test("keyboard and mouse: a dropped card lies in its room, is named on hover, read on a click and picked up from its reader", async ({ page }) => {
  await resume(page, HOLDING);
  await until(page, "play.holder === 0 && play.pending?.kind === 'turn'");
  await page.keyboard.press("KeyI");
  const sheet = page.getByRole("dialog", { name: "Zoe Ingstrom's character card" });
  await sheet.getByRole("listitem").filter({ hasText: "Revolver" }).getByRole("button", { name: "Drop" }).click();
  await until(page, `play.things.some((thing) => thing.id === '${REVOLVER}')`);
  await page.keyboard.down("Backspace");
  await until(page, "play.holder === 1");
  await page.keyboard.up("Backspace");

  const at = await shows(page);
  expect(await lying(page)).toMatchObject({ kind: "object", room: "entrance-hall", name: "Revolver" });
  await page.mouse.move(at.x, at.y);
  await expect.poll(() => page.evaluate((point) => window.__betrayalPlay?.targetAt(point), at)).toBe(REVOLVER);
  await expect(page.getByRole("tooltip")).toContainText("Revolver");

  await page.mouse.click(at.x, at.y);
  const reader = page.getByRole("dialog", { name: "Revolver" });
  await expect(reader).toBeVisible();
  await expect(reader).toContainText("Item");
  expect((await readout(page)).sheet).toBe(`thing:${REVOLVER}`);
  // The sheet's row for it points at the same thing.
  await page.keyboard.press("Escape");
  await expect(reader).toBeHidden();
  await page.keyboard.press("KeyI");
  await page.getByRole("dialog", { name: "Ox Bellows's character card" }).getByLabel("On the floor").getByRole("button", { name: "Pick up" }).hover();
  await expect(page.getByRole("tooltip")).toContainText("Revolver");
  await page.keyboard.press("KeyI");
  await expect(page.getByRole("dialog", { name: "Ox Bellows's character card" })).toBeHidden();

  await page.mouse.click(at.x, at.y);
  await reader.getByRole("button", { name: "Pick up" }).click();
  await until(page, PICKED_UP);
});

test.describe("touch", () => {
  test.use({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true });

  test("touch alone: the first tap names a dropped card, the second reads it, and Pick up takes it", async ({ page }) => {
    await resume(page, HOLDING);
    await until(page, "play.holder === 0 && play.pending?.kind === 'turn'");
    await page.locator("header").getByRole("button", { name: /: character card, \d+ actions?$/ }).tap();
    const sheet = page.getByRole("dialog", { name: "Zoe Ingstrom's character card" });
    await sheet.getByRole("listitem").filter({ hasText: "Revolver" }).getByRole("button", { name: "Drop" }).tap();
    await until(page, `play.things.some((thing) => thing.id === '${REVOLVER}')`);
    await page.getByRole("button", { name: "End turn" }).tap();

    const at = await shows(page);
    await page.touchscreen.tap(at.x, at.y);
    await expect(page.getByRole("tooltip")).toContainText("Revolver");
    const reader = page.getByRole("dialog", { name: "Revolver" });
    await expect(reader).toBeHidden();
    await page.touchscreen.tap(at.x, at.y);
    await expect(reader).toBeVisible();
    await reader.getByRole("button", { name: "Pick up" }).tap();
    await until(page, PICKED_UP);
  });
});

/** Pans the camera with the left stick until `id` lies under the screen-centre reticle, and the camera has settled with the reticle on it. */
async function aimAt(page: Page, id: string): Promise<void> {
  const setStick = (x: number, y: number) =>
    page.evaluate(([sx, sy]) => {
      const pad = (window as unknown as { testPad: { axes: number[] } }).testPad;
      pad.axes = [sx, sy, 0, 0];
    }, [x, y] as const);
  /** A push towards an offset from the centre, as a share of the half screen: firm enough to clear the stick's deadzone. */
  const push = (offset: number, half: number) => Math.sign(offset) * Math.min(1, Math.max(0.3, (Math.abs(offset) / half) * 2));
  for (let steps = 0; ; steps++) {
    if (steps > 300) throw new Error(`The stick never brought the reticle to ${id}`);
    const now = await page.evaluate((target) => {
      const hook = window.__betrayalPlay;
      return hook ? { at: hook.screenPoint(target), width: innerWidth, height: innerHeight } : null;
    }, id);
    if (!now?.at) throw new Error(`${id} doesn't show`);
    const [dx, dy] = [now.at.x - now.width / 2, now.at.y - now.height / 2];
    if (Math.hypot(dx, dy) > 12) {
      await setStick(Math.abs(dx) > 6 ? push(dx, now.width / 2) : 0, Math.abs(dy) > 6 ? push(dy, now.height / 2) : 0);
      await frames(page, 2);
      continue;
    }
    await setStick(0, 0);
    await page.waitForFunction(() => window.__betrayalPlay?.isReady());
    if ((await page.evaluate(() => window.__betrayalPlay?.reticle())) === id) return;
  }
}

test("a controller alone: Y and A drop a card, the stick brings the reticle onto it, A reads it and A picks it up", async ({ page }) => {
  await withPad(page);
  await resume(page, HOLDING);
  await until(page, "play.holder === 0 && play.pending?.kind === 'turn'");
  await tapButton(page, BUTTON.Y);
  const sheet = page.getByRole("dialog", { name: "Zoe Ingstrom's character card" });
  await expect(sheet.getByRole("button", { name: "Drop" })).toBeFocused();
  await tapButton(page, BUTTON.A);
  await until(page, `play.things.some((thing) => thing.id === '${REVOLVER}')`);
  await holdButton(page, BUTTON.X, "play.holder === 1");

  await shows(page);
  await aimAt(page, REVOLVER);
  await expect(page.getByRole("tooltip")).toContainText("Revolver");
  await tapButton(page, BUTTON.A);
  const reader = page.getByRole("dialog", { name: "Revolver" });
  await expect(reader).toBeVisible();
  await expect(reader.getByRole("button", { name: "Pick up" })).toBeFocused();
  await tapButton(page, BUTTON.A);
  await until(page, PICKED_UP);
});
