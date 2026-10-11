import { test, expect } from "./test";
import { BUTTON, clickTarget, onePad, padTo, readout, resume, seededGame, setButton, tapButton, until, watchDebugPanel, whilePlaying, withPad } from "./betrayal-game";

/**
 * Betrayal's cards, dice and damage in the hot-seat game (v1 phase 6). Zoe,
 * holding the Lucky Stone and the Skull, explores north into the Game Room
 * and draws Skeletons: the card's title shows over the room and waits for a
 * tap; its die of mental damage rolls 0, which the Stone rerolls to 2; the
 * Skull offers to take it as physical; and the damage is split on the stat
 * tracks, previewed before it is taken. The old debug panel never shows.
 */

test.use({ launchOptions: { args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"] } });
test.setTimeout(120_000);

const SKELETONS = seededGame({ stack: ["game-room"], decks: { event: ["skeletons"] }, explorers: [{ seat: 0, cards: ["lucky-stone", "skull"] }] });
/** Burning Man's Sanity roll, on this seed, puts Zoe back in the Entrance Hall. */
const BURNING_MAN = seededGame({ stack: ["game-room"], decks: { event: ["burning-man"] } });

test("keyboard and mouse: a card's beat, a reroll picked from the dice, and damage previewed on the tracks", async ({ page }) => {
  const debugShown = await watchDebugPanel(page);
  await resume(page, SKELETONS);
  await until(page, "play.holder === 0 && play.pending?.kind === 'turn'");

  // Zoe's cards show on her figure as a mark; clicking it opens her character card: her four tracks, the skull locked before the haunt, and her cards with their text.
  await page.locator("[data-mark='zoe-ingstrom']").click();
  const fan = page.getByRole("dialog", { name: "Zoe Ingstrom's character card" });
  await expect(fan.getByLabel("Sanity track").locator("li")).toHaveText(["3", "4", "5", "5", "6", "6", "7", "8"]);
  await expect(fan.getByLabel("Sanity track").locator("[aria-current]")).toHaveText("5");
  await expect(fan.locator("[data-skull='locked']")).toHaveCount(4);
  await expect(fan).toContainText("Lucky Stone");
  await expect(fan).toContainText("Whenever you take mental damage, you may take all of it as physical damage instead.");
  await page.keyboard.press("Escape");
  await expect(fan).toBeHidden();
  // The seat's own panel in the header opens the same card.
  await page.getByRole("button", { name: /\(Zoe Ingstrom\): character card$/ }).click();
  await expect(fan).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(fan).toBeHidden();

  // Holding Z shows every explorer's stats over the figures, in brief: the value and the steps left above the skull.
  await page.keyboard.down("KeyZ");
  await expect(page.getByLabel("Ox Bellows's stats")).toBeVisible();
  await expect(page.getByLabel("Ox Bellows's stats").getByLabel("Might 5, 3 steps above the skull")).toBeVisible();
  await page.keyboard.up("KeyZ");
  await expect(page.getByLabel("Ox Bellows's stats")).toBeHidden();

  await clickTarget(page, "explore:ground:2:-1");
  await until(page, "play.ghost?.tile === 'game-room'");
  await page.keyboard.press("Enter");

  // The draw: the card's name over the room, its text waiting for a tap, and no choice offered until it is read.
  const beat = page.getByRole("dialog", { name: "Card drawn: Skeletons" });
  await expect(beat).toBeVisible();
  await expect(beat).toContainText("Take 1 die of mental damage.");
  const waiting = await readout(page);
  expect(waiting).toMatchObject({ playing: true, panel: [], pending: { kind: "roll-after" } });
  await beat.getByRole("button", { name: "Go on" }).click();

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

  // The split: pointing at a way shows where each clip would land; nothing is taken until it is clicked.
  await until(page, "play.pending?.kind === 'split-damage'");
  await damage.getByRole("button", { name: "Take 1 Sanity and 1 Knowledge" }).hover();
  await expect(damage.getByLabel("Sanity track").locator("[data-after]")).toHaveCount(1);
  await expect(damage.getByLabel("Knowledge track").locator("[data-after]")).toHaveCount(1);
  expect((await readout(page)).pending?.kind).toBe("split-damage");
  await damage.getByRole("button", { name: "Take 1 Sanity and 1 Knowledge" }).click();

  // The loss floats up over Zoe as it lands.
  await expect(page.locator("[data-float='zoe-ingstrom']")).toHaveCount(2);
  await until(page, "play.pending?.kind === 'turn'");
  expect(await debugShown()).toBe(false);
});

test("a card that moves the explorer: its title stays up until the choice it leads to, and an input mid-beat only skips", async ({ page }) => {
  await resume(page, BURNING_MAN);
  await until(page, "play.holder === 0 && play.pending?.kind === 'turn'");
  await clickTarget(page, "explore:ground:2:-1");
  await until(page, "play.ghost?.tile === 'game-room'");
  await page.keyboard.press("Enter");

  // The card's beat waits for a tap; the engine has already moved Zoe and put her next turn decision up.
  const beat = page.getByRole("dialog", { name: "Card drawn: Burning Man" });
  await expect(beat.getByRole("button", { name: "Go on" })).toBeVisible();
  // The clock is held, so the beats after the card's stay playing to be seen.
  await page.evaluate(() => window.__betrayalPlay?.freezeClock(1000));
  await beat.getByRole("button", { name: "Go on" }).click();
  await whilePlaying(page, "play.playing && play.moment !== null");
  const between = await readout(page);
  expect(between).toMatchObject({ playing: true, targets: [], panel: [], canEnd: false, rooms: { "zoe-ingstrom": "entrance-hall" }, pending: { kind: "turn" } });
  await expect(beat).toBeVisible();
  await expect(page.getByRole("button", { name: "End turn" })).toHaveCount(0);

  // Enter now only skips: the choices show, and the turn is still Zoe's, untouched.
  await page.keyboard.press("Enter");
  await whilePlaying(page, "!play.playing && play.canEnd");
  const after = await readout(page);
  expect(after).toMatchObject({ holder: 0, turnSeat: 0, queued: 0, pending: { id: between.pending?.id } });
  await expect(beat).toBeHidden();
  await page.evaluate(() => window.__betrayalPlay?.freezeClock(null));
});

test.describe("touch", () => {
  test.use({ viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true });

  test("a first tap on a way to take damage previews it, and a second takes it; a tap on a mark fans out the cards", async ({ page }) => {
    await resume(page, SKELETONS);
    await until(page, "play.holder === 0 && play.pending?.kind === 'turn'");
    // Three explorers stand in the Entrance Hall: their marks, each a touch target, lie side by side, none covering another.
    await expect(page.locator("[data-mark]")).toHaveCount(3);
    for (const mark of await page.locator("[data-mark]").all()) await expect(mark).toBeVisible();
    const marks = await page.locator("[data-mark]").evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().toJSON() as DOMRect));
    const overlaps = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    expect(marks.some((a, i) => marks.some((b, j) => j > i && overlaps(a, b)))).toBe(false);
    await page.locator("[data-mark='zoe-ingstrom']").tap();
    await expect(page.getByRole("dialog", { name: "Zoe Ingstrom's character card" })).toContainText("Skull");
    await page.getByRole("dialog", { name: "Zoe Ingstrom's character card" }).getByRole("button", { name: "Close" }).tap();

    // The on-screen Stats button shows them while it is held.
    const stats = page.getByRole("button", { name: "Show the stats" });
    const box = await stats.boundingBox();
    if (!box) throw new Error("No Stats button");
    const cdp = await page.context().newCDPSession(page);
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 };
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [at] });
    await expect(page.getByLabel("Ox Bellows's stats")).toBeVisible();
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(page.getByLabel("Ox Bellows's stats")).toBeHidden();

    const doorway = await page.evaluate(() => window.__betrayalPlay?.screenPoint("explore:ground:2:-1") ?? null);
    if (!doorway) throw new Error("No north doorway");
    await page.touchscreen.tap(doorway.x, doorway.y);
    await page.touchscreen.tap(doorway.x, doorway.y);
    await until(page, "play.ghost?.tile === 'game-room'");
    await page.getByRole("button", { name: "Place the Game Room" }).tap();
    await page.getByRole("dialog", { name: "Card drawn: Skeletons" }).getByRole("button", { name: "Go on" }).tap();
    await until(page, "play.pending?.kind === 'roll-after'");
    await page.getByRole("button", { name: "Keep the result (0)" }).tap();
    // A 0 deals no damage: Zoe's turn goes on.
    await until(page, "play.pending?.kind === 'turn'");
  });
});

