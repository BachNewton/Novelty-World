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
 * Multiplayer framework tests.
 *
 * These test the useGameRoom hook (lobby + WebRTC + ready handshake)
 * independent of any game. Every multiplayer game depends on this flow.
 */

test.describe("Multiplayer Framework", () => {
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

  test("guest can join a room and both reach ready", async ({ browser }) => {
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
    const URL_3P = "/test-multiplayer?players=3";

    const hostCtx = await browser.newContext();
    const guest1Ctx = await browser.newContext();
    const guest2Ctx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const guest1Page = await guest1Ctx.newPage();
    const guest2Page = await guest2Ctx.newPage();

    // Host creates a 3-player room
    await hostPage.goto(URL_3P);
    await hostPage.getByTestId("create-room").click();
    await expect(hostPage.getByTestId("session")).toBeVisible();
    const roomCode = await getRoomCode(hostPage);

    // Guest 1 joins
    await guest1Page.goto(URL_3P);
    await joinByCode(guest1Page, roomCode);

    // Guest 2 joins
    await guest2Page.goto(URL_3P);
    await joinByCode(guest2Page, roomCode);

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

    // Host sees 2 peers, guests see 1 (star topology)
    await expect(hostPage.getByTestId("peer-count")).toHaveText("2");
    await expect(guest1Page.getByTestId("peer-count")).toHaveText("1");
    await expect(guest2Page.getByTestId("peer-count")).toHaveText("1");

    // All peers show "connected" status
    const hostStatuses = hostPage.getByTestId("player-status");
    await expect(hostStatuses).toHaveCount(2);
    await expect(hostStatuses.nth(0)).toHaveText("connected");
    await expect(hostStatuses.nth(1)).toHaveText("connected");
    await expect(guest1Page.getByTestId("player-status")).toHaveText("connected");
    await expect(guest2Page.getByTestId("player-status")).toHaveText("connected");

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

    // Guest 1 sends a ping — host receives it (star topology: guest→host only)
    await guest1Page.getByTestId("send-ping").click();
    await expect(hostPage.getByTestId("messages")).toContainText(
      "received:hello",
      { timeout: 5_000 },
    );

    await hostCtx.close();
    await guest1Ctx.close();
    await guest2Ctx.close();
  });
});

test.describe("Open Room Mode (no maxPlayers)", () => {
  const OPEN_URL = "/test-multiplayer?mode=open";

  test("open room stays in waiting after guest connects", async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const guestCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const guestPage = await guestCtx.newPage();

    // Host creates an open room
    await hostPage.goto(OPEN_URL);
    await hostPage.getByTestId("create-room").click();
    await expect(hostPage.getByTestId("session")).toBeVisible();
    const roomCode = await getRoomCode(hostPage);

    // Guest joins
    await guestPage.goto(OPEN_URL);
    await joinByCode(guestPage, roomCode);

    // Wait for peer to connect at the WebRTC level
    await expect(hostPage.getByTestId("player-status")).toHaveText("connected", {
      timeout: 15_000,
    });

    // Host phase should stay "waiting" — NOT auto-transition
    await expect(hostPage.getByTestId("phase")).toHaveText("waiting");

    await hostCtx.close();
    await guestCtx.close();
  });

  test("host calls start() and both reach ready", async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const guestCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const guestPage = await guestCtx.newPage();

    // Connect
    await hostPage.goto(OPEN_URL);
    await hostPage.getByTestId("create-room").click();
    await expect(hostPage.getByTestId("session")).toBeVisible();
    const roomCode = await getRoomCode(hostPage);

    await guestPage.goto(OPEN_URL);
    await joinByCode(guestPage, roomCode);

    // Wait for peer connection
    await expect(hostPage.getByTestId("player-status")).toHaveText("connected", {
      timeout: 15_000,
    });

    // Host clicks start
    await hostPage.getByTestId("start-game").click();

    // Both reach ready
    await expect(hostPage.getByTestId("phase")).toHaveText("ready", {
      timeout: 15_000,
    });
    await expect(guestPage.getByTestId("phase")).toHaveText("ready", {
      timeout: 15_000,
    });

    // Can exchange messages
    await hostPage.getByTestId("send-ping").click();
    await expect(guestPage.getByTestId("messages")).toContainText(
      "received:hello",
      { timeout: 5_000 },
    );

    await hostCtx.close();
    await guestCtx.close();
  });

  test("start() with multiple guests", async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const guest1Ctx = await browser.newContext();
    const guest2Ctx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const guest1Page = await guest1Ctx.newPage();
    const guest2Page = await guest2Ctx.newPage();

    // Host creates open room
    await hostPage.goto(OPEN_URL);
    await hostPage.getByTestId("create-room").click();
    await expect(hostPage.getByTestId("session")).toBeVisible();
    const roomCode = await getRoomCode(hostPage);

    // Both guests join
    await guest1Page.goto(OPEN_URL);
    await joinByCode(guest1Page, roomCode);
    await guest2Page.goto(OPEN_URL);
    await joinByCode(guest2Page, roomCode);

    // Wait for both peers to connect
    await expect(hostPage.getByTestId("peer-count")).toHaveText("2", {
      timeout: 15_000,
    });
    const hostStatuses = hostPage.getByTestId("player-status");
    await expect(hostStatuses.nth(0)).toHaveText("connected");
    await expect(hostStatuses.nth(1)).toHaveText("connected");

    // Host still in waiting
    await expect(hostPage.getByTestId("phase")).toHaveText("waiting");

    // Host clicks start
    await hostPage.getByTestId("start-game").click();

    // All three reach ready
    await expect(hostPage.getByTestId("phase")).toHaveText("ready", {
      timeout: 15_000,
    });
    await expect(guest1Page.getByTestId("phase")).toHaveText("ready", {
      timeout: 15_000,
    });
    await expect(guest2Page.getByTestId("phase")).toHaveText("ready", {
      timeout: 15_000,
    });

    // Host sees 2 peers, guests see 1
    await expect(hostPage.getByTestId("peer-count")).toHaveText("2");
    await expect(guest1Page.getByTestId("peer-count")).toHaveText("1");
    await expect(guest2Page.getByTestId("peer-count")).toHaveText("1");

    await hostCtx.close();
    await guest1Ctx.close();
    await guest2Ctx.close();
  });

  test("host detects disconnect in open room", async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const guestCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const guestPage = await guestCtx.newPage();

    // Connect and start
    await hostPage.goto(OPEN_URL);
    await hostPage.getByTestId("create-room").click();
    await expect(hostPage.getByTestId("session")).toBeVisible();
    const roomCode = await getRoomCode(hostPage);

    await guestPage.goto(OPEN_URL);
    await joinByCode(guestPage, roomCode);

    await expect(hostPage.getByTestId("player-status")).toHaveText("connected", {
      timeout: 15_000,
    });

    await hostPage.getByTestId("start-game").click();
    await expect(hostPage.getByTestId("phase")).toHaveText("ready", {
      timeout: 15_000,
    });

    // Guest disconnects
    await guestPage.close();

    // Host detects disconnect
    await expect(hostPage.getByTestId("phase")).toHaveText("disconnected", {
      timeout: 15_000,
    });
    await expect(hostPage.getByTestId("left-count")).toHaveText("1");

    await hostCtx.close();
    await guestCtx.close();
  });
});
