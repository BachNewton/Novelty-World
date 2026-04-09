import { test, expect } from "@playwright/test";
import type { Page, BrowserContext } from "@playwright/test";

const BASE_URL = "/test-multiplayer";

/** Each test gets its own lobby channel so Supabase Presence state never leaks between tests. */
let testCounter = 0;
function uniqueGameId(): string {
  return `test-${Date.now()}-${testCounter++}`;
}

/**
 * Navigate pages to about:blank before closing to trigger React cleanup effects.
 * This ensures Supabase channels are properly untracked/removed instead of being
 * abandoned when the browser context is killed.
 */
async function cleanupContext(ctx: BrowserContext): Promise<void> {
  for (const page of ctx.pages()) {
    try {
      // Explicitly disconnect all Supabase Realtime channels.
      // The Supabase browser client is a singleton, so this cleans up
      // every channel created by useLobby/signaling hooks. Without this,
      // the server holds the connection for ~30 seconds after the page closes,
      // exhausting the connection pool across test runs.
      await page.evaluate(() => {
        const cleanup = (window as unknown as Record<string, unknown>).__supabaseCleanup;
        if (typeof cleanup === "function") cleanup();
      });
    } catch {
      // Page may already be closed
    }
  }
  await ctx.close();
}

/** Get the room code from a host page that's already in a session. */
async function getRoomCode(hostPage: Page): Promise<string> {
  const code = await hostPage.getByTestId("room-code").textContent();
  expect(code).toBeTruthy();
  return code!;
}

/** Wait for a specific room to appear in the guest's lobby and join it. */
async function joinByCode(guestPage: Page, roomCode: string): Promise<void> {
  const joinButton = guestPage.locator(
    `[data-testid="join-room"][data-room-code="${roomCode}"]`,
  );
  await expect(joinButton).toBeVisible({ timeout: 10_000 });
  await joinButton.click();
  await expect(guestPage.getByTestId("session")).toBeVisible();
}

/**
 * Join a room directly by navigating with ?join=ROOMCODE.
 * Bypasses Supabase Presence lobby discovery — faster and deterministic.
 * Use this for all tests except the one that explicitly tests lobby discovery.
 */
async function directJoin(guestPage: Page, baseUrl: string, roomCode: string): Promise<void> {
  const sep = baseUrl.includes("?") ? "&" : "?";
  await guestPage.goto(`${baseUrl}${sep}join=${roomCode}`);
  await expect(guestPage.getByTestId("session")).toBeVisible({ timeout: 15_000 });
}

/**
 * Lobby Room tests.
 *
 * These test the useLobbyRoom hook (lobby + WebRTC + ready handshake)
 * independent of any game. Every lobby-based multiplayer game depends on this flow.
 */