test.describe("controller", () => {
  test.beforeEach(async ({ page }) => {
    await withPad(page);
  });

  test("Y opens the explorer's card, the d-pad goes along its tabs and B closes it; R3 held shows the stats; the dice are picked in the box", async ({ page }) => {
    await resume(page, SKELETONS);
    await until(page, "play.holder === 0 && play.pending?.kind === 'turn'");
    await tapButton(page, BUTTON.Y);
    const zoe = page.getByRole("dialog", { name: "Zoe Ingstrom's character card" });
    await expect(zoe).toBeVisible();
    // It opens on its first action: the Lucky Stone's Drop.
    await expect(zoe.getByRole("button", { name: "Drop" }).first()).toBeFocused();
    // Each tab shows as the focus reaches it.
    await padTo(page.getByRole("tab", { name: "Ox Bellows" }), onePad(page));
    const ox = page.getByRole("dialog", { name: "Ox Bellows's character card" });
    await expect(ox).toBeVisible();
    // Another explorer's tab is for reading only.
    await expect(ox.getByRole("button", { name: "Drop" })).toHaveCount(0);
    await tapButton(page, BUTTON.B);
    await expect(page.getByRole("dialog", { name: /character card$/ })).toHaveCount(0);

    await setButton(page, BUTTON.RS, true);
    await expect(page.getByLabel("Father Rhinehardt's stats")).toBeVisible();
    await setButton(page, BUTTON.RS, false);
    await expect(page.getByLabel("Father Rhinehardt's stats")).toBeHidden();

    await clickTarget(page, "explore:ground:2:-1");
    await until(page, "play.ghost?.tile === 'game-room'");
    await tapButton(page, BUTTON.A);
    await expect(page.getByRole("dialog", { name: "Card drawn: Skeletons" })).toBeVisible();
    // A goes on from the card.
    await tapButton(page, BUTTON.A);
    await until(page, "play.pending?.kind === 'roll-after'");
    // The d-pad's down moves into the box, the d-pad reaches the die, A picks it, and the Stone rerolls it.
    await padTo(page.getByRole("button", { name: "A die showing 0" }), onePad(page));
    await tapButton(page, BUTTON.A);
    await expect(page.getByRole("button", { name: "A die showing 0" })).toHaveAttribute("aria-pressed", "true");
    await padTo(page.getByRole("button", { name: /^Use Lucky Stone/ }), onePad(page));
    await tapButton(page, BUTTON.A);
    await until(page, "play.pending?.kind === 'damage-kind'");
  });
});
