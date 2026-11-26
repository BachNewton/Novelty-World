// Prices the parts of Adventure's frame. Opens the game on the dev server in headless Chromium, frames uncapped, on
// the integrated GPU (or the eGPU with --egpu), waits for the world to load, then:
//
//   - leaves each part out in turn (the probe's `leaveOut`: sky, town, ground, villagers, or `resolution`,
//     which halves the pixel ratio), in alternated pairs of one-second windows, on and off, the order swapped each pair,
//     and reports the ratio of frames drawn and of the GPU's own time a frame (the renderer's timestamp queries, which
//     the page turns on with `?gpu-time`), each with its median and spread. Ratios within one sitting, never times
//     across runs: the machine is shared.
//   - records a CPU profile of the main thread with everything in, and reports where its time went by function.
//
// While it runs it draws uncapped frames at full size on the integrated GPU, which also drives the owner's screen, so
// it takes the machine from them for its whole run: a session asks the owner before running it, and counts work
// (`drawn()`) where a count can answer.
//
// A frame bound by the GPU shows in `resolution`: the GPU's time falls with the pixels. One bound by the main thread
// shows as little idle time in the profile.
//
// `--players 2` plays split screen: a stand-in pad joins a second player before anything is measured, and the lever
// `second` has them leave and join again, which prices the second half of the screen against one player alone.
//
// Usage: npm run slot -- browser -- node src/projects/adventure/tools/profile.mjs
//          [--levers sky,town,ground,villagers,resolution,second] [--pairs N] [--width W] [--height H] [--dpr N]
//          [--seconds S] [--egpu true] [--players 2] [--url U]

import { chromium } from "playwright";
import { PAGE_MIB, requireSlot } from "../../../../scripts/machine-budget.mjs";

const args = Object.fromEntries(process.argv.slice(2).flatMap((a, i, all) => (a.startsWith("--") ? [[a.slice(2), all[i + 1]]] : [])));
const URL = args.url ?? "http://localhost:3001/games/3d-games/adventure?gpu-time";
const WIDTH = Number(args.width ?? 3440);
const HEIGHT = Number(args.height ?? 1300);
const DPR = Number(args.dpr ?? 1);
const SECONDS = Number(args.seconds ?? 3);
const LEVERS = (args.levers ?? "sky,town,ground,villagers,resolution").split(",").filter(Boolean);
const PAIRS = Number(args.pairs ?? 8);
const EGPU = args.egpu === "true";
const PLAYERS = Number(args.players ?? 1);
/** The standard layout's Menu button, which joins a second player on a pad, or has them leave. */
const MENU = 9;