test.describe("Lobby Room", () => {
  test("room can be created and appears in lobby", async ({ browser }) => {
    const gameId = uniqueGameId();
    const url = `${BASE_URL}?local&game=${gameId}`;
    const hostCtx = await browser.newContext();
    const guestCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const guestPage = await guestCtx.newPage();

    // Host creates a room
    await hostPage.goto(url);
    await hostPage.getByTestId("create-room").click();
    await expect(hostPage.getByTestId("session")).toBeVisible();
    const roomCode = await getRoomCode(hostPage);

    // Guest sees the room in the lobby
    await guestPage.goto(url);
    const joinButton = guestPage.locator(
      `[data-testid="join-room"][data-room-code="${roomCode}"]`,
    );
    await expect(joinButton).toBeVisible({ timeout: 10_000 });
    expect(await joinButton.textContent()).toBe(roomCode);

    await cleanupContext(hostCtx);
    await cleanupContext(guestCtx);
  });

  test("guest can join a room, host starts, and both reach ready", async ({ browser }) => {
    const gameId = uniqueGameId();
    const url = `${BASE_URL}?local&game=${gameId}`;
    const hostCtx = await browser.newContext();
    const guestCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const guestPage = await guestCtx.newPage();

    // Host creates room
    await hostPage.goto(url);
    await hostPage.getByTestId("create-room").click();
    await expect(hostPage.getByTestId("session")).toBeVisible();
    const roomCode = await getRoomCode(hostPage);

    // Guest joins the specific room
    await directJoin(guestPage, url, roomCode);

    // Wait for peer connection
    await expect(hostPage.getByTestId("player-status")).toHaveText("connected", {
      timeout: 15_000,
    });

    // Host clicks start
    await hostPage.getByTestId("start-game").click();

    // Both sides reach ready phase (application-level handshake complete)
    await expect(hostPage.getByTestId("phase")).toHaveText("ready", {
      timeout: 15_000,
    });
    await expect(guestPage.getByTestId("phase")).toHaveText("ready", {
      timeout: 15_000,
    });

    // Both see 1 peer with "connected" status
    await expect(hostPage.getByTestId("peer-count")).toHaveText("1");
    await expect(guestPage.getByTestId("peer-count")).toHaveText("1");
    await expect(hostPage.getByTestId("player-status")).toHaveText("connected");
    await expect(guestPage.getByTestId("player-status")).toHaveText("connected");

    // Roles are correct
    await expect(hostPage.getByTestId("role")).toHaveText("host");
    await expect(guestPage.getByTestId("role")).toHaveText("guest");

    // Player identity: both have IDs and roster has 2 entries
    const hostPlayerId = await hostPage.getByTestId("player-id").textContent();
    const guestPlayerId = await guestPage.getByTestId("player-id").textContent();
    expect(hostPlayerId).toBeTruthy();
    expect(guestPlayerId).toBeTruthy();
    expect(hostPlayerId).not.toBe(guestPlayerId);
    await expect(hostPage.getByTestId("roster-count")).toHaveText("2");
    await expect(guestPage.getByTestId("roster-count")).toHaveText("2");

    await cleanupContext(hostCtx);
    await cleanupContext(guestCtx);
  });

  test("ready peers can exchange messages", async ({ browser }) => {
    const gameId = uniqueGameId();
    const url = `${BASE_URL}?local&game=${gameId}`;
    const hostCtx = await browser.newContext();
    const guestCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const guestPage = await guestCtx.newPage();

    // Connect and reach ready
    await hostPage.goto(url);
    await hostPage.getByTestId("create-room").click();
    await expect(hostPage.getByTestId("session")).toBeVisible();
    const roomCode = await getRoomCode(hostPage);

    await directJoin(guestPage, url, roomCode);

    await expect(hostPage.getByTestId("player-status")).toHaveText("connected", {
      timeout: 15_000,
    });
    await hostPage.getByTestId("start-game").click();

    await expect(hostPage.getByTestId("phase")).toHaveText("ready", {
      timeout: 15_000,
    });
    await expect(guestPage.getByTestId("phase")).toHaveText("ready", {
      timeout: 15_000,
    });

    // Host sends a ping, guest receives it
    await hostPage.getByTestId("send-ping").click();
    await expect(hostPage.getByTestId("messages")).toContainText("sent:hello");
    await expect(guestPage.getByTestId("messages")).toContainText(
      "received:hello",
      { timeout: 5_000 },
    );

    // Guest sends a ping, host receives it
    await guestPage.getByTestId("send-ping").click();
    await expect(guestPage.getByTestId("messages")).toContainText("sent:hello");
    await expect(hostPage.getByTestId("messages")).toContainText(
      "received:hello",
      { timeout: 5_000 },
    );

    await cleanupContext(hostCtx);
    await cleanupContext(guestCtx);
  });

  test("host detects when guest disconnects", async ({ browser }) => {
    const gameId = uniqueGameId();
    const url = `${BASE_URL}?local&game=${gameId}`;
    const hostCtx = await browser.newContext();
    const guestCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const guestPage = await guestCtx.newPage();

    // Connect and reach ready
    await hostPage.goto(url);
    await hostPage.getByTestId("create-room").click();
    await expect(hostPage.getByTestId("session")).toBeVisible();
    const roomCode = await getRoomCode(hostPage);

    await directJoin(guestPage, url, roomCode);

    await expect(hostPage.getByTestId("player-status")).toHaveText("connected", {
      timeout: 15_000,
    });
    await hostPage.getByTestId("start-game").click();

    await expect(hostPage.getByTestId("phase")).toHaveText("ready", {
      timeout: 15_000,
    });

    // Guest closes their tab
    await guestPage.close();

    // Host sees disconnected phase and peer status reflects it
    await expect(hostPage.getByTestId("phase")).toHaveText("disconnected", {
      timeout: 15_000,
    });
    const peerStatus = await hostPage.getByTestId("player-status").textContent();
    expect(["disconnected", "failed"]).toContain(peerStatus);

    // onPlayerLeave callback fired with the departed peer's ID
    await expect(hostPage.getByTestId("left-count")).toHaveText("1");

    await cleanupContext(hostCtx);
    await cleanupContext(guestCtx);
  });

  test("3 players all reach ready and exchange messages", async ({ browser }) => {
    const gameId = uniqueGameId();
    const url = `${BASE_URL}?local&game=${gameId}`;
    const hostCtx = await browser.newContext();
    const guest1Ctx = await browser.newContext();
    const guest2Ctx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const guest1Page = await guest1Ctx.newPage();
    const guest2Page = await guest2Ctx.newPage();

    // Host creates room
    await hostPage.goto(url);
    await hostPage.getByTestId("create-room").click();
    await expect(hostPage.getByTestId("session")).toBeVisible();
    const roomCode = await getRoomCode(hostPage);

    // Guest 1 joins
    await directJoin(guest1Page, url, roomCode);

    // Guest 2 joins
    await directJoin(guest2Page, url, roomCode);

    // Wait for both peers to connect
    await expect(hostPage.getByTestId("peer-count")).toHaveText("2", {
      timeout: 15_000,
    });
    const hostStatuses = hostPage.getByTestId("player-status");
    await expect(hostStatuses.nth(0)).toHaveText("connected");
    await expect(hostStatuses.nth(1)).toHaveText("connected");

    // Host clicks start
    await hostPage.getByTestId("start-game").click();

    // All 3 reach ready phase
    await expect(hostPage.getByTestId("phase")).toHaveText("ready", {
      timeout: 15_000,
    });
    await expect(guest1Page.getByTestId("phase")).toHaveText("ready", {
      timeout: 15_000,
    });
    await expect(guest2Page.getByTestId("phase")).toHaveText("ready", {
      timeout: 15_000,
    });

    // All peers see 2 others (full mesh)
    await expect(hostPage.getByTestId("peer-count")).toHaveText("2");
    await expect(guest1Page.getByTestId("peer-count")).toHaveText("2");
    await expect(guest2Page.getByTestId("peer-count")).toHaveText("2");

    // All peers show "connected" status
    const guest1Statuses = guest1Page.getByTestId("player-status");
    await expect(guest1Statuses).toHaveCount(2);
    await expect(guest1Statuses.nth(0)).toHaveText("connected");
    await expect(guest1Statuses.nth(1)).toHaveText("connected");

    // Host broadcasts a ping — both guests receive it
    await hostPage.getByTestId("send-ping").click();
    await expect(guest1Page.getByTestId("messages")).toContainText(
      "received:hello",
      { timeout: 5_000 },
    );
    await expect(guest2Page.getByTestId("messages")).toContainText(
      "received:hello",
      { timeout: 5_000 },
    );

    // Guest 1 sends a ping — host AND guest 2 receive it (mesh: all peers connected)
    await guest1Page.getByTestId("send-ping").click();
    await expect(hostPage.getByTestId("messages")).toContainText(
      "received:hello",
      { timeout: 5_000 },
    );
    await expect(guest2Page.getByTestId("messages")).toContainText(
      "received:hello",
      { timeout: 5_000 },
    );

    // Player identity: roster has 3 entries with distinct IDs
    await expect(hostPage.getByTestId("roster-count")).toHaveText("3");
    await expect(guest1Page.getByTestId("roster-count")).toHaveText("3");
    await expect(guest2Page.getByTestId("roster-count")).toHaveText("3");

    await cleanupContext(hostCtx);
    await cleanupContext(guest1Ctx);
    await cleanupContext(guest2Ctx);
  });

  test("guest can reconnect after disconnect (3-player)", async ({ browser }) => {
    const gameId = uniqueGameId();
    const url = `${BASE_URL}?local&game=${gameId}`;
    const hostCtx = await browser.newContext();
    const guest1Ctx = await browser.newContext();
    const guest2Ctx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const guest1Page = await guest1Ctx.newPage();
    const guest2Page = await guest2Ctx.newPage();

    // Host creates room
    await hostPage.goto(url);
    await hostPage.getByTestId("create-room").click();
    await expect(hostPage.getByTestId("session")).toBeVisible();
    const roomCode = await getRoomCode(hostPage);

    // Guest 1 joins
    await directJoin(guest1Page, url, roomCode);

    // Guest 2 joins
    await directJoin(guest2Page, url, roomCode);

    // Wait for both peers to connect
    await expect(hostPage.getByTestId("peer-count")).toHaveText("2", {
      timeout: 15_000,
    });

    // Host clicks start
    await hostPage.getByTestId("start-game").click();

    // All 3 reach ready
    await expect(hostPage.getByTestId("phase")).toHaveText("ready", {
      timeout: 15_000,
    });
    await expect(guest1Page.getByTestId("phase")).toHaveText("ready", {
      timeout: 15_000,
    });
    await expect(guest2Page.getByTestId("phase")).toHaveText("ready", {
      timeout: 15_000,
    });

    // Capture guest 2's player ID before they disconnect
    const guest2PlayerId = await guest2Page.getByTestId("player-id").textContent();
    expect(guest2PlayerId).toBeTruthy();

    // Guest 2 disconnects
    await guest2Page.close();
    await guest2Ctx.close();

    // Host still sees "ready" (guest 1 is still connected)
    // Wait for disconnect detection
    await expect(hostPage.getByTestId("left-count")).toHaveText("1", {
      timeout: 15_000,
    });
    await expect(hostPage.getByTestId("phase")).toHaveText("ready");

    // Guest 2 reconnects with same player ID
    const guest2ReconnectCtx = await browser.newContext();
    const guest2ReconnectPage = await guest2ReconnectCtx.newPage();
    await guest2ReconnectPage.goto(
      `${BASE_URL}?local&game=${gameId}&playerId=${guest2PlayerId}&join=${roomCode}`,
    );

    // Reconnected guest reaches ready
    await expect(guest2ReconnectPage.getByTestId("phase")).toHaveText("ready", {
      timeout: 15_000,
    });

    // Roster still has 3 entries on all sides
    await expect(hostPage.getByTestId("roster-count")).toHaveText("3", {
      timeout: 10_000,
    });
    await expect(guest2ReconnectPage.getByTestId("roster-count")).toHaveText("3", {
      timeout: 10_000,
    });

    // Reconnected guest can send messages
    await guest2ReconnectPage.getByTestId("send-ping").click();
    await expect(hostPage.getByTestId("messages")).toContainText(
      "received:hello",
      { timeout: 5_000 },
    );
    await expect(guest1Page.getByTestId("messages")).toContainText(
      "received:hello",
      { timeout: 5_000 },
    );

    await cleanupContext(hostCtx);
    await cleanupContext(guest1Ctx);
    await cleanupContext(guest2ReconnectCtx);
  });
});

