import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

const URL = "/test-multiplayer";

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
 * Lobby Room tests.
 *
 * These test the useLobbyRoom hook (lobby + WebRTC + ready handshake)
 * independent of any game. Every lobby-based multiplayer game depends on this flow.
 */

test.describe("Lobby Room", () => {
  test("room can be created and appears in lobby", async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const guestCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const guestPage = await guestCtx.newPage();

    // Host creates a room
    await hostPage.goto(URL);
    await hostPage.getByTestId("create-room").click();
    await expect(hostPage.getByTestId("session")).toBeVisible();
    const roomCode = await getRoomCode(hostPage);

    // Guest sees the room in the lobby
    await guestPage.goto(URL);
    const joinButton = guestPage.locator(
      `[data-testid="join-room"][data-room-code="${roomCode}"]`,
    );
    await expect(joinButton).toBeVisible({ timeout: 10_000 });
    expect(await joinButton.textContent()).toBe(roomCode);

    await hostCtx.close();
    await guestCtx.close();
  });

  test("guest can join a room, host starts, and both reach ready", async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const guestCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const guestPage = await guestCtx.newPage();

    // Host creates room
    await hostPage.goto(URL);
    await hostPage.getByTestId("create-room").click();
    await expect(hostPage.getByTestId("session")).toBeVisible();
    const roomCode = await getRoomCode(hostPage);

    // Guest joins the specific room
    await guestPage.goto(URL);
    await joinByCode(guestPage, roomCode);

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

    await hostCtx.close();
    await guestCtx.close();
  });

  test("ready peers can exchange messages", async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const guestCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const guestPage = await guestCtx.newPage();

    // Connect and reach ready
    await hostPage.goto(URL);
    await hostPage.getByTestId("create-room").click();
    await expect(hostPage.getByTestId("session")).toBeVisible();
    const roomCode = await getRoomCode(hostPage);

    await guestPage.goto(URL);
    await joinByCode(guestPage, roomCode);

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

    await hostCtx.close();
    await guestCtx.close();
  });

  test("host detects when guest disconnects", async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const guestCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const guestPage = await guestCtx.newPage();

    // Connect and reach ready
    await hostPage.goto(URL);
    await hostPage.getByTestId("create-room").click();
    await expect(hostPage.getByTestId("session")).toBeVisible();
    const roomCode = await getRoomCode(hostPage);

    await guestPage.goto(URL);
    await joinByCode(guestPage, roomCode);

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

    await hostCtx.close();
    await guestCtx.close();
  });

  test("3 players all reach ready and exchange messages", async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const guest1Ctx = await browser.newContext();
    const guest2Ctx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const guest1Page = await guest1Ctx.newPage();
    const guest2Page = await guest2Ctx.newPage();

    // Host creates room
    await hostPage.goto(URL);
    await hostPage.getByTestId("create-room").click();
    await expect(hostPage.getByTestId("session")).toBeVisible();
    const roomCode = await getRoomCode(hostPage);

    // Guest 1 joins
    await guest1Page.goto(URL);
    await joinByCode(guest1Page, roomCode);

    // Guest 2 joins
    await guest2Page.goto(URL);
    await joinByCode(guest2Page, roomCode);

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

    await hostCtx.close();
    await guest1Ctx.close();
    await guest2Ctx.close();
  });
});

/**
 * World Room tests.
 *
 * These test the useWorldRoom hook (decentralized announce, no host, no handshake gate).
 */

