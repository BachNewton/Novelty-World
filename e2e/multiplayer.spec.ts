import { test, expect } from "@playwright/test";

const URL = "/test-multiplayer";

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
    const roomCode = await hostPage.getByTestId("room-code").textContent();
    expect(roomCode).toBeTruthy();

    // Guest sees the room in the lobby
    await guestPage.goto(URL);
    await expect(guestPage.getByTestId("room-count")).not.toHaveText("0", {
      timeout: 10_000,
    });

    const joinButton = guestPage.getByTestId("join-room").first();
    await expect(joinButton).toBeVisible();
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

    // Guest joins
    await guestPage.goto(URL);
    await expect(guestPage.getByTestId("room-count")).not.toHaveText("0", {
      timeout: 10_000,
    });
    await guestPage.getByTestId("join-room").first().click();
    await expect(guestPage.getByTestId("session")).toBeVisible();

    // Both sides reach ready phase (application-level handshake complete)
    await expect(hostPage.getByTestId("phase")).toHaveText("ready", {
      timeout: 15_000,
    });
    await expect(guestPage.getByTestId("phase")).toHaveText("ready", {
      timeout: 15_000,
    });

    // Both see 1 peer
    await expect(hostPage.getByTestId("peer-count")).toHaveText("1");
    await expect(guestPage.getByTestId("peer-count")).toHaveText("1");

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
    await guestPage.goto(URL);
    await expect(guestPage.getByTestId("room-count")).not.toHaveText("0", {
      timeout: 10_000,
    });
    await guestPage.getByTestId("join-room").first().click();

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
    await guestPage.goto(URL);
    await expect(guestPage.getByTestId("room-count")).not.toHaveText("0", {
      timeout: 10_000,
    });
    await guestPage.getByTestId("join-room").first().click();

    await expect(hostPage.getByTestId("phase")).toHaveText("ready", {
      timeout: 15_000,
    });

    // Guest closes their tab
    await guestPage.close();

    // Host sees disconnected phase
    await expect(hostPage.getByTestId("phase")).toHaveText("disconnected", {
      timeout: 15_000,
    });

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

    // Guest 1 joins
    await guest1Page.goto(URL_3P);
    await expect(guest1Page.getByTestId("room-count")).not.toHaveText("0", {
      timeout: 10_000,
    });
    await guest1Page.getByTestId("join-room").first().click();
    await expect(guest1Page.getByTestId("session")).toBeVisible();

    // Guest 2 joins
    await guest2Page.goto(URL_3P);
    await expect(guest2Page.getByTestId("room-count")).not.toHaveText("0", {
      timeout: 10_000,
    });
    await guest2Page.getByTestId("join-room").first().click();
    await expect(guest2Page.getByTestId("session")).toBeVisible();

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
