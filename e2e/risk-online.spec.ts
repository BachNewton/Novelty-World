import { test, expect } from "./test";
import type { Page } from "@playwright/test";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

/**
 * Risk online, end to end on the real server route and database: a player
 * creates a table, seats two bots, starts, places every starting army, plays a
 * whole turn (reinforce, an attack, end the attack, fortify), and the game comes
 * back round to them after the bots' turns. Every wait is on the page's own
 * text: the status box's prompt for the decision the player faces, or a change
 * once a move lands. The test's game is deleted from the live database after.
 */

const RISK = "/board-games/risk";
/** Long enough for the bots' turns, which the server plays after it has answered. */
const SERVER = 60_000;

/** What the status box asks while the decision is this player's, in the order the turn reaches them. */
const PROMPTS = {
  setup: "Place an army on one of your territories",
  reinforce: "armies: pick a territory.",
  amount: "How many on",
  attackFrom: "Attack: pick a territory to attack from.",
  attackTo: "Pick a territory to attack.",
  battle: " attacks ",
  occupy: "How many armies hold it?",
  fortifyFrom: "Fortify: pick a territory to move armies from.",
  fortifyTo: "Pick where the armies go.",
  fortifyAmount: "Move armies from",
} as const;

type Prompt = keyof typeof PROMPTS;

/** The decision this player faces, once the page shows one. */
async function decision(page: Page): Promise<Prompt> {
  const handle = await page.waitForFunction(
    (all) => {
      const text = document.body.innerText;
      if (text.includes("Waiting…")) return null;
      return all.find(([, prompt]) => text.includes(prompt))?.[0] ?? null;
    },
    Object.entries(PROMPTS),
    { timeout: SERVER },
  );
  return (await handle.jsonValue()) as Prompt;
}

/** Does something, then waits for the page to show its result. */
async function andLand(page: Page, act: () => Promise<void>): Promise<void> {
  const before = await page.evaluate(() => document.body.innerText);
  await act();
  await page.waitForFunction((b) => document.body.innerText !== b, before, { timeout: SERVER });
}

/** Picks the first territory on offer from the keyboard, as the game's Tab and Enter do. */
async function pickTerritory(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
}

const pressMain = (page: Page) => page.locator("[data-pad-start]:visible").first().click();

function deleteGame(id: string) {
  nextEnv.loadEnvConfig(process.cwd());
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url === undefined || key === undefined) throw new Error("e2e: Supabase env vars are missing");
  return createClient(url, key).from("risk_games").delete().eq("id", id);
}

let game: string | null = null;

test.afterEach(async () => {
  if (game === null) return;
  const { error } = await deleteGame(game);
  game = null;
  if (error) throw new Error(`Deleting the test's Risk game: ${error.message}`);
});

test("a table with two bots plays a whole turn and comes back round", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto(RISK);
  await page.getByRole("button", { name: "New Game" }).click();
  await page.waitForURL(/game=/);
  game = new URL(page.url()).searchParams.get("game");

  await expect(page.getByText("Seats (1/6)")).toBeVisible({ timeout: SERVER });
  await page.getByRole("button", { name: "Add a bot" }).click();
  await expect(page.getByText("Seats (2/6)")).toBeVisible();
  await page.getByRole("button", { name: "Add a bot" }).click();
  await expect(page.getByText("Seats (3/6)")).toBeVisible();
  await page.getByRole("button", { name: "Start", exact: true }).click();

  // Every starting army, one at a time, with the bots placing theirs in between.
  let placed = 0;
  let next = await decision(page);
  while (next === "setup") {
    await andLand(page, () => pickTerritory(page));
    placed++;
    next = await decision(page);
  }
  // Three players start with 35 armies each, one on each of their 14 territories (`SETUP-*`).
  expect(placed).toBe(21);

  // A whole turn: reinforce, one attack, end the attack, fortify.
  expect(next).toBe("reinforce");
  const done = { reinforced: false, attacked: false, endedAttack: false, fortified: false };
  while (!done.fortified) {
    switch (next) {
      case "reinforce":
      case "attackTo":
      case "fortifyFrom":
      case "fortifyTo":
        expect(done.endedAttack && next === "reinforce", "fortify was skipped: the next turn began").toBe(false);
        await andLand(page, () => pickTerritory(page));
        break;
      case "amount":
        await andLand(page, () => pressMain(page));
        done.reinforced = true;
        break;
      case "attackFrom":
        if (done.attacked) {
          await andLand(page, () => page.getByRole("button", { name: /End attack/ }).click());
          done.endedAttack = true;
        } else await andLand(page, () => pickTerritory(page));
        break;
      case "battle":
        await andLand(page, () => page.getByRole("button", { name: /Blitz/ }).click());
        done.attacked = true;
        break;
      case "occupy":
        await andLand(page, () => pressMain(page));
        break;
      case "fortifyAmount":
        await andLand(page, () => pressMain(page));
        done.fortified = true;
        break;
      case "setup":
        throw new Error("Setup again mid-game");
    }
    if (!done.fortified) next = await decision(page);
  }
  expect(done).toEqual({ reinforced: true, attacked: true, endedAttack: true, fortified: true });

  // The bots play their turns on the server, and the game comes back to this player.
  await expect(page.getByText("Waiting…")).toBeVisible();
  expect(await decision(page)).toBe("reinforce");
});
