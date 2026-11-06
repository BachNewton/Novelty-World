// The game in headless Chromium for the tools, made to fail rather than wait: every step a tool takes runs through
// `step`, which fails the run, closes the browser and exits when the page throws, when the game shows it lost part of
// the map, or when the step passes its deadline with neither. A tile file that fails to load never lands, so the stream
// never drains, and a tool waiting on it would keep a browser drawing with no frame limit until someone noticed: one ran
// all night and overheated the laptop. The full Chromium is asked for by name: the default headless shell falls back
// to WebGL2 here.

import { chromium } from "playwright";

// For a stall that says nothing; a far jump with its tiles lands well inside it.
const STEP_DEADLINE_S = 300;
const LOAD_DEADLINE_S = 180;
const LAUNCH_ARGS = ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--enable-gpu"];
// Frames drawn as fast as the GPU goes, for a tool that times nothing and only waits on them.
export const UNCAPPED_ARGS = ["--disable-gpu-vsync", "--disable-frame-rate-limit"];

/**
 * Opens the game at `url` and waits for its probe (or for `ready`, a predicate run in the page), failing as `step`
 * does. `cleanup` runs when the run ends either way, for a tile server the tool started. `init`, a function, runs in the
 * page before any of the page's own scripts, for a tool that watches the page from its start.
 */
export async function openGame(url, { width, height, args = [], ready = () => window.__alandDrive !== undefined, cleanup = () => {}, init }) {
  const browser = await chromium.launch({ channel: "chromium", headless: true, args: [...LAUNCH_ARGS, ...args] });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  if (init) await page.addInitScript(init);
  const problems = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") problems.push(`${message.type()}: ${message.text()}`);
  });
  let pageThrew;
  const thrown = new Promise((_, reject) => (pageThrew = reject));
  thrown.catch(() => {});
  page.on("pageerror", (error) => {
    problems.push(`thrown: ${error.stack ?? error.message}`);
    pageThrew(new Error(`the page threw: ${error.message}`));
  });
  const lostMap = page.getByText("lost part of the map");
  const stopped = lostMap.waitFor({ timeout: 0 }).then(async () => {
    throw new Error(`the game stopped: ${await lostMap.innerText()}`);
  });
  stopped.catch(() => {});
  const reported = () => [...new Set(problems)].slice(0, 20).join("\n");

  const close = async () => {
    await browser.close();
    await cleanup();
  };
  // Ctrl-C or a closed console still closes the browser, which would otherwise outlive the tool.
  for (const signal of ["SIGINT", "SIGTERM", "SIGBREAK"]) {
    process.once(signal, () => {
      void close().finally(() => process.exit(1));
    });
  }

  const step = async (name, work, deadlineS = STEP_DEADLINE_S) => {
    let deadline;
    const late = new Promise((_, reject) => (deadline = setTimeout(() => reject(new Error(`not ready within ${deadlineS} s`)), deadlineS * 1000)));
    try {
      return await Promise.race([work(), thrown, stopped, late]);
    } catch (error) {
      console.log(`${name} failed: ${error.message}\n${reported()}`);
      await close();
      process.exit(1);
    } finally {
      clearTimeout(deadline);
    }
  };

  await step("loading the game", async () => {
    await page.goto(url, { waitUntil: "load" });
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    await page.waitForFunction(ready, null, { timeout: 0 });
  }, LOAD_DEADLINE_S);

  return {
    page,
    step,
    /** What the page warned or threw, for the end of a run. */
    reported,
    /** Closes the browser and whatever `cleanup` holds, at the end of a run. */
    close,
  };
}

/** Waits for the stream to drain and the frames after it, asking for counts every frame since they arrive late. */
export function settleFrames(page, frames) {
  return page.evaluate(async (settle) => {
    const probe = window.__alandDrive;
    for (const until = probe.frames() + settle; probe.frames() < until; ) await new Promise(requestAnimationFrame);
    while (probe.stream().loading > 0) await new Promise(requestAnimationFrame);
    for (const until = probe.frames() + settle; probe.frames() < until; ) {
      probe.counts();
      await new Promise(requestAnimationFrame);
    }
  }, frames);
}
