// The game in headless Chromium for the tools, made to fail rather than wait: every step a tool takes runs through
// `step`, which fails the run, closes the browser and exits when the page throws, when the game shows it lost part of
// the map, or when the step passes its deadline with neither. A tile file that fails to load never lands, so the stream
// never drains, and a tool waiting on it would keep a browser drawing with no frame limit until someone noticed: one ran
// all night and overheated the laptop. The full Chromium is asked for by name: the default headless shell falls back
// to WebGL2 here.

import { chromium } from "playwright";
import { requireSlot } from "../../../../scripts/machine-budget.mjs";

// For a stall that says nothing; a far jump with its tiles lands well inside it.
const STEP_DEADLINE_S = 300;
const LOAD_DEADLINE_S = 180;
const LAUNCH_ARGS = ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--enable-gpu"];
/** A frame on the tool's clock: the 16 ms the fake clock fires animation frames at, so a tick is exactly one frame. */
export const FRAME_MS = 16;
// Frames drawn as fast as the GPU goes, for a tool that times nothing and only waits on them.
export const UNCAPPED_ARGS = ["--disable-gpu-vsync", "--disable-frame-rate-limit"];

/**
 * Opens the game at `url` and waits for its probe (or for `ready`, a predicate run in the page), failing as `step`
 * does. `cleanup` runs when the run ends either way, for a tile server the tool started. `init`, a function, runs in the
 * page before any of the page's own scripts, for a tool that watches the page from its start, with `initArg` as its one
 * argument (it's serialised into the page, so it stands alone). `clock`, a time in milliseconds, puts the page on a clock
 * of the tool's own from before it loads, stopped at that moment: time, timers and animation frames then move only when
 * `tick` is called, a frame's worth at a time, so two pages ticked alike draw the same frame, whatever the machine does.
 */
export async function openGame(url, { width, height, args = [], ready = () => window.__alandDrive !== undefined, cleanup = () => {}, init, initArg, clock }) {
  requireSlot("A tool that opens the game");
  const browser = await chromium.launch({ channel: "chromium", headless: true, args: [...LAUNCH_ARGS, ...args] });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  if (init) await page.addInitScript(init, initArg);
  let ticks = 0;
  const tick = async (frames = 1) => {
    for (let frame = 0; frame < frames; frame++) {
      await page.clock.runFor(FRAME_MS);
      ticks++;
    }
  };
  if (clock !== undefined) {
    await page.clock.install({ time: clock });
    await page.clock.pauseAt(clock);
  }
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
    if (clock === undefined) await page.waitForFunction(ready, null, { timeout: 0 });
    // On the tool's clock nothing moves on its own: the page is ticked a frame at a time until it's ready.
    else while (!(await page.evaluate(ready))) await tick();
  }, LOAD_DEADLINE_S);

  return {
    page,
    step,
    /** Moves the tool's clock on by whole frames (`clock`), and how many it has moved so far. */
    tick,
    ticks: () => ticks,
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
