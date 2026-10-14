import { test, expect } from "./test";
import { LOCAL_RELAY } from "./relay";

/**
 * The Connection Test tool: one browser hosts, another joins it from the list of open rooms, and
 * both see a round trip measured through the run's own relay. Every wait is
 * on what the page renders.
 */
/** Each run lists its rooms on a channel of its own, so real players never see them. */
const URL = `/tools/connection-test?${LOCAL_RELAY}&room-list=e2e-${crypto.randomUUID()}`;

test("a guest joins a host from the open-rooms list and each sees a round trip", async ({ browser }) => {
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  try {
    const host = await hostCtx.newPage();
    const guest = await guestCtx.newPage();
    await host.goto(URL);
    await guest.goto(URL);

    await host.getByRole("button", { name: "Host a room" }).click();
    const code = host.getByTestId("room-code");
    await expect(code).toHaveText(/^[A-Z2-9]{4}$/);
    await guest.getByRole("button", { name: /^Join .*'s game$/ }).click();

    for (const page of [host, guest]) {
      await expect(page.getByTestId("room-status")).toHaveText("Connected");
      await expect(page.getByTestId("player-row")).toHaveCount(2);
      await expect(page.getByTestId("round-trip")).toHaveText(/\d+ ms/);
    }

    await guest.getByRole("button", { name: "Leave" }).click();
    await expect(host.getByTestId("player-row")).toHaveCount(1);
  } finally {
    await hostCtx.close();
    await guestCtx.close();
  }
});
