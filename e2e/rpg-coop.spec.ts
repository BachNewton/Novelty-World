import { test, expect } from "./test";
import type { Page, Browser, BrowserContext } from "@playwright/test";
import { LOCAL_RELAY } from "./relay";

/**
 * RPG co-op E2E (a star room on the relay, one room per test via `?coop-room=`):
 * the wiring only, two pages through the relay in play and in edit. The sync
 * rules (paint ordering, clears, late joiners, host loss) are unit tests in
 * `src/projects/rpg/coop/session.test.ts`.
 *
 * Offline by design: `?relay=local:<port>` points the room at the local
 * relay this run started (`relay/main.ts`), so the suite never touches the
 * real one.
 *
 * Route: `/rpg` (`src/app/rpg/page.tsx` -> `RpgGame`). Play/edit toggles with
 * `~` (Backquote). Edit hooks used: `map-canvas`, `palette-cell`
 * and `selected-tile`. Play hooks: `play-canvas`,
 * plus the hidden co-op state badges `coop-status` / `coop-role` /
 * `coop-peer-count` / `coop-remote-count`, rendered in both modes.
 *
 * Every wait re-checks a live condition until it holds or its ceiling hits;
 * there are no fixed-duration pauses. Tests run serially, each in a unique
 * room.
 */
test.describe.configure({ mode: "serial" });

const RPG_URL = "/rpg";
const COOP_ROOM_PARAM = "coop-room";

/** Each test gets its own co-op room so rooms never leak between tests. */
let roomCounter = 0;
function uniqueRoom(): string {
  return `rpg-${Date.now()}-${roomCounter++}`;
}
const CONNECT_TIMEOUT = 15_000;
const MESH_TIMEOUT = 30_000;
const VIEWPORT = { width: 1280, height: 800 };
/** playStripMax above this => remote avatar separated from spawn. */
const STRIP_BRIGHT = 8;
/** playStripMax below this => no remote avatar in the strip (despawned). */
const STRIP_DARK = 3;

async function cleanupContext(ctx: BrowserContext): Promise<void> {
  await ctx.close();
}

async function newPeer(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  return { ctx, page };
}

async function gotoRpg(page: Page, room: string): Promise<void> {
  await page.goto(`${RPG_URL}?${COOP_ROOM_PARAM}=${encodeURIComponent(room)}&${LOCAL_RELAY}`);
  await page.waitForLoadState("domcontentloaded");
  // Play mode is the default: the play canvas mounts (edit chrome absent).
  await expect(page.getByTestId("play-canvas")).toBeVisible({ timeout: 10_000 });
}

/** Assumes play mode; `~` mounts MapEditor. */
async function toEdit(page: Page): Promise<void> {
  await page.keyboard.press("Backquote");
  await expect(page.getByTestId("map-canvas")).toBeVisible({ timeout: 10_000 });
  // Wait for the editor palette to be fully rendered (sidebar with palette cells)
  await expect(page.getByTestId("palette-cell").first()).toBeVisible({ timeout: 10_000 });
}

/** Assumes edit mode; `~` unmounts MapEditor back to play. */
async function toPlay(page: Page): Promise<void> {
  await page.keyboard.press("Backquote");
  await expect(page.getByTestId("play-canvas")).toBeVisible({ timeout: 10_000 });
}

/** Click a palette tile so brush paints are real. Index 0 vs 3 => different tiles. */
async function selectPaletteTile(page: Page, index = 0): Promise<void> {
  const cells = page.getByTestId("palette-cell");
  await expect(cells.first()).toBeVisible({ timeout: CONNECT_TIMEOUT });
  await cells.nth(index).click();
  await expect(page.getByTestId("selected-tile")).not.toHaveText(
    "No tile selected",
    { timeout: 5_000 },
  );
}

/**
 * Invert map-editor cellFromEvent: wrapper-filling canvas, letterboxed map
 * (40x28 of 16px), centered offset. Returns viewport coords for mouse.click.
 */
