import { test, expect } from "@playwright/test";
import type { Page, Browser, BrowserContext } from "@playwright/test";

/**
 * RPG co-op E2E (PeerJS star, one room per test via `?coop-room=`).
 *
 * Route: `/rpg` (`src/app/rpg/page.tsx` -> `RpgGame`). Play/edit toggles with
 * `~` (Backquote). Edit hooks used: `map-canvas`, `palette-cell`,
 * `selected-tile`, and the "Clear All" button. Play hooks: `play-canvas`,
 * plus the co-op state badges `coop-status` / `coop-role` / `coop-peer-count`
 * / `coop-remote-count` rendered in BOTH modes from live `usePresence` state
 * (mount-gated: static `idle`/`""`/`0` placeholders until hydration settles,
 * so badge waits also cover post-mount liveness).
 *
 * Fully deterministic: every wait re-checks a live condition until it holds
 * or its ceiling hits. There are no fixed-duration pauses anywhere in this
 * file — only badge assertions (`toHaveText` on co-op state), `expect.poll`
 * on canvas/grid convergence, and ceiling timeouts (per-assertion `{ timeout }`
 * plus per-test time budgets), which bound waits without pausing.
 *
 * PeerJS needs internet (PeerJS cloud). All tests run SERIAL (serial mode
 * stays), and every test navigates with a UNIQUE room so no test can collide
 * with another test or any ambient holder of the default room id.
 */
test.describe.configure({ mode: "serial" });

const RPG_URL = "/rpg";
const COOP_ROOM_PARAM = "coop-room";

/** Each test gets its own co-op room so PeerJS meshes never leak between tests. */
let roomCounter = 0;
function uniqueRoom(): string {
  return `rpg-${Date.now()}-${roomCounter++}`;
}
const STORAGE_KEY = "map-editor-v1";
const CONNECT_TIMEOUT = 15_000;
const MESH_TIMEOUT = 30_000;
const VIEWPORT = { width: 1280, height: 800 };
/** playStripMax above this => remote avatar separated from spawn. */
const STRIP_BRIGHT = 8;
/** playStripMax below this => no remote avatar in the strip (despawned). */
const STRIP_DARK = 3;
/** editRegionChange above this => remote avatar walked into the region. */
const EDIT_ARRIVED = 0.02;

type GridCell = { src: string; sx: number; sy: number } | null;

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
  await page.goto(`${RPG_URL}?${COOP_ROOM_PARAM}=${encodeURIComponent(room)}`);
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

/** Editor grid as persisted to localStorage (edit mode only). */
async function readGrid(page: Page): Promise<GridCell[][] | null> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as GridCell[][];
    } catch {
      return null;
    }
  }, STORAGE_KEY);
}

async function cellJson(page: Page, c: number, r: number): Promise<string> {
  const grid = await readGrid(page);
  if (grid === null) return "null-grid";
  const row = grid.at(r);
  if (row === undefined) return "oob";
  const cell = row.at(c);
  if (cell === undefined) return "oob";
  return JSON.stringify(cell);
}

