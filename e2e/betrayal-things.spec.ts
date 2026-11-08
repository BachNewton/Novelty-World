import type { Page } from "@playwright/test";
import { test, expect } from "./test";
import { pointOf, readout, resume, seededGame, until } from "./betrayal-game";

/**
 * Things that live in rooms (v1): Zoe drops the Revolver in the Entrance
 * Hall and ends her turn, and it lies there on its plate, an object of the
 * room. On Ox's turn, pointing at it names it, choosing it opens its card's
 * text over it, and its Pick up there is the turn's own (a card dropped this
 * turn can't be picked up again in it): the card goes to his hand and
 * leaves the floor, with keyboard and mouse. Touch and the pad pick things
 * through the same targets as the house's choices, checked in the other specs.
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