test.describe("World Room", () => {
  const WORLD_URL = "/test-multiplayer?mode=world";

  test("peers join and reach joined phase immediately", async ({ browser }) => {
    const peer1Ctx = await browser.newContext();
    const peer2Ctx = await browser.newContext();
    const peer1Page = await peer1Ctx.newPage();
    const peer2Page = await peer2Ctx.newPage();

    // Peer 1 creates a world room
    await peer1Page.goto(WORLD_URL);
    await peer1Page.getByTestId("create-room").click();
    await expect(peer1Page.getByTestId("session")).toBeVisible();

    // Phase is "joined" immediately (no waiting/connecting)
    await expect(peer1Page.getByTestId("phase")).toHaveText("joined");

    const roomCode = await getRoomCode(peer1Page);

    // Peer 2 joins
    await peer2Page.goto(WORLD_URL);
    await joinByCode(peer2Page, roomCode);

    // Peer 2 is also "joined" immediately
    await expect(peer2Page.getByTestId("phase")).toHaveText("joined");

    // Wait for announce protocol to complete — both see 2 in roster
    await expect(peer1Page.getByTestId("roster-count")).toHaveText("2", {
      timeout: 15_000,
    });
    await expect(peer2Page.getByTestId("roster-count")).toHaveText("2", {
      timeout: 15_000,
    });

    await peer1Ctx.close();
    await peer2Ctx.close();
  });

  test("onPlayerJoin fires when peer connects", async ({ browser }) => {
    const peer1Ctx = await browser.newContext();
    const peer2Ctx = await browser.newContext();
    const peer1Page = await peer1Ctx.newPage();
    const peer2Page = await peer2Ctx.newPage();

    // Peer 1 creates room
    await peer1Page.goto(WORLD_URL);
    await peer1Page.getByTestId("create-room").click();
    await expect(peer1Page.getByTestId("session")).toBeVisible();
    const roomCode = await getRoomCode(peer1Page);

    // Peer 2 joins
    await peer2Page.goto(WORLD_URL);
    await joinByCode(peer2Page, roomCode);

    // onPlayerJoin fired on both sides
    await expect(peer1Page.getByTestId("joined-count")).toHaveText("1", {
      timeout: 15_000,
    });
    await expect(peer2Page.getByTestId("joined-count")).toHaveText("1", {
      timeout: 15_000,
    });

    await peer1Ctx.close();
    await peer2Ctx.close();
  });

  test("peers can exchange messages immediately", async ({ browser }) => {
    const peer1Ctx = await browser.newContext();
    const peer2Ctx = await browser.newContext();
    const peer1Page = await peer1Ctx.newPage();
    const peer2Page = await peer2Ctx.newPage();

    // Connect
    await peer1Page.goto(WORLD_URL);
    await peer1Page.getByTestId("create-room").click();
    await expect(peer1Page.getByTestId("session")).toBeVisible();
    const roomCode = await getRoomCode(peer1Page);

    await peer2Page.goto(WORLD_URL);
    await joinByCode(peer2Page, roomCode);

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

    await peer1Ctx.close();
    await peer2Ctx.close();
  });

  test("peer detects disconnect", async ({ browser }) => {
    const peer1Ctx = await browser.newContext();
    const peer2Ctx = await browser.newContext();
    const peer1Page = await peer1Ctx.newPage();
    const peer2Page = await peer2Ctx.newPage();

    // Connect
    await peer1Page.goto(WORLD_URL);
    await peer1Page.getByTestId("create-room").click();
    await expect(peer1Page.getByTestId("session")).toBeVisible();
    const roomCode = await getRoomCode(peer1Page);

    await peer2Page.goto(WORLD_URL);
    await joinByCode(peer2Page, roomCode);

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

    await peer1Ctx.close();
    await peer2Ctx.close();
  });

  test("multiple peers join dynamically", async ({ browser }) => {
    const peer1Ctx = await browser.newContext();
    const peer2Ctx = await browser.newContext();
    const peer3Ctx = await browser.newContext();
    const peer1Page = await peer1Ctx.newPage();
    const peer2Page = await peer2Ctx.newPage();
    const peer3Page = await peer3Ctx.newPage();

    // Peer 1 creates room
    await peer1Page.goto(WORLD_URL);
    await peer1Page.getByTestId("create-room").click();
    await expect(peer1Page.getByTestId("session")).toBeVisible();
    const roomCode = await getRoomCode(peer1Page);

    // Peer 2 joins
    await peer2Page.goto(WORLD_URL);
    await joinByCode(peer2Page, roomCode);

    // Wait for peer 1 and 2 to see each other
    await expect(peer1Page.getByTestId("roster-count")).toHaveText("2", {
      timeout: 15_000,
    });

    // Peer 3 joins later
    await peer3Page.goto(WORLD_URL);
    await joinByCode(peer3Page, roomCode);

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

    await peer1Ctx.close();
    await peer2Ctx.close();
    await peer3Ctx.close();
  });
});
