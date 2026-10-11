// Measures the Betrayal house's first load and its frames while it bakes, over several runs, for
// judging whether the bake leaves the page's thread free, without a browser open.
//
// Each run opens the page in a fresh browser context (an empty cache, as on a first visit) and records,
// from the page's own events: when the scene hook appears, when its first room shows, lit, when the house is ready (built, direct light
// in, camera settled), when it is fully lit, every animation frame, and the main thread's long tasks.
// Then it re-bakes one room of the lit house, as discovering a room does in play, and records the frames
// through that too. Frame gaps are reported from the first frame after the house was mounted ("shown")
// and through the re-bake.
//
// Prereq: a production server of the app on a free port, never the dev server on 3001, e.g.
//   NEXT_DIST_DIR=.next-bench/dist npx next build --no-mangling   (names survive for --profile; restore next-env.d.ts after)
//   NEXT_DIST_DIR=.next-bench/dist npx next start --port <port>
// Usage:  BETRAYAL_URL=http://localhost:<port>/board-games/betrayal node src/projects/betrayal/tools/startup-perf.mjs [flags]
//   --runs=5          runs, reported as median [min–max]; take several, the machine's load moves the numbers
//   --query=house     the page's query string
//   --cores=N         the cores the page is told it has, which sizes the bake's worker pool
//   --rebake=foyer    the room re-baked on the lit house
//   --profile         a CPU profile of the page's thread to a second after fully lit, and through the re-bake: top functions
//   --timeline        every bake state, long task and frame gap in order; with --profile, what each long task ran
//   --depth=4         call-chain depth for --timeline and --chain
//   --chain=<fn>      the call chains under a function, by name, in each profile
//   --shaders         logs shader links and GL calls that block the thread, into the timeline
//   --trace=<path>    writes a Chrome trace of the load, to ready (GPU process included)

import { chromium } from "playwright";

const flag = (name) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
const RUNS = Number(flag("runs") ?? 5);
const QUERY = flag("query") ?? "house";
const PROFILE = process.argv.includes("--profile");
const CORES = flag("cores");
const DEPTH = Number(flag("depth") ?? 4);
/** Writes a Chrome trace of the load, up to ready, to this path, for what the GPU process did. */
const TRACE = flag("trace");
/** Lists the call chains under a function, by its name, in each profile. */
const CHAIN = flag("chain");
const SHADERS = process.argv.includes("--shaders");
const TIMELINE = process.argv.includes("--timeline");
/** The room re-baked on the lit house, as discovering it would. */
const REBAKE = flag("rebake") ?? "foyer";
const BASE = process.env.BETRAYAL_URL ?? "http://localhost:3001/board-games/betrayal";
const VIEWPORT = { width: 1920, height: 1080 };

const browser = await chromium.launch({ headless: true, args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"] });

/** Runs in the page before its own scripts: watches frames, long tasks and the scene's readiness, by events. */
function watch() {
  const record = { frames: [], longTasks: [], hookAt: null, firstRoomAt: null, readyAt: null, fullyLitAt: null, bakes: [] };
  window.__startupPerf = record;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) record.longTasks.push({ start: entry.startTime, ms: entry.duration });
  }).observe({ type: "longtask", buffered: true });
  const frame = (now) => {
    record.frames.push(now);
    const house = window.__betrayalHouse;
    if (house) {
      const bake = house.bake();
      const state = bake.pending ? bake.passes.join("+") : "idle";
      if (record.bakes.at(-1)?.state !== state) record.bakes.push({ at: now, state });
      record.hookAt ??= now;
      if (record.firstRoomAt === null && house.roomsShown() > 0) record.firstRoomAt = now;
      if (record.readyAt === null && house.isReady()) record.readyAt = now;
      if (record.fullyLitAt === null && house.isFullyLit()) record.fullyLitAt = now;
    }
    if (record.fullyLitAt !== null && now - record.fullyLitAt >= 1000) record.done = true;
    if (!record.stop) requestAnimationFrame(frame);
  };
  // A stretch of known work at a known time, so the CPU profile's clock can be lined up with the page's.
  const perfClockMarker = () => {
    const until = performance.now() + 3;
    while (performance.now() < until);
  };
  record.markerAt = performance.now();
  perfClockMarker();
  window.__perfClockMarker = perfClockMarker;
  requestAnimationFrame(frame);
}

