import { test as base } from "@playwright/test";
import { cpus } from "os";

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
 */
export const test = base.extend<object, { coreShare: number }>({
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
});
