import type { Page } from "@playwright/test";
import { test, expect } from "./test";
import { BUTTON, holdButton, onePad, PAGE, padTo, readout, resume, seededGame, setButton, tapButton, until, wakePad, watchDebugPanel, withPad } from "./betrayal-game";

/**
 * Each input method is complete on its own. The owner's playtest case (an
 * item used and another dropped, mid-turn, on a controller alone); a whole
 * game played on the pad alone, from setup through a discovery, a card,
 * damage and a trade to the haunt's reveal and every seat's Ready; and the
 * explorer's sheet, the trade sheet and the game menu with the keyboard and
 * mouse alone, and by touch alone. Every wait is on the game's own state.
 */

test.use({ launchOptions: { args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"] } });
test.setTimeout(180_000);

/** Zoe holds the Music Box and the Lucky Stone, Ox the Rabbit's Foot; all three start in the Entrance Hall. */
const HOLDING = seededGame({ explorers: [{ seat: 0, cards: ["music-box", "lucky-stone"] }, { seat: 1, cards: ["rabbits-foot"] }] });

/** Fails the test if anything but the pad is used: a pointer press or a key. */
async function padOnly(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    const other: string[] = [];
    Object.assign(window, { otherInput: other });
    for (const type of ["pointerdown", "keydown", "wheel"]) window.addEventListener(type, (event) => other.push(event.type), { capture: true });
  });
  return () => page.evaluate(() => (window as unknown as { otherInput: string[] }).otherInput);
}

/** Opens the setup page with a game saved, and resumes it with the pad. */
async function resumeByPad(page: Page, game: object): Promise<void> {
  page.on("pageerror", (error) => {
    throw error;
  });
  await page.goto(PAGE);
  await expect(page.getByRole("heading", { name: "New game" })).toBeVisible();
  await page.evaluate((value) => {
    localStorage.setItem("nw:betrayal:hot-seat", JSON.stringify(value));
  }, Buffer.from(JSON.stringify(game)).toString("base64url"));
  await page.reload();
  await padTo(page.getByRole("button", { name: "Resume" }), onePad(page));
  await tapButton(page, BUTTON.A);
}

/** Brings the reticle to a target with the d-pad's right alone. */
async function stepTo(page: Page, id: string): Promise<void> {
  const reticle = () => page.evaluate(() => window.__betrayalPlay?.reticle() ?? null);
  for (let presses = 0, at = await reticle(); at !== id; presses++, at = await reticle()) {
    if (presses > 12) throw new Error(`The d-pad never brought the reticle to ${id}`);
    await tapButton(page, BUTTON.DpadRight);
    await until(page, `window.__betrayalPlay.reticle() !== ${JSON.stringify(at)}`);
  }
}

/** Moves the focus to a button with the d-pad, and presses A on it. */
async function choose(page: Page, name: string | RegExp, within = page.locator("body")): Promise<void> {
  await padTo(within.getByRole("button", { name }).first(), onePad(page));
  await tapButton(page, BUTTON.A);
}

test.describe("controller", () => {
  test.beforeEach(async ({ page }) => {
    await withPad(page);
  });

  test("the playtest case: mid-turn, use an item and drop another, on the pad alone", async ({ page }) => {
    const others = await padOnly(page);
    await resumeByPad(page, HOLDING);
    await until(page, "play.holder === 0 && play.pending?.kind === 'turn'");

    // Y opens Zoe's sheet on its first action, the Music Box's use, and A takes it; the sheet closes as the decision changes.
    await tapButton(page, BUTTON.Y);
    const sheet = page.getByRole("dialog", { name: "Zoe Ingstrom's character card" });
    await expect(sheet.getByRole("button", { name: /^Open the Music Box/ })).toBeFocused();
    await tapButton(page, BUTTON.A);
    await until(page, "play.version === 1 && !play.panel.includes('Open the Music Box')");
    await expect(sheet).toBeHidden();

    // Y again, the d-pad down to the Lucky Stone's Drop, and A drops it.
    await tapButton(page, BUTTON.Y);
    await padTo(sheet.getByRole("listitem").filter({ hasText: "Lucky Stone" }).getByRole("button", { name: "Drop" }), onePad(page));
    await tapButton(page, BUTTON.A);
    await until(page, "!play.panel.includes('Drop the Lucky Stone')");
    expect(await others()).toEqual([]);
  });

  test("Y in a turn with nothing to do opens the acting player's own tab, not the first seat's", async ({ page }) => {
    await resumeByPad(page, seededGame({}));
    await until(page, "play.holder === 0 && play.pending?.kind === 'turn'");
    await holdButton(page, BUTTON.X, "play.holder === 1");
    await until(page, "play.holder === 1 && play.pending?.kind === 'turn'");

    await tapButton(page, BUTTON.Y);
    const sheet = page.getByRole("dialog", { name: "Ox Bellows's character card" });
    await expect(sheet.getByRole("tab", { name: "Ox Bellows" })).toBeFocused();
    await expect(sheet.getByRole("tab", { name: "Ox Bellows" })).toHaveAttribute("aria-selected", "true");
  });

  test("a whole game on the pad alone: setup, a discovery, a card, damage, a trade, the reveal and Ready", async ({ page }) => {
    const others = await padOnly(page);
    const debugShown = await watchDebugPanel(page);
    // On this seed Skeletons deals Zoe damage, and Ox's omen, the Ring, starts haunt 13 at his turn's end.
    const game = seededGame(
      { stack: ["game-room", "junk-room"], decks: { event: ["skeletons"], omen: ["ring"] }, explorers: [{ seat: 0, cards: ["skull"] }, { seat: 1, cards: ["music-box"] }] },
      "pad-305",
    );
    await resumeByPad(page, { ...game, game: { ...game.game, chosenHaunt: 13 } });
    await until(page, "play.holder === 0 && play.pending?.kind === 'turn'");

    // Zoe explores north, steps the Game Room's ghost a way round, and places it.
    await stepTo(page, "explore:ground:2:-1");
    await tapButton(page, BUTTON.A);
    await until(page, "play.ghost?.tile === 'game-room'");
    await tapButton(page, BUTTON.DpadRight);
    await until(page, "play.ghost?.rotation === 1");
    await tapButton(page, BUTTON.A);
    // Skeletons: A goes on from the card, and the damage is chosen and split in the box.
    await expect(page.getByRole("dialog", { name: "Card drawn: Skeletons" })).toBeVisible();
    await tapButton(page, BUTTON.A);
    await until(page, "play.pending?.kind === 'damage-kind'");
    await choose(page, /./, page.getByLabel("Damage"));
    await until(page, "play.pending?.kind === 'split-damage'");
    await choose(page, /./, page.getByLabel("Damage"));
    await until(page, "play.pending?.kind === 'turn' && play.holder === 0");
    await holdButton(page, BUTTON.X, "play.holder === 1 && play.turnSeat === 1");

    // Ox trades: Y, Trade with Father Rhinehardt, the Music Box marked to give, and Offer.
    await until(page, "play.holder === 1 && play.pending?.kind === 'turn'");
    await tapButton(page, BUTTON.Y);
    await choose(page, "Trade with Father Rhinehardt", page.getByRole("dialog", { name: "Ox Bellows's character card" }));
    const trade = page.getByRole("dialog", { name: "Trade with Father Rhinehardt" });
    await choose(page, "Music Box", trade);
    await expect(trade.getByLabel("The offer")).toHaveText("Give Father Rhinehardt your Music Box");
    await choose(page, "Offer", trade);
    // Father Rhinehardt is asked, by name, and accepts in the box.
    await until(page, "play.holder === 2 && play.pending?.kind === 'trade-offer'");
    await expect(page.getByLabel("What you can do now")).toContainText("accept Ox Bellows's trade?");
    await choose(page, "Accept the trade");
    await until(page, "play.holder === 1 && play.pending?.kind === 'turn'");

    // Ox explores south into the Junk Room, draws the Ring, and ends his turn: the haunt roll starts the haunt.
    await stepTo(page, "explore:ground:2:1");
    await tapButton(page, BUTTON.A);
    await expect(page.getByRole("dialog", { name: "Card drawn: Ring" })).toBeVisible();
    await tapButton(page, BUTTON.A);
    await until(page, "play.pending?.kind === 'turn' && play.canEnd");
    await holdButton(page, BUTTON.X, "play.pending?.type === 'ready'");

    // The reveal: a half is read and scrolled on the pad, and every seat says Ready with A.
    await until(page, "play.pending?.type === 'ready'");
    const reveal = page.getByLabel("The haunt begins");
    const half = reveal.getByRole("button").first();
    const title = (await half.textContent()) ?? "";
    await padTo(half, onePad(page));
    await tapButton(page, BUTTON.A);
    const reader = page.getByRole("dialog", { name: title });
    await expect(reader).toBeVisible();
    await tapButton(page, BUTTON.DpadDown);
    await tapButton(page, BUTTON.B);
    await expect(reader).toBeHidden();
    for (let seats = 0; (await readout(page)).pending?.type === "ready"; seats++) {
      if (seats > 3) throw new Error("Ready never went round every seat");
      const holder = (await readout(page)).holder;
      await choose(page, "Ready", reveal);
      await until(page, `play.pending?.type !== 'ready' || play.holder !== ${holder}`);
    }
    expect((await readout(page)).status).toBe("haunt");
    expect(await others()).toEqual([]);
    expect(await debugShown()).toBe(false);
  });

  test("the game menu: any pad's Menu opens it, the d-pad and A change the speed, and B closes it", async ({ page }) => {
    await resumeByPad(page, HOLDING);
    await until(page, "play.holder === 0 && play.pending?.kind === 'turn'");
    await tapButton(page, BUTTON.Menu);
    const menu = page.getByRole("dialog", { name: "Game menu" });
    await expect(menu).toBeVisible();
    await choose(page, "Slow", menu);
    await expect(menu.getByRole("button", { name: "Slow" })).toHaveAttribute("aria-pressed", "true");
    await tapButton(page, BUTTON.B);
    await expect(menu).toBeHidden();
    // X held still ends the turn once the menu is shut.
    await setButton(page, BUTTON.X, true);
    await until(page, "play.holder === 1");
    await setButton(page, BUTTON.X, false);
  });
});

/** Whether the pad's focus shows on the focused button: its outline drawn. */
const focusShows = (page: Page) => page.evaluate(() => document.activeElement instanceof HTMLButtonElement && getComputedStyle(document.activeElement).outlineStyle !== "none");

test("setup on the pad alone: the first press shows the focus and nothing else, the focused character's traits show, and Start opens the game on the pad", async ({ page }) => {
  await withPad(page, { asleep: true });
  const others = await padOnly(page);
  page.on("pageerror", (error) => {
    throw error;
  });
  await page.goto(PAGE);
  await expect(page.getByRole("heading", { name: "New game" })).toBeVisible();
  expect(await focusShows(page)).toBe(false);

  // A, the press that makes the browser show the pad, brings the focus into view on the first seat's portrait without pressing it.
  await wakePad(page, BUTTON.A);
  const seat0 = page.getByRole("listitem", { name: "Seat 0" });
  const portrait = seat0.getByRole("button", { name: /^Seat 0 character/ });
  await expect(portrait).toBeFocused();
  expect(await focusShows(page)).toBe(true);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Four seats, each showing its character's traits; the picker shows the traits of the character in focus.
  await expect(page.getByRole("listitem", { name: /^Seat \d$/ })).toHaveCount(4);
  await expect(seat0.getByLabel("Father Rhinehardt's traits").getByLabel(/ track$/)).toHaveCount(4);
  await tapButton(page, BUTTON.A);
  const grid = page.getByRole("dialog", { name: "Seat 0's character" });
  await expect(grid.getByRole("button", { name: "Close" })).toBeFocused();
  const vivian = grid.getByRole("button", { name: /Vivian Lopez/ });
  await padTo(vivian, onePad(page));
  expect(await focusShows(page)).toBe(true);
  await expect(grid.getByLabel("In focus").getByLabel("Vivian Lopez's traits").getByLabel(/ track$/)).toHaveCount(4);
  await tapButton(page, BUTTON.A);
  await expect(grid).toBeHidden();
  await expect(seat0.getByRole("button", { name: "Seat 0 character: Vivian Lopez" })).toBeVisible();

  await choose(page, /^13 · /);
  await choose(page, "Start");
  await until(page, "play.pending?.kind === 'turn'");
  // The game opens with the pad's hints and focus showing, as setup left them.
  expect((await readout(page)).input).toBe("pad");
  expect(await others()).toEqual([]);
});

test("keyboard and mouse alone: I opens the explorer, a trade is built with clicks, Tab and Enter, M opens the menu, and Backspace held ends the turn", async ({ page }) => {
  await resume(page, HOLDING);
  await until(page, "play.holder === 0 && play.pending?.kind === 'turn'");
  await page.keyboard.press("KeyI");
  const sheet = page.getByRole("dialog", { name: "Zoe Ingstrom's character card" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Trade with Ox Bellows" }).click();
  const trade = page.getByRole("dialog", { name: "Trade with Ox Bellows" });
  await trade.getByRole("button", { name: "Music Box" }).click();
  await trade.getByRole("button", { name: "Rabbit's Foot" }).click();
  // Tab goes round the trade sheet's own buttons, to Offer, and Enter offers it.
  const offer = trade.getByRole("button", { name: "Offer" });
  for (let tabs = 0; !(await offer.evaluate((button) => button === document.activeElement)); tabs++) {
    if (tabs > 10) throw new Error("Tab never reached Offer");
    await page.keyboard.press("Tab");
    expect(await trade.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Enter");
  await until(page, "play.holder === 1 && play.pending?.kind === 'trade-offer'");
  await page.getByRole("button", { name: "Accept the trade" }).click();
  await until(page, "play.holder === 0 && play.pending?.kind === 'turn'");
  await expect(page.locator("[data-mark='ox-bellows']")).toHaveAttribute("aria-label", "Ox Bellows: character card, 1 card held");

  // M opens the menu; a click changes the speed; Escape closes it.
  await page.keyboard.press("KeyM");
  const menu = page.getByRole("dialog", { name: "Game menu" });
  await menu.getByRole("button", { name: "Fast" }).click();
  await expect(menu.getByRole("button", { name: "Fast" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();

  await page.keyboard.down("Backspace");
  await until(page, "play.holder === 1");
  await page.keyboard.up("Backspace");
});

test.describe("touch", () => {
  test.use({ viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true });

  test("touch alone: the chip opens the explorer, a card is dropped, a trade is offered and accepted, and the menu works", async ({ page }) => {
    await resume(page, HOLDING);
    await until(page, "play.holder === 0 && play.pending?.kind === 'turn'");
    const now = page.getByLabel("What you can do now");
    await now.getByRole("button", { name: /^Your explorer · \d+ actions$/ }).tap();
    const sheet = page.getByRole("dialog", { name: "Zoe Ingstrom's character card" });
    await sheet.getByRole("listitem").filter({ hasText: "Lucky Stone" }).getByRole("button", { name: "Drop" }).tap();
    await until(page, "!play.panel.includes('Drop the Lucky Stone')");

    // The box offers the same trade, behind one button.
    await now.getByRole("button", { name: "Trade with Ox Bellows" }).tap();
    const trade = page.getByRole("dialog", { name: "Trade with Ox Bellows" });
    await trade.getByRole("button", { name: "Rabbit's Foot" }).tap();
    await trade.getByRole("button", { name: "Offer" }).tap();
    await until(page, "play.holder === 1 && play.pending?.kind === 'trade-offer'");
    await page.getByRole("button", { name: "Decline the trade" }).tap();
    await until(page, "play.holder === 0 && play.pending?.kind === 'turn'");

    await page.getByRole("button", { name: "Menu", exact: true }).tap();
    const menu = page.getByRole("dialog", { name: "Game menu" });
    await menu.getByRole("button", { name: "Slow" }).tap();
    await expect(menu.getByRole("button", { name: "Slow" })).toHaveAttribute("aria-pressed", "true");
    await menu.getByRole("button", { name: "Close" }).tap();
    await expect(menu).toBeHidden();
    await now.getByRole("button", { name: "End turn" }).tap();
    await until(page, "play.holder === 1");
  });
});