/** Runs in the page: logs every shader program linked, and every wait on one that blocks the thread. */
function watchShaders() {
  const log = [];
  window.__shaderLog = log;
  const shaders = new WeakMap();
  const linked = new WeakMap();
  /** Every program linked so far, by name and source lines. */
  const sources = [];
  const proto = WebGL2RenderingContext.prototype;
  const { shaderSource, attachShader, linkProgram } = proto;
  proto.shaderSource = function (shader, source) {
    shaders.set(shader, source);
    return shaderSource.call(this, shader, source);
  };
  /** A program named by what it is: three's material type and which of the house's shader patches it carries. */
  const describe = (source) => {
    const type = /#define SHADER_TYPE (.*)/.exec(source)?.[1] ?? "?";
    const name = /#define SHADER_NAME (.+)/.exec(source)?.[1];
    const tags = [
      ["flickerMap", "baked"],
      ["probeCube", "probe"],
      ["cutEdges", "cut"],
      ["ghostGlow", "ghost"],
      ["DEPTH_PACKING", "depth"],
      ["#define USE_SHADOWMAP", "shadowed"],
      ["#define USE_MAP", "map"],
      ["#define USE_INSTANCING", "instanced"],
    ].flatMap(([needle, tag]) => (source.includes(needle) ? [tag] : []));
    // The scene's state the program was built for: two programs of one material differing here were built for different scenes.
    for (const [, what, count] of source.matchAll(/#define NUM_(\w+) (\d+)/g)) if (count !== "0") tags.push(`${count} ${what.toLowerCase()}`);
    for (const flag of ["USE_FOG", "FOG_EXP2", "DOUBLE_SIDED", "FLIP_SIDED", "USE_ALPHATEST", "TONE_MAPPING", "USE_COLOR"]) if (source.includes(`#define ${flag}\n`)) tags.push(flag.toLowerCase());
    return `${name ? `"${name}" ` : ""}${type}${tags.length > 0 ? ` [${tags.join(" ")}]` : ""}`;
  };
  /** Who linked it: the page's own functions on the stack, three's included, nearest first. */
  const caller = () =>
    (new Error().stack ?? "")
      .split("\n")
      .slice(3)
      .map((line) => /at (?:Object\.|WebGLRenderer\.|new )?([\w$.]+) /.exec(line)?.[1])
      .filter((name) => name && name !== "linkProgram")
      .slice(0, 6)
      .join(" < ");
  proto.attachShader = function (program, shader) {
    if (shaders.get(shader)?.includes("gl_FragColor") || shaders.get(shader)?.includes("#define SHADER_TYPE")) {
      const info = linked.get(program) ?? {};
      info.source = (info.source ?? "") + shaders.get(shader);
      linked.set(program, info);
    }
    return attachShader.call(this, program, shader);
  };
  proto.linkProgram = function (program) {
    const info = linked.get(program) ?? {};
    const source = info.source ?? "";
    info.name = describe(source);
    delete info.source;
    info.at = performance.now();
    linked.set(program, info);
    // A program like one linked before: the lines that differ say what made three build it again.
    const lines = new Set(source.split("\n"));
    const twin = sources.findLast((each) => each.name === info.name);
    const differs = twin ? [...[...lines].filter((line) => !twin.lines.has(line)).map((line) => `+${line}`), ...[...twin.lines].filter((line) => !lines.has(line)).map((line) => `-${line}`)] : [];
    sources.push({ name: info.name, lines });
    log.push({ at: info.at, what: `link ${info.name}, by ${caller()}${differs.length > 0 ? `; unlike the last such: ${differs.slice(0, 4).join(" ").slice(0, 200)}` : twin ? "; the same source as one linked before" : ""}` });
    return linkProgram.call(this, program);
  };
  for (const method of ["getProgramParameter", "getProgramInfoLog", "getShaderInfoLog", "getShaderParameter", "getActiveUniform", "getUniformLocation", "getActiveAttrib", "getAttribLocation", "useProgram", "drawElements", "drawArrays"]) {
    const original = proto[method];
    proto[method] = function (...args) {
      const start = performance.now();
      const result = original.apply(this, args);
      const ms = performance.now() - start;
      if (ms > 10) {
        const info = args[0] instanceof WebGLProgram ? linked.get(args[0]) : null;
        log.push({ at: start, what: `blocked ${Math.round(ms)} ms in ${method}${info ? ` on ${info.name}, linked ${Math.round(start - info.at)} ms before` : ""}` });
      }
      return result;
    };
  }
}

const quantile = (values, q) => {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
};
const median = (values) => quantile(values, 0.5);
const round = (value) => Math.round(value);

/** Frame gaps within a span, and how many ran long. */
function frameStats(frames, from, to) {
  const gaps = [];
  for (let i = 1; i < frames.length; i++) if (frames[i - 1] >= from && frames[i] <= to) gaps.push(frames[i] - frames[i - 1]);
  return { count: gaps.length, median: median(gaps), p95: quantile(gaps, 0.95), max: Math.max(...gaps), over50: gaps.filter((gap) => gap > 50).length, jank: gaps.reduce((sum, gap) => sum + Math.max(0, gap - 1000 / 60), 0), fps: gaps.length / ((to - from) / 1000) };
}

/** Self time per function in a CPU profile, over its whole span. */
function topFunctions(profile, count = 25) {
  const self = new Map();
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  const deltas = profile.timeDeltas;
  profile.samples.forEach((id, i) => {
    const node = byId.get(id);
    const { functionName, url, lineNumber } = node.callFrame;
    const key = `${functionName || "(anonymous)"} ${url.split("/").pop()}:${lineNumber + 1}`;
    self.set(key, (self.get(key) ?? 0) + (deltas[i + 1] ?? 0) / 1000);
  });
  return [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, count);
}

/** Each sample's time on the page's clock, from the marker's samples. */
function sampleTimes(profile, markerAt) {
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  const times = [];
  let t = profile.startTime;
  for (let i = 0; i < profile.samples.length; i++) {
    t += profile.timeDeltas[i];
    times.push(t);
  }
  const first = profile.samples.findIndex((id) => byId.get(id).callFrame.functionName === "perfClockMarker");
  if (first === -1) return null;
  const offset = times[first] / 1000 - markerAt;
  return times.map((time) => time / 1000 - offset);
}

/** What the main thread did in a span: self time by function, with its caller's and grand-caller's names. */
function spanFunctions(profile, times, from, to, count = 6) {
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  const parent = new Map();
  for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id);
  const self = new Map();
  profile.samples.forEach((id, i) => {
    if (times[i] < from || times[i] > to) return;
    const chain = [];
    for (let at = id; at !== undefined && chain.length < DEPTH; at = parent.get(at)) chain.push(byId.get(at).callFrame.functionName || "anon");
    const key = chain.join(" < ");
    self.set(key, (self.get(key) ?? 0) + (profile.timeDeltas[i + 1] ?? 0) / 1000);
  });
  return [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, count);
}

/** Total time per function including what it calls, for the named functions. */
function inclusive(profile, names) {
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  const parent = new Map();
  for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id);
  const totals = Object.fromEntries(names.map((name) => [name, 0]));
  profile.samples.forEach((id, i) => {
    const seen = new Set();
    for (let at = id; at !== undefined; at = parent.get(at)) {
      const name = byId.get(at).callFrame.functionName;
      if (name in totals && !seen.has(name)) {
        seen.add(name);
        totals[name] += (profile.timeDeltas[i + 1] ?? 0) / 1000;
      }
    }
  });
  return totals;
}

