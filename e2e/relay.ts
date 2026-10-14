/**
 * The query parameter that points a page at this run's own relay
 * (relay/main.ts, started by playwright.config.ts), so the multiplayer suites
 * never touch the real one. Playwright reads the relay's port from its
 * startup line into E2E_RELAY_PORT.
 */
const port = process.env.E2E_RELAY_PORT;
if (port === undefined) throw new Error("E2E_RELAY_PORT is unset: the e2e relay didn't start");

export const LOCAL_RELAY = `relay=local:${port}`;