requireSlot("The Adventure profiler", { radeon: 1, egpu: EGPU ? PAGE_MIB : 0 });
const browser = await chromium.launch({
  channel: "chromium",
  headless: true,
  args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--enable-gpu", "--disable-gpu-vsync", "--disable-frame-rate-limit", ...(EGPU ? ["--force-high-performance-gpu"] : [])],
});
try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: DPR });
  page.on("pageerror", (e) => console.error("page threw:", e.message));
  // A stand-in pad, for a second player to join on: the page reads pads only through `navigator.getGamepads`.
  if (PLAYERS === 2) {
    await page.addInitScript(() => {
      const pad = { index: 0, id: "stand-in", mapping: "standard", connected: true, timestamp: 0, buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })), axes: [0, 0, 0, 0] };
      navigator.getGamepads = () => [pad];
      window.__standInPad = pad;
    });
  }
  await page.goto(URL);
  // Every part of the world lands when its files have.
  await page.waitForFunction(() => window.__adventure?.loaded().length === 4, null, { timeout: 180_000 });

  /** Press Menu on the stand-in pad until the players number `count`: a press is seen on the frame it is read. */
  const players = async (count) => {
    if ((await page.evaluate(() => window.__adventure.players())) === count) return;
    await page.evaluate((b) => (window.__standInPad.buttons[b] = { pressed: true, touched: true, value: 1 }), MENU);
    await page.waitForFunction((n) => window.__adventure.players() === n, count);
    await page.evaluate((b) => (window.__standInPad.buttons[b] = { pressed: false, touched: false, value: 0 }), MENU);
    // The release is read on a frame of its own, so the next press is a press.
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  };
  /** Leave a part of the frame out, or put it back: a part of the world, the resolution, or the second player. */
  const leaveOut = (lever, out) => (lever === "second" ? players(out ? 1 : 2) : page.evaluate(([l, o]) => window.__adventure.leaveOut(l, o), [lever, out]));
  if (PLAYERS === 2) await players(2);

  /** Frames drawn in a second, and the GPU's time for each. */
  const second = () =>
    page.evaluate(
      () =>
        new Promise((resolve) => {
          const probe = window.__adventure;
          let frames = 0;
          let gpu = 0;
          const reads = [];
          const start = performance.now();
          const tick = () => {
            frames++;
            reads.push(probe.gpuTime().then((ms) => (gpu += ms)));
            if (performance.now() - start < 1000) requestAnimationFrame(tick);
            else Promise.all(reads).then(() => resolve({ fps: frames, gpu: gpu / frames }));
          };
          requestAnimationFrame(tick);
        }),
    );
  const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const spread = (xs) => `${Math.min(...xs).toFixed(2)}-${Math.max(...xs).toFixed(2)}`;

  const all = [];
  for (const lever of LEVERS) {
    const fps = [];
    const gpu = [];
    let calls = 0;
    for (let i = 0; i < PAIRS; i++) {
      const got = new Map();
      for (const out of i % 2 === 0 ? [false, true] : [true, false]) {
        await leaveOut(lever, out);
        await second(); // settle: a part put back may compile on its first frame
        got.set(out, await second());
        if (out) calls = await page.evaluate(() => window.__adventure.drawn().calls);
      }
      fps.push(got.get(true).fps / got.get(false).fps);
      gpu.push(got.get(true).gpu / got.get(false).gpu);
      all.push(got.get(false));
      await leaveOut(lever, false);
    }
    console.log(`${lever.padEnd(10)} draws without ${String(calls).padStart(4)}   frames without/with ${median(fps).toFixed(2)} (${spread(fps)})   GPU time without/with ${median(gpu).toFixed(2)} (${spread(gpu)})`);
  }
  if (all.length > 0) console.log(`everything in: median ${median(all.map((s) => s.fps))} frames a second, GPU ${median(all.map((s) => s.gpu)).toFixed(2)} ms a frame`);
  console.log(`counts: ${JSON.stringify(await page.evaluate(() => window.__adventure.drawn()))}`);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.start");
  await page.evaluate((s) => new Promise((r) => setTimeout(r, s * 1000)), SECONDS);
  const { profile } = await cdp.send("Profiler.stop");

  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map(profile.nodes.flatMap((n) => (n.children ?? []).map((c) => [c, n.id])));
  const name = (n) => `${n.callFrame.functionName || "(anonymous)"} ${n.callFrame.url.split("/").pop()?.split("?")[0] ?? ""}`;
  const own = new Map();
  const within = new Map();
  for (const id of profile.samples) {
    own.set(name(byId.get(id)), (own.get(name(byId.get(id))) ?? 0) + 1);
    const seen = new Set();
    for (let at = id; at !== undefined; at = parent.get(at)) seen.add(name(byId.get(at)));
    for (const key of seen) within.set(key, (within.get(key) ?? 0) + 1);
  }
  const share = (count) => `${((100 * count) / profile.samples.length).toFixed(1).padStart(5)}%`;
  console.log(`\nmain thread over ${SECONDS}s, own time:`);
  for (const [key, count] of [...own].sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`${share(count)}  ${key}`);
  console.log("\nincluding what it calls:");
  for (const [key, count] of [...within].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(`${share(count)}  ${key}`);
} finally {
  await browser.close();
}