const results = [];
for (let run = 0; run < RUNS; run++) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  if (CORES !== null) await context.addInitScript((cores) => Object.defineProperty(Navigator.prototype, "hardwareConcurrency", { get: () => cores }), Number(CORES));
  await context.addInitScript(watch);
  if (SHADERS) await context.addInitScript(watchShaders);
  const page = await context.newPage();
  page.on("pageerror", (error) => {
    console.error(error);
    process.exit(1);
  });
  let cdp = null;
  if (PROFILE) {
    cdp = await context.newCDPSession(page);
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
    await cdp.send("Profiler.start");
  }
  if (TRACE) await browser.startTracing(page, { path: TRACE, categories: ["toplevel", "gpu", "gpu.service", "disabled-by-default-gpu.service", "disabled-by-default-devtools.timeline", "v8", "blink"] });
  await page.goto(`${BASE}?${QUERY}`, { waitUntil: "commit" });
  await page.waitForFunction(() => window.__startupPerf?.readyAt !== null && window.__startupPerf?.readyAt !== undefined, null, { timeout: 120_000, polling: "raf" });
  if (TRACE) await browser.stopTracing();
  let profile = null;
  await page.waitForFunction(() => window.__startupPerf?.done === true, null, { timeout: 240_000, polling: "raf" });
  if (cdp) profile = (await cdp.send("Profiler.stop")).profile;
  // A re-bake on a lit house, as discovering a room does in play: the steady-state case of baking while the player plays.
  let rebakeProfile = null;
  if (cdp) await cdp.send("Profiler.start");
  const rebake = await page.evaluate(async (room) => {
    window.__startupPerf.rebakeMarkerAt = performance.now();
    window.__perfClockMarker();
    const from = performance.now();
    const result = await window.__betrayalHouse.rebake(room);
    const direct = performance.now();
    const bounce = result.bounce ? await result.bounce : null;
    const to = performance.now();
    window.__startupPerf.stop = true;
    return { from, direct, to, bounce };
  }, REBAKE);
  if (cdp) rebakeProfile = (await cdp.send("Profiler.stop")).profile;
  const record = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const marks = performance.getEntriesByType("measure").map((entry) => ({ name: entry.name, start: entry.startTime, ms: entry.duration }));
    return { shaderLog: window.__shaderLog ?? [], ...window.__startupPerf, nav: { responseEnd: nav.responseEnd, domContentLoaded: nav.domContentLoadedEventEnd, load: nav.loadEventEnd }, marks, lanes: navigator.hardwareConcurrency };
  });
  const bakeStart = record.bakes.find((entry) => entry.state !== "idle")?.at ?? record.readyAt;
  const bake = frameStats(record.frames, bakeStart, record.fullyLitAt);
  // The first frame drawn after the one that mounted the house: from here the bake runs while the house is on screen.
  const afterMount = record.frames.find((at) => at > record.hookAt) ?? record.hookAt;
  const shown = frameStats(record.frames, afterMount, record.fullyLitAt);
  const building = frameStats(record.frames, bakeStart, record.readyAt);
  // Every frame from the one that mounted the house to fully lit, the mount's own included.
  const load = frameStats(record.frames, record.hookAt, record.fullyLitAt);
  // From the last frame before the re-bake was asked for: the task that asks for it is part of it, and starts before it can read the clock.
  const rebakeFrom = record.frames.findLast((at) => at <= rebake.from) ?? rebake.from;
  const again = frameStats(record.frames, rebakeFrom, rebake.to);
  const longInRebake = record.longTasks.filter((task) => task.start + task.ms > rebakeFrom && task.start < rebake.to);
  const longBeforeReady = record.longTasks.filter((task) => task.start < record.readyAt);
  const longInBake = record.longTasks.filter((task) => task.start >= record.readyAt && task.start < record.fullyLitAt);
  const summary = {
    hook: round(record.hookAt),
    firstFrame: round(afterMount),
    firstRoom: round(record.firstRoomAt),
    loadOver50: load.over50,
    loadMaxFrame: round(load.max),
    ready: round(record.readyAt),
    fullyLit: round(record.fullyLitAt),
    dcl: round(record.nav.domContentLoaded),
    longBeforeReadyMs: round(longBeforeReady.reduce((sum, task) => sum + task.ms, 0)),
    longestBeforeReady: round(Math.max(0, ...longBeforeReady.map((task) => task.ms))),
    bakeStart: round(bakeStart),
    framesBeforeReady: building.count,
    maxFrameBeforeReady: round(building.max),
    mountFrameMs: round(afterMount - record.hookAt),
    shownOver50: shown.over50,
    shownMax: round(shown.max),
    shownJankMs: round(shown.jank),
    bakeFps: Math.round(bake.fps),
    bakeFrameP50: round(bake.median),
    bakeFrameP95: round(bake.p95),
    bakeFrameMax: round(bake.max),
    bakeFramesOver50: bake.over50,
    longInBake: longInBake.length,
    longInBakeMs: round(longInBake.reduce((sum, task) => sum + task.ms, 0)),
    rebakeDirectMs: round(rebake.direct - rebake.from),
    rebakeMs: round(rebake.to - rebake.from),
    rebakeFps: Math.round(again.fps),
    rebakeFrameP95: round(again.p95),
    rebakeFrameMax: round(again.max),
    rebakeOver50: again.over50,
    rebakeJankMs: round(again.jank),
    rebakeLongMs: round(longInRebake.reduce((sum, task) => sum + task.ms, 0)),
  };
  results.push(summary);
  console.log(`run ${run + 1}:`, JSON.stringify(summary));
  if (record.marks.length > 0) for (const mark of record.marks) console.log(`  ${mark.name.padEnd(36)} at ${round(mark.start)} for ${mark.ms.toFixed(1)} ms`);
  if (TIMELINE) {
    for (const [each, markerAt] of [[profile, record.markerAt], [rebakeProfile, record.rebakeMarkerAt]]) {
      const times = each && sampleTimes(each, markerAt);
      if (!times) continue;
      for (const task of record.longTasks.filter((one) => one.ms > 60 && one.start + one.ms >= times[0] && one.start <= times.at(-1))) {
        console.log(`  long task at ${round(task.start)}, ${round(task.ms)} ms:`);
        for (const [name, ms] of spanFunctions(each, times, task.start, task.start + task.ms)) console.log(`    ${ms.toFixed(0).padStart(6)}  ${name}`);
      }
    }
  }
  if (TIMELINE) {
    const events = [
      ...record.bakes.map((entry) => ({ at: entry.at, what: `bake ${entry.state}` })),
      ...record.longTasks.map((task) => ({ at: task.start, what: `long task ${round(task.ms)} ms` })),
      { at: record.hookAt, what: "hook" },
      ...record.shaderLog,
      { at: record.readyAt, what: "READY" },
      { at: record.fullyLitAt, what: "FULLY LIT" },
      { at: rebakeFrom, what: "rebake window opens (last frame before it)" },
      { at: rebake.from, what: "rebake start" },
      { at: rebake.direct, what: "rebake direct in" },
      { at: rebake.to, what: "rebake done" },
    ];
    for (let i = 1; i < record.frames.length; i++) if (record.frames[i] - record.frames[i - 1] > 50) events.push({ at: record.frames[i - 1], what: `frame gap ${round(record.frames[i] - record.frames[i - 1])} ms` });
    for (const event of events.sort((a, b) => a.at - b.at)) console.log(`  ${String(round(event.at)).padStart(6)}  ${event.what}`);
  }
  const names = (flag("fns") ?? "buildHouse,buildRoom,freezeRoom,placement,bakeScene,occluders,roomSamples,bounceSamples,litRoom,place,render,compile,texturesUnder,createHouseDemo,show,advance,pump,publish").split(",");
  for (const [label, each] of [["to fully lit", profile], ["during the re-bake", rebakeProfile]]) {
    if (!each) continue;
    console.log(`  top self time ${label} (ms):`);
    for (const [name, ms] of topFunctions(each)) console.log(`    ${ms.toFixed(0).padStart(6)}  ${name}`);
    console.log("  inclusive (ms):", JSON.stringify(Object.fromEntries(Object.entries(inclusive(each, names)).map(([k, v]) => [k, round(v)]))));
    if (CHAIN) {
      const all = spanFunctions(each, each.samples.map(() => 0), 0, 0, 400).filter(([name]) => name.startsWith(CHAIN));
      for (const [name, ms] of all.slice(0, 8)) console.log(`    ${ms.toFixed(0).padStart(6)}  ${name}`);
    }
  }
  await context.close();
}

const keys = Object.keys(results[0]);
console.log("\nmedian [min–max] over", results.length, "runs:");
for (const key of keys) {
  const values = results.map((result) => result[key]);
  console.log(`  ${key.padEnd(20)} ${median(values)}  [${Math.min(...values)}–${Math.max(...values)}]`);
}
await browser.close();