async function editCellCenter(
  page: Page,
  c: number,
  r: number,
): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ({ c, r }) => {
      const canvas = document.querySelector('[data-testid="map-canvas"]');
      if (canvas === null) throw new Error("map-canvas not found");
      const rect = canvas.getBoundingClientRect();
      const cssWidth = Math.max(1, Math.floor(rect.width));
      const cssHeight = Math.max(1, Math.floor(rect.height));
      const scale = Math.max(
        0.25,
        Math.min(cssWidth / (40 * 16), cssHeight / (28 * 16)),
      );
      const offsetX = Math.max(0, Math.floor((cssWidth - 40 * 16 * scale) / 2));
      const offsetY = Math.max(0, Math.floor((cssHeight - 28 * 16 * scale) / 2));
      const scaleX = cssWidth <= 0 ? 1 : rect.width / cssWidth;
      const scaleY = cssHeight <= 0 ? 1 : rect.height / cssHeight;
      return {
        x: (offsetX + (c + 0.5) * 16 * scale) * scaleX + rect.left,
        y: (offsetY + (r + 0.5) * 16 * scale) * scaleY + rect.top,
      };
    },
    { c, r },
  );
}

async function paintCell(page: Page, c: number, r: number): Promise<void> {
  const pt = await editCellCenter(page, c, r);
  await page.mouse.click(pt.x, pt.y);
}

/**
 * Play-mode canvas probe for one map cell. Camera is static while the local
 * player is idle at spawn (map center), scale mirrors game-world VISIBLE_CELLS.
 * Returns mean brightness, -1 canvas/context missing, -2 cell off-screen.
 */
async function probePlayCell(
  page: Page,
  c: number,
  r: number,
): Promise<number> {
  return page.evaluate(
    ({ c, r }) => {
      const canvas = document.querySelector('[data-testid="play-canvas"]');
      if (!(canvas instanceof HTMLCanvasElement)) return -1;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const scale = Math.max(
        1,
        Math.floor(Math.min(rect.width, rect.height) / (15 * 16)),
      );
      const camX = (40 * 16) / 2;
      const camY = (28 * 16) / 2;
      const sx = rect.width / 2 + ((c + 0.5) * 16 - camX) * scale;
      const sy = rect.height / 2 + ((r + 0.5) * 16 - camY) * scale;
      const ctx = canvas.getContext("2d");
      if (ctx === null) return -1;
      const bx = Math.floor(sx * dpr);
      const by = Math.floor(sy * dpr);
      const W = canvas.width;
      const H = canvas.height;
      if (bx < 2 || by < 2 || bx >= W - 2 || by >= H - 2) return -2;
      const data = ctx.getImageData(bx - 2, by - 2, 5, 5).data;
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) {
        sum += data[i] + data[i + 1] + data[i + 2];
      }
      return sum / (data.length / 4);
    },
    { c, r },
  );
}

/**
 * Play-mode movement probe: max mean brightness over a horizontal strip
 * right of the local avatar (CSS px +120..+600, rows -40/0/+40 around screen
 * center). The local avatar spans roughly +/-96 px, so the strip only lights
 * up once the remote avatar separates from the spawn overlap. Empty map =>
 * pure-black baseline, so no jitter calibration is needed. Returns -1 when
 * the canvas or its context is missing.
 */
async function playStripMax(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="play-canvas"]');
    if (!(canvas instanceof HTMLCanvasElement)) return -1;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");
    if (ctx === null) return -1;
    const dpr = window.devicePixelRatio || 1;
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    let best = 0;
    for (let dx = 120; dx <= 600; dx += 24) {
      for (const dy of [-40, 0, 40]) {
        const bx = Math.floor((cx + dx) * dpr);
        const by = Math.floor((cy + dy) * dpr);
        if (bx < 2 || by < 2 || bx >= canvas.width - 2 || by >= canvas.height - 2) {
          continue;
        }
        const data = ctx.getImageData(bx - 2, by - 2, 5, 5).data;
        let sum = 0;
        for (let i = 0; i < data.length; i += 4) {
          sum += data[i] + data[i + 1] + data[i + 2];
        }
        const mean = sum / (data.length / 4);
        if (mean > best) best = mean;
      }
    }
    return best;
  });
}

/**
 * Holds a movement key until the observer-side condition fires (the key is
 * released in `finally`). The avatar walks exactly as long as the condition
 * needs — never a fixed-duration hold.
 */