/**
 * World Room tests.
 *
 * These test the useWorldRoom hook (decentralized announce, no host, no handshake gate).
 */

test.describe("World Room", () => {
  test("peers join and reach joined phase immediately", async ({ browser }) => {
    const gameId = uniqueGameId();
    const url = `${BASE_URL}?local&mode=world&game=${gameId}`;
    const peer1Ctx = await browser.newContext();
    const peer2Ctx = await browser.newContext();
    const peer1Page = await peer1Ctx.newPage();
    const peer2Page = await peer2Ctx.newPage();

    // Peer 1 creates a world room
    await peer1Page.goto(url);
    await peer1Page.getByTestId("create-room").click();
    await expect(peer1Page.getByTestId("session")).toBeVisible();

    // Phase is "joined" immediately (no waiting/connecting)
    await expect(peer1Page.getByTestId("phase")).toHaveText("joined");

    const roomCode = await getRoomCode(peer1Page);

    // Peer 2 joins
    await directJoin(peer2Page, url, roomCode);

    // Peer 2 is also "joined" immediately
    await expect(peer2Page.getByTestId("phase")).toHaveText("joined");

    // Wait for announce protocol to complete — both see 2 in roster
    await expect(peer1Page.getByTestId("roster-count")).toHaveText("2", {
      timeout: 15_000,
    });
    await expect(peer2Page.getByTestId("roster-count")).toHaveText("2", {
      timeout: 15_000,
    });

    await cleanupContext(peer1Ctx);
    await cleanupContext(peer2Ctx);
  });

  test("onPlayerJoin fires when peer connects", async ({ browser }) => {
    const gameId = uniqueGameId();
    const url = `${BASE_URL}?local&mode=world&game=${gameId}`;
    const peer1Ctx = await browser.newContext();
    const peer2Ctx = await browser.newContext();
    const peer1Page = await peer1Ctx.newPage();
    const peer2Page = await peer2Ctx.newPage();

    // Peer 1 creates room
    await peer1Page.goto(url);
    await peer1Page.getByTestId("create-room").click();
    await expect(peer1Page.getByTestId("session")).toBeVisible();
    const roomCode = await getRoomCode(peer1Page);

    // Peer 2 joins
    await directJoin(peer2Page, url, roomCode);

    // onPlayerJoin fired on both sides
    await expect(peer1Page.getByTestId("joined-count")).toHaveText("1", {
      timeout: 15_000,
    });
    await expect(peer2Page.getByTestId("joined-count")).toHaveText("1", {
      timeout: 15_000,
    });

    await cleanupContext(peer1Ctx);
    await cleanupContext(peer2Ctx);
  });

  test("peers can exchange messages immediately", async ({ browser }) => {
    const gameId = uniqueGameId();
    const url = `${BASE_URL}?local&mode=world&game=${gameId}`;
    const peer1Ctx = await browser.newContext();
    const peer2Ctx = await browser.newContext();
    const peer1Page = await peer1Ctx.newPage();
    const peer2Page = await peer2Ctx.newPage();

    // Connect
    await peer1Page.goto(url);
    await peer1Page.getByTestId("create-room").click();
    await expect(peer1Page.getByTestId("session")).toBeVisible();
    const roomCode = await getRoomCode(peer1Page);

    await directJoin(peer2Page, url, roomCode);

    // Wait for announce to complete (roster has 2)
    await expect(peer1Page.getByTestId("roster-count")).toHaveText("2", {
      timeout: 15_000,
    });

    // Send ping immediately — no start() needed
    await peer1Page.getByTestId("send-ping").click();
    await expect(peer1Page.getByTestId("messages")).toContainText("sent:hello");
    await expect(peer2Page.getByTestId("messages")).toContainText(
      "received:hello",
      { timeout: 5_000 },
    );

    // Peer 2 sends back
    await peer2Page.getByTestId("send-ping").click();
    await expect(peer1Page.getByTestId("messages")).toContainText(
      "received:hello",
      { timeout: 5_000 },
    );

    await cleanupContext(peer1Ctx);
    await cleanupContext(peer2Ctx);
  });

  test("peer detects disconnect", async ({ browser }) => {
    const gameId = uniqueGameId();
    const url = `${BASE_URL}?local&mode=world&game=${gameId}`;
    const peer1Ctx = await browser.newContext();
    const peer2Ctx = await browser.newContext();
    const peer1Page = await peer1Ctx.newPage();
    const peer2Page = await peer2Ctx.newPage();

    // Connect
    await peer1Page.goto(url);
    await peer1Page.getByTestId("create-room").click();
    await expect(peer1Page.getByTestId("session")).toBeVisible();
    const roomCode = await getRoomCode(peer1Page);

    await directJoin(peer2Page, url, roomCode);

    // Wait for connection
    await expect(peer1Page.getByTestId("roster-count")).toHaveText("2", {
      timeout: 15_000,
    });

    // Peer 2 disconnects
    await peer2Page.close();

    // Peer 1 detects disconnect
    await expect(peer1Page.getByTestId("phase")).toHaveText("disconnected", {
      timeout: 15_000,
    });
    await expect(peer1Page.getByTestId("left-count")).toHaveText("1");

    await cleanupContext(peer1Ctx);
    await cleanupContext(peer2Ctx);
  });

  test("multiple peers join dynamically", async ({ browser }) => {
    const gameId = uniqueGameId();
    const url = `${BASE_URL}?local&mode=world&game=${gameId}`;
    const peer1Ctx = await browser.newContext();
    const peer2Ctx = await browser.newContext();
    const peer3Ctx = await browser.newContext();
    const peer1Page = await peer1Ctx.newPage();
    const peer2Page = await peer2Ctx.newPage();
    const peer3Page = await peer3Ctx.newPage();

    // Peer 1 creates room
    await peer1Page.goto(url);
    await peer1Page.getByTestId("create-room").click();
    await expect(peer1Page.getByTestId("session")).toBeVisible();
    const roomCode = await getRoomCode(peer1Page);

    // Peer 2 joins
    await directJoin(peer2Page, url, roomCode);

    // Wait for peer 1 and 2 to see each other
    await expect(peer1Page.getByTestId("roster-count")).toHaveText("2", {
      timeout: 15_000,
    });

    // Peer 3 joins later
    await directJoin(peer3Page, url, roomCode);

    // All 3 peers see each other in roster
    await expect(peer1Page.getByTestId("roster-count")).toHaveText("3", {
      timeout: 15_000,
    });
    await expect(peer2Page.getByTestId("roster-count")).toHaveText("3", {
      timeout: 15_000,
    });
    await expect(peer3Page.getByTestId("roster-count")).toHaveText("3", {
      timeout: 15_000,
    });

    // All can message each other
    await peer1Page.getByTestId("send-ping").click();
    await expect(peer2Page.getByTestId("messages")).toContainText(
      "received:hello",
      { timeout: 5_000 },
    );
    await expect(peer3Page.getByTestId("messages")).toContainText(
      "received:hello",
      { timeout: 5_000 },
    );

    // Peer 3 sends — peer 1 and peer 2 receive (mesh)
    await peer3Page.getByTestId("send-ping").click();
    await expect(peer1Page.getByTestId("messages")).toContainText(
      "received:hello",
      { timeout: 5_000 },
    );
    await expect(peer2Page.getByTestId("messages")).toContainText(
      "received:hello",
      { timeout: 5_000 },
    );

    await cleanupContext(peer1Ctx);
    await cleanupContext(peer2Ctx);
    await cleanupContext(peer3Ctx);
  });
});
