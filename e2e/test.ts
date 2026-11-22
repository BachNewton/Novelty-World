import { test as base } from "@playwright/test";
import { cpus } from "os";
import { holdPages } from "../scripts/page-gate.mjs";

export { expect } from "@playwright/test";

/**
 * Every spec imports `test` from here. A page sizes its work to
 * `navigator.hardwareConcurrency` (a Betrayal house starts a bake worker per
 * core), which on a real device is one page with all the cores. A run has a
 * page per Playwright worker, so each page reports its fair share instead,
 * and all of them together use about the machine's cores.
 *
 * Playwright has no hook that adds an init script to every context, and the
 * multiplayer specs make their own contexts, so wrap the worker's
 * `browser.newContext`: the default `context` fixture goes through it too.
 *
 * A test whose browser draws on a GPU holds its pages from the run's page gate
 * (scripts/page-gate.mjs) for as long as it runs, so the run never has more open
 * than its slot claimed. It holds `openPages`, one unless its spec says more with
 * `test.use({ openPages: N })`, which is also what the budget reads to size the
 * run's claim (scripts/e2e-claims.mjs); opening more than that fails the test.
 */
export const test = base.extend<{ openPages: number; pageGate: void }, { coreShare: number }>({
  coreShare: [
    async ({}, use, workerInfo) => {
      await use(Math.max(2, Math.floor(cpus().length / workerInfo.config.workers)));
    },
    { scope: "worker" },
  ],
  browser: [
    async ({ browser, coreShare }, use) => {
      const newContext = browser.newContext.bind(browser);
      browser.newContext = async (options) => {
        const context = await newContext(options);
        await context.addInitScript((cores) => {
          Object.defineProperty(Navigator.prototype, "hardwareConcurrency", { get: () => cores });
        }, coreShare);
        return context;
      };
      await use(browser);
    },
    { scope: "worker" },
  ],
  openPages: [1, { option: true }],
  pageGate: [
    async ({ browser, channel, launchOptions, openPages }, use) => {
      // The same reading of the launch flags as the budget's: the default headless shell draws in software.
      const onGpu = channel === "chromium" || (launchOptions.args ?? []).includes("--enable-gpu");
      if (!onGpu) {
        await use();
        return;
      }
      const port = Number(process.env.E2E_PAGE_GATE_PORT);
      const release = await holdPages(port, openPages);
      const newContext = browser.newContext;
      browser.newContext = async (options) => {
        const context = await newContext(options);
        const newPage = context.newPage.bind(context);
        context.newPage = async () => {
          const page = await newPage();
          const open = browser.contexts().reduce((count, each) => count + each.pages().length, 0);
          if (open > openPages) {
            throw new Error(`This test has ${open} pages open and holds ${openPages}: say how many it opens with test.use({ openPages: N }).`);
          }
          return page;
        };
        return context;
      };
      await use();
      browser.newContext = newContext;
      // A test that failed before closing its own contexts would leave their pages drawing into the next test's turn.
      await Promise.all(browser.contexts().map((context) => context.close()));
      release();
    },
    // Its own timeout, none: the wait for pages isn't the test's time, and it ends when the tests ahead of it do.
    { auto: true, timeout: 0 },
  ],
});