async function driveUntil(
  mover: Page,
  key: string,
  check: () => Promise<number>,
  threshold: number,
  timeout: number,
): Promise<void> {
  await mover.getByTestId("play-canvas").click();
  await mover.keyboard.down(key);
  try {
    await expect
      .poll(check, { timeout, intervals: [100, 250] })
      .toBeGreaterThan(threshold);
  } finally {
    await mover.keyboard.up(key);
  }
}

/**
 * Both pages reach `connected` with one transport-level peer each, and
 * exactly one side is `host` (role read from the `coop-role` badge — never
 * assumed from load order).
 */
async function expectPaired(a: Page, b: Page): Promise<void> {
  await expect(a.getByTestId("coop-status")).toHaveText("connected", {
    timeout: CONNECT_TIMEOUT,
  });
  await expect(b.getByTestId("coop-status")).toHaveText("connected", {
    timeout: CONNECT_TIMEOUT,
  });
  await expect(a.getByTestId("coop-peer-count")).toHaveText("1", {
    timeout: CONNECT_TIMEOUT,
  });
  await expect(b.getByTestId("coop-peer-count")).toHaveText("1", {
    timeout: CONNECT_TIMEOUT,
  });
  await expect
    .poll(
      async () =>
        `${await a.getByTestId("coop-role").textContent()}|${await b.getByTestId("coop-role").textContent()}`,
      { timeout: CONNECT_TIMEOUT },
    )
    .toMatch(/^(host\|guest|guest\|host)$/);
}

/** Presence is flowing: the page renders live remote avatars. */
async function expectRemoteCount(
  page: Page,
  expected: string,
  timeout = CONNECT_TIMEOUT,
): Promise<void> {
  await expect(page.getByTestId("coop-remote-count")).toHaveText(expected, {
    timeout,
  });
}

test.describe("RPG co-op", () => {
  test("join/move/leave: WASD moves avatar on the other peer, close despawns", async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const room = uniqueRoom();
    const a = await newPeer(browser);
    const b = await newPeer(browser);
    try {
      await gotoRpg(a.page, room);
      await gotoRpg(b.page, room);
      await expectPaired(a.page, b.page);
      // Presence flows both ways before anyone moves.
      await expectRemoteCount(a.page, "1");
      await expectRemoteCount(b.page, "1");

      // A walks right until B sees the remote separate from the spawn
      // overlap (B's camera is static while B idles at spawn).
      await driveUntil(
        a.page,
        "d",
        () => playStripMax(b.page),
        STRIP_BRIGHT,
        CONNECT_TIMEOUT,
      );

      // Close A -> remote despawns on B (host emits peer-left, or B prunes
      // the orphan after re-electing; either way the strip goes dark).
      // Use page.close() so the relay socket closes at once; context cleanup
      // happens in the finally block.
      await a.page.close();
      await expect
        .poll(() => playStripMax(b.page), {
          timeout: MESH_TIMEOUT,
          intervals: [250, 500],
        })
        .toBeLessThan(STRIP_DARK);
    } finally {
      await cleanupContext(a.ctx).catch(() => {});
      await cleanupContext(b.ctx).catch(() => {});
    }
  });

  test("edit->play live: paint in edit appears in play without reload", async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const room = uniqueRoom();
    const a = await newPeer(browser);
    const b = await newPeer(browser);
    try {
      await gotoRpg(a.page, room);
      await toEdit(a.page);
      await selectPaletteTile(a.page, 0);
      await gotoRpg(b.page, room); // stays in play
      await expectPaired(a.page, b.page);
      // B (play) sends pos: A (edit overlay) renders one remote avatar.
      await expectRemoteCount(a.page, "1");

      // Cell (10,10) is on-screen at 1280x720+ and clear of the spawn avatar.
      expect(await probePlayCell(b.page, 10, 10)).toBeLessThan(2);

      await paintCell(a.page, 10, 10);

      await expect
        .poll(async () => probePlayCell(b.page, 10, 10), {
          timeout: CONNECT_TIMEOUT,
        })
        .toBeGreaterThan(5);

      // Back to play: A resumes sending pos, so B sees A as a remote.
      await toPlay(a.page);
      await expectRemoteCount(b.page, "1");
    } finally {
      await cleanupContext(a.ctx).catch(() => {});
      await cleanupContext(b.ctx).catch(() => {});
    }
  });
});
