import { test, expect } from "./test";
import { clickTarget, drawnCard, readout, resume, seededGame, until, watchDebugPanel } from "./betrayal-game";

/**
 * Betrayal's cards, dice and damage in the hot-seat game, with keyboard and
 * mouse: the wiring from a drawn card to the dice to the damage tracks. Zoe,
 * holding the Lucky Stone and the Skull, explores north into the Game Room
 * and draws Skeletons: the card's title shows over the room and waits for a
 * tap; its die of mental damage rolls 0, which the Stone rerolls to 2; the
 * Skull offers to take it as physical; and the damage is split on one
 * control between the stat tracks, previewed before it is taken. The old debug panel never shows.
 */

test.use({ launchOptions: { args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"] } });
test.setTimeout(120_000);

const SKELETONS = seededGame({ stack: ["game-room"], decks: { event: ["skeletons"] }, explorers: [{ seat: 0, cards: ["lucky-stone", "skull"] }] });

test("keyboard and mouse: a card's beat, a reroll picked from the dice, and damage previewed on the tracks", async ({ page }) => {
  const debugShown = await watchDebugPanel(page);
  await resume(page, SKELETONS);
  await until(page, "play.holder === 0 && play.pending?.kind === 'turn'");

  await clickTarget(page, "explore:ground:2:-1");
  await until(page, "play.ghost?.tile === 'game-room'");
  await page.keyboard.press("Enter");

  // The draw: the card over the room, its text waiting for a press (its mark shows it), and no choice offered until it is read.
  const beat = await drawnCard(page, "skeletons", "Skeletons");
  await expect(beat).toContainText("Take 1 die of mental damage.");
  const waiting = await readout(page);
  expect(waiting).toMatchObject({ playing: true, panel: [], pending: { kind: "roll-after" }, card: { card: "skeletons", asks: false } });
  await expect(beat.locator("[data-continue]")).toBeVisible();
  await beat.click();

  // The roll: its die, 0, and Lucky Stone offered to reroll the dice picked from it.
  await until(page, "play.pending?.kind === 'roll-after'");
  const roll = page.getByLabel("The roll");
  await expect(roll.getByLabel("total 0")).toBeVisible();
  const stone = roll.getByRole("button", { name: /Lucky Stone/ });
  await expect(stone).toBeDisabled();
  await roll.getByRole("button", { name: "A die showing 0" }).click();
  await expect(stone).toHaveText(/Use Lucky Stone: reroll the picked die/);
  await stone.click();

  // The damage: the Skull's offer previews the physical tracks, taking it as it is the mental ones.
  await until(page, "play.pending?.kind === 'damage-kind'");
  const damage = page.getByLabel("Damage");
  await damage.getByRole("button", { name: "Use Skull: take 2 physical damage instead" }).hover();
  await expect(damage.getByLabel("Might track")).toBeVisible();
  await damage.getByRole("button", { name: "Take 2 mental damage" }).hover();
  await expect(damage.getByLabel("Sanity track")).toBeVisible();
  await damage.getByRole("button", { name: "Take 2 mental damage" }).click();

  // The split: one control between the two tracks, starting even and focused; the arrows move it a point at a time, the
  // tracks show where each clip would land, and nothing is taken until the split is.
  await until(page, "play.pending?.kind === 'split-damage'");
  const split = damage.getByRole("slider", { name: "Split the damage" });
  await expect(split).toBeFocused();
  await expect(split).toHaveAttribute("aria-valuetext", "Take 1 Sanity and 1 Knowledge");
  await expect(damage.getByLabel("Sanity track").locator("[data-after]")).toHaveCount(1);
  await expect(damage.getByLabel("Knowledge track").locator("[data-after]")).toHaveCount(1);
  await page.keyboard.press("ArrowRight");
  await expect(split).toHaveAttribute("aria-valuetext", "Take 2 Sanity and 0 Knowledge");
  await expect(damage.getByLabel("Knowledge track").locator("[data-after]")).toHaveCount(0);
  await page.keyboard.press("ArrowLeft");
  expect((await readout(page)).pending?.kind).toBe("split-damage");
  await damage.getByRole("button", { name: "Take 1 Sanity and 1 Knowledge" }).click();

  // The loss floats up over Zoe as it lands.
  await expect(page.locator("[data-float='zoe-ingstrom']")).toHaveCount(2);
  await until(page, "play.pending?.kind === 'turn'");
  expect(await debugShown()).toBe(false);
});