function countNonNull(grid: GridCell[][] | null): number {
  if (grid === null) return -1;
  let n = 0;
  for (const row of grid) for (const cell of row) if (cell !== null) n += 1;
  return n;
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
 * Edit-canvas arrival probe for the play->edit test. Captures a reference
 * snapshot of the world region right of spawn (world x 400..520, y 180..270;
 * spawn is map center 320,224 and the avatar half-size is 32 world px, so the
 * idle avatar never pollutes the reference), then returns the fraction of
 * changed pixels. Empty map => static background, so any change is the
 * walking remote avatar. Returns -1 when the canvas or its context is
 * missing, -2 when the region is off-screen.
 */
async function editRegionChange(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="map-canvas"]');
    if (!(canvas instanceof HTMLCanvasElement)) return -1;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
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
    const toDeviceX = (wx: number): number =>
      Math.floor((offsetX + wx * scale) * scaleX * dpr);
    const toDeviceY = (wy: number): number =>
      Math.floor((offsetY + wy * scale) * scaleY * dpr);
    const x0 = toDeviceX(400);
    const x1 = toDeviceX(520);
    const y0 = toDeviceY(180);
    const y1 = toDeviceY(270);
    const W = canvas.width;
    const H = canvas.height;
    if (x1 <= 0 || y1 <= 0 || x0 >= W || y0 >= H) return -2;
    const cx0 = Math.max(0, x0);
    const cy0 = Math.max(0, y0);
    const cw = Math.min(x1, W) - cx0;
    const ch = Math.min(y1, H) - cy0;
    if (cw <= 0 || ch <= 0) return -2;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return -1;
    const cur = Array.from(ctx.getImageData(cx0, cy0, cw, ch).data);
    const win = window as unknown as {
      __rpgEditRef?: { w: number; h: number; px: number[] };
    };
    const prev = win.__rpgEditRef;
    if (
      prev === undefined ||
      prev.w !== cw ||
      prev.h !== ch ||
      prev.px.length !== cur.length
    ) {
      win.__rpgEditRef = { w: cw, h: ch, px: cur };
      return 0;
    }
    let changed = 0;
    const total = cw * ch;
    for (let p = 0; p < total; p += 1) {
      const o = p * 4;
      const dr = Math.abs(cur[o] - prev.px[o]);
      const dg = Math.abs(cur[o + 1] - prev.px[o + 1]);
      const db = Math.abs(cur[o + 2] - prev.px[o + 2]);
      if (dr + dg + db > 36) changed += 1;
    }
    return changed / total;
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

/** Full mesh: every page connected, exactly one `host`, the rest `guest`. */
async function expectMesh(pages: Page[], timeout = MESH_TIMEOUT): Promise<void> {
  for (const page of pages) {
    await expect(page.getByTestId("coop-status")).toHaveText("connected", {
      timeout,
    });
  }
  await expect
    .poll(
      async () => {
        const roles: string[] = [];
        for (const page of pages) {
          roles.push(
            (await page.getByTestId("coop-role").textContent()) ?? "",
          );
        }
        return roles.sort().join(",");
      },
      { timeout },
    )
    .toBe("guest,guest,guest,host");
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
      // Use page.close() so WebRTC close handlers fire; context cleanup
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

  test("play->edit live: movement in play moves the avatar on the edit canvas", async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const room = uniqueRoom();
    const a = await newPeer(browser);
    const b = await newPeer(browser);
    try {
      await gotoRpg(a.page, room);
      await toEdit(a.page); // observer: receive-only presence overlay
      await gotoRpg(b.page, room); // stays in play, will move
      await expectPaired(a.page, b.page);
      await expectRemoteCount(a.page, "1");

      // Prime the edit-region reference (first call captures, returns 0).
      expect(await editRegionChange(a.page)).toBeGreaterThanOrEqual(0);

      // B walks right until its avatar enters A's reference region.
      await driveUntil(
        b.page,
        "d",
        () => editRegionChange(a.page),
        EDIT_ARRIVED,
        CONNECT_TIMEOUT,
      );
    } finally {
      await cleanupContext(a.ctx).catch(() => {});
      await cleanupContext(b.ctx).catch(() => {});
    }
  });

  test("concurrent same-cell paint converges identically after settle", async ({
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
      await gotoRpg(b.page, room);
      await toEdit(b.page);
      await selectPaletteTile(b.page, 3); // different tile => real LWW race
      await expectPaired(a.page, b.page);

      // Race: no settle between the two paints.
      await paintCell(a.page, 15, 15);
      await paintCell(b.page, 15, 15);

      await expect
        .poll(
          async () =>
            `${await cellJson(a.page, 15, 15)}|${await cellJson(b.page, 15, 15)}`,
          { timeout: CONNECT_TIMEOUT },
        )
        .toMatch(/^(?!.*null-grid)(.+)\|\1$/);
      expect(await cellJson(a.page, 15, 15)).not.toBe("null");
    } finally {
      await cleanupContext(a.ctx).catch(() => {});
      await cleanupContext(b.ctx).catch(() => {});
    }
  });

  test("Clear All broadcasts with no resurrection", async ({ browser }) => {
    test.setTimeout(90_000);
    const room = uniqueRoom();
    const a = await newPeer(browser);
    const b = await newPeer(browser);
    try {
      await gotoRpg(a.page, room);
      await toEdit(a.page);
      await selectPaletteTile(a.page, 0);
      await gotoRpg(b.page, room);
      await toEdit(b.page);
      await expectPaired(a.page, b.page);

      await paintCell(a.page, 12, 12);
      await expect
        .poll(async () => cellJson(b.page, 12, 12), {
          timeout: CONNECT_TIMEOUT,
        })
        .not.toBe("null-grid");
      await expect
        .poll(async () => cellJson(b.page, 12, 12), {
          timeout: CONNECT_TIMEOUT,
        })
        .not.toBe("null");

      await a.page.getByRole("button", { name: "Clear All" }).click();

      await expect
        .poll(async () => countNonNull(await readGrid(a.page)), {
          timeout: CONNECT_TIMEOUT,
        })
        .toBe(0);
      await expect
        .poll(async () => countNonNull(await readGrid(b.page)), {
          timeout: CONNECT_TIMEOUT,
        })
        .toBe(0);

      // No-resurrection proof without a fixed pause: a post-clear paint
      // round-trips AFTER the clear, so any in-flight pre-clear cell would
      // have to resurrect first — the converged map must hold exactly the
      // new cell on both peers.
      await paintCell(b.page, 13, 13);
      await expect
        .poll(async () => cellJson(a.page, 13, 13), {
          timeout: CONNECT_TIMEOUT,
        })
        .not.toBe("null");
      await expect
        .poll(
          async () =>
            `${countNonNull(await readGrid(a.page))}|${countNonNull(await readGrid(b.page))}`,
          { timeout: CONNECT_TIMEOUT },
        )
        .toBe("1|1");
    } finally {
      await cleanupContext(a.ctx).catch(() => {});
      await cleanupContext(b.ctx).catch(() => {});
    }
  });

  test("late joiner snapshot gets the full non-empty map", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const room = uniqueRoom();
    const a = await newPeer(browser);
    try {
      await gotoRpg(a.page, room);
      await toEdit(a.page);
      await selectPaletteTile(a.page, 0);
      // Solo peer claims the room id: A is host by badge assertion.
      await expect(a.page.getByTestId("coop-role")).toHaveText("host", {
        timeout: CONNECT_TIMEOUT,
      });
      await paintCell(a.page, 10, 10);
      await paintCell(a.page, 11, 10);
      await paintCell(a.page, 10, 11);
      await expect
        .poll(async () => countNonNull(await readGrid(a.page)), {
          timeout: 10_000,
        })
        .toBe(3);
      const expected = JSON.stringify(await readGrid(a.page));

      const c = await newPeer(browser);
      try {
        await gotoRpg(c.page, room);
        await toEdit(c.page);
        await expect(c.page.getByTestId("coop-status")).toHaveText(
          "connected",
          { timeout: CONNECT_TIMEOUT },
        );
        await expect
          .poll(async () => JSON.stringify(await readGrid(c.page)), {
            timeout: 20_000,
          })
          .toBe(expected);
      } finally {
        await cleanupContext(c.ctx).catch(() => {});
      }
    } finally {
      await cleanupContext(a.ctx).catch(() => {});
    }
  });

  test("host close: survivor re-elects and serves the map intact", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    // Solo A claims the room id first; B joining later must be guest —
    // host identity asserted via `coop-role`, never load order alone.
    const room = uniqueRoom();
    const a = await newPeer(browser);
    try {
      await gotoRpg(a.page, room);
      await toEdit(a.page);
      await selectPaletteTile(a.page, 0);
      await expect(a.page.getByTestId("coop-role")).toHaveText("host", {
        timeout: CONNECT_TIMEOUT,
      });

      const b = await newPeer(browser);
      try {
        await gotoRpg(b.page, room);
        await toEdit(b.page);
        await selectPaletteTile(b.page, 0);
        await expect(b.page.getByTestId("coop-status")).toHaveText(
          "connected",
          { timeout: CONNECT_TIMEOUT },
        );
        await expect(b.page.getByTestId("coop-role")).toHaveText("guest", {
          timeout: CONNECT_TIMEOUT,
        });
        await expect(a.page.getByTestId("coop-peer-count")).toHaveText("1", {
          timeout: CONNECT_TIMEOUT,
        });

        await paintCell(a.page, 20, 20);
        await expect
          .poll(async () => cellJson(b.page, 20, 20), {
            timeout: CONNECT_TIMEOUT,
          })
          .not.toBe("null");

        await a.ctx.close();
        // Orphaned guest re-elects: status visibly passes through
        // `reconnecting` (staggered retry + PeerJS re-claim) before reaching
        // `connected` again as the new host.
        await expect
          .poll(
            async () =>
              `${await b.page.getByTestId("coop-status").textContent()}`,
            { timeout: 20_000, intervals: [50, 100] },
          )
          .toBe("reconnecting");
        await expect(b.page.getByTestId("coop-status")).toHaveText(
          "connected",
          { timeout: 20_000 },
        );
        await expect(b.page.getByTestId("coop-role")).toHaveText("host", {
          timeout: 20_000,
        });

        // Survivor still paints; a fresh joiner must get old + new cells.
        await paintCell(b.page, 21, 21);
        await expect
          .poll(async () => cellJson(b.page, 21, 21), {
            timeout: 10_000,
          })
          .not.toBe("null");

        const c = await newPeer(browser);
        try {
          await gotoRpg(c.page, room);
          await toEdit(c.page);
          await expect
            .poll(async () => cellJson(c.page, 20, 20), {
              timeout: 20_000,
            })
            .not.toBe("null");
          await expect
            .poll(async () => cellJson(c.page, 21, 21), {
              timeout: 20_000,
            })
            .not.toBe("null");
        } finally {
          await cleanupContext(c.ctx).catch(() => {});
        }
      } finally {
        await cleanupContext(b.ctx).catch(() => {});
      }
    } finally {
      await cleanupContext(a.ctx).catch(() => {});
    }
  });

  test("4-player smoke: all see movement and one paint converges", async ({
    browser,
  }) => {
    test.setTimeout(150_000);
    const room = uniqueRoom();
    const peers = await Promise.all([
      newPeer(browser),
      newPeer(browser),
      newPeer(browser),
      newPeer(browser),
    ]);
    try {
      for (const p of peers) await gotoRpg(p.page, room);
      await expectMesh(peers.map((p) => p.page));
      // Full presence mesh before anyone moves: every peer renders 3 remotes.
      for (const p of peers) await expectRemoteCount(p.page, "3", MESH_TIMEOUT);

      // A (peers[0]) moves until B/C/D each see the remote separate.
      const observers = peers.slice(1);
      await driveUntil(
        peers[0].page,
        "d",
        async () =>
          Math.min(
            ...(await Promise.all(
              observers.map((p) => playStripMax(p.page)),
            )),
          ),
        STRIP_BRIGHT,
        MESH_TIMEOUT,
      );

      // D paints from edit; B/C see it live in play; D persists it.
      await toEdit(peers[3].page);
      await selectPaletteTile(peers[3].page, 0);
      expect(await probePlayCell(peers[1].page, 10, 10)).toBeLessThan(2);
      await paintCell(peers[3].page, 10, 10);
      await expect
        .poll(async () => probePlayCell(peers[1].page, 10, 10), {
          timeout: 20_000,
        })
        .toBeGreaterThan(5);
      await expect
        .poll(async () => probePlayCell(peers[2].page, 10, 10), {
          timeout: 20_000,
        })
        .toBeGreaterThan(5);
      await expect
        .poll(async () => cellJson(peers[3].page, 10, 10), {
          timeout: 10_000,
        })
        .not.toBe("null");
    } finally {
      for (const p of peers) await cleanupContext(p.ctx).catch(() => {});
    }
  });
});
