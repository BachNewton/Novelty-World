// What a frame costs the main thread, counted (the repo's speed rule): at each showcase view, or at looks of one's own,
// held still, every function the frame calls and how many times, and the bytes the frame allocates. The counts come
// from V8 itself: its precise coverage keeps an invocation count per function, exact only in code its optimising tiers
// haven't compiled (optimised code doesn't count its calls), so the calls are counted in a browser with the tiers off.
// Allocation is the heap's growth over one frame after a full collection, in a browser with the tiers on, since the
// interpreter boxes every number and would allocate what the game never does; the sites that allocate are sampled
// (V8's sampling heap profiler, every 256 bytes). Both are the same on every run, whatever the machine is doing.
//
// Prereq: a dev server. Usage:
//   node src/projects/aland-drive/tools/frame-cpu.mjs [--keys=1,2,...,0] [--folder=<tiles>] [--size=1720x720]
//     [--pass=calls,bytes] [--free] [--frames=8] [--top=30] [--modules=20] [--sites=20] [--save=<file.json>] [--against=<file.json>]
//     [--hour=11] [name:east,north,height,yaw,pitch ...]
// Each view is measured held (the simulation stopped, so a frame is the render side alone); --free measures it again
// with the car at rest and the simulation running, where the steps and the traffic count too. --save keeps the run as
// JSON and --against prints each view's change from a saved run. Positions are ETRS-TM35FIN metres, as `tools/look.mjs`
// takes them. ALAND_DRIVE_URL overrides the page's address.

/* eslint-disable security/detect-non-literal-fs-filename -- a localhost tool reading and writing the files it was told to */
import { readFileSync, writeFileSync } from "node:fs";
import { openGame } from "./game-page.mjs";
import { serveTiles } from "./serve-tiles.mjs";

const option = (name, otherwise) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? otherwise;
const flag = (name) => process.argv.includes(`--${name}`);
const [WIDTH, HEIGHT] = option("size", "1720x720").split("x").map(Number);
const KEYS = option("keys", "1,2,3,4,5,6,7,8,9,0").split(",").filter(Boolean);
const FOLDER = option("folder", "src/projects/aland-drive/.data/tiles");
const PASSES = option("pass", "calls,bytes").split(",");
const FREE = flag("free");
const FRAMES = Number(option("frames", "8"));
const TOP = Number(option("top", "30"));
const MODULES = Number(option("modules", "20"));
const SITES = Number(option("sites", "20"));
const SAVE = option("save", "");
const AGAINST = option("against", "");
const HOUR = Number(option("hour", "11"));
/** The clock the page starts on, and the boats' clock: one moment, so every run sees the same world. */
const CLOCK = Date.parse("2026-06-21T10:00:00Z");
const SETTLE_FRAMES = 30;
const SAMPLING_BYTES = 256;
const PAGE = process.env.ALAND_DRIVE_URL ?? "http://localhost:3001/games/3d-games/aland-drive";
// A young generation no frame fills, so no collection runs inside a measured frame and the heap's growth is the frame's allocation.
const HEAP_FLAGS = "--min-semi-space-size=64 --max-semi-space-size=64";
const TIERS_OFF = "--no-opt --no-maglev --no-sparkplug";
const LOOKS = process.argv.slice(2).filter((arg) => !arg.startsWith("--")).map((look) => {
  const [name, place] = look.split(":");
  const [east, north, height, yaw, pitch] = place.split(",").map(Number);
  return { name, at: { east, north, height, yaw, pitch } };
});

/**
 * The kinds of work a frame does that matter on their own, by the function that does each (three's names). Where a
 * name is a chain of same-named methods (a backend's `updateBinding` calling its base's), the most-called one counts.
 */
const HEADLINES = [
  ["objects visited", "_projectObject", "three.webgpu.js"],
  ["render objects prepared", "_renderObjectDirect", "three.webgpu.js"],
  ["draws issued", "_draw", "three.webgpu.js"],
  ["world matrices", "updateMatrixWorld", "three.core.js"],
  ["local matrices composed", "compose", "three.core.js"],
  ["frustum tests", "intersectsObject", "three.core.js"],
  ["bind groups checked", "_update", "three.webgpu.js"],
  ["uniform buffers written", "updateBinding", "three.webgpu.js"],
  ["uniforms compared", "updateByType", "three.webgpu.js"],
  ["nodes updated", "updateNode", "three.webgpu.js"],
  ["cache keys hashed", "cyrb53", "three.webgpu.js"],
  ["sim steps", "step", "sim/drive.ts"],
];
/** The dev bundle reads every imported binding through a getter it makes, `()=>name`: the bundle's calls, not the game's. */
const EXPORT_GETTER = /^\(\)=>[\w$]+(?=[,\s\]])/;

const count = (n) => (n === null || n === undefined ? "-" : Math.round(n).toLocaleString("en-US"));
const change = (was, now) => {
  if (was === undefined || was === null || now === null || now === undefined) return "";
  const delta = now - was;
  return `${delta >= 0 ? "+" : ""}${count(delta)}${was !== 0 ? ` (${delta >= 0 ? "+" : ""}${((delta / was) * 100).toFixed(1)}%)` : ""}`;
};

/** A module's name as the game knows it: the path under src, or a package's file. */
const moduleName = (header) => {
  const path = header.replace(/^\[project\]\//, "").replace(/ \[.*$/, "");
  const underSrc = path.indexOf("src/");
  if (underSrc !== -1) return path.slice(underSrc + 4).replace(/^projects\/aland-drive\//, "");
  const inModules = path.lastIndexOf("node_modules/");
  return inModules !== -1 ? path.slice(inModules + 13).split("/").pop() : path;
};

/** Each script's modules by where they start, and its line starts, so an offset or a line finds its module. */
class Scripts {
  constructor() {
    this.byUrl = new Map();
  }
  async of(url) {
    if (!url) return null;
    if (!this.byUrl.has(url)) this.byUrl.set(url, this.read(url));
    return this.byUrl.get(url);
  }
  async read(url) {
    const source = await (await fetch(url)).text();
    const modules = [...source.matchAll(/^"(\[project\][^"]+)", \(/gm)].map((found) => ({ at: found.index, name: moduleName(found[1]) }));
    const lines = [0];
    for (let at = source.indexOf("\n"); at !== -1; at = source.indexOf("\n", at + 1)) lines.push(at + 1);
    return { modules, lines, source, file: url.split("/").pop() };
  }
  /** The binding an export getter at this offset reads, or null where the function is the module's own. */
  static exportGetterAt(script, offset) {
    const found = script ? EXPORT_GETTER.exec(script.source.slice(offset, offset + 80)) : null;
    return found ? found[0].slice(4) : null;
  }
  static moduleAt(script, offset) {
    if (!script) return "(page)";
    let low = 0;
    let high = script.modules.length - 1;
    if (high < 0 || offset < script.modules[0].at) return script.file;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (script.modules[mid].at <= offset) low = mid;
      else high = mid - 1;
    }
    return script.modules[low].name;
  }
  static lineOf(script, offset) {
    if (!script) return 0;
    let low = 0;
    let high = script.lines.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (script.lines[mid] <= offset) low = mid;
      else high = mid - 1;
    }
    return low + 1;
  }
  static offsetOf(script, line, column) {
    return script ? (script.lines[line] ?? 0) + column : 0;
  }
}

const tiles = await serveTiles(FOLDER);
const scripts = new Scripts();
const views = [...KEYS.map((key) => ({ name: `view-${key}`, key })), ...LOOKS];
const run = { size: `${WIDTH}x${HEIGHT}`, hour: HOUR, frames: FRAMES, views: {} };
for (const view of views) run.views[view.name] = { held: {}, free: FREE ? {} : undefined };
const before = AGAINST ? JSON.parse(readFileSync(AGAINST, "utf8")) : null;

/** Opens the game on the tool's clock, with the flags a pass needs, and puts it at each view in turn. */
async function eachView(pass, flags, atView) {
  const opened = await openGame(`${PAGE}?tiles=local:${tiles.port}&hour=${HOUR}`, {
    width: WIDTH,
    height: HEIGHT,
    ready: () => window.__alandDrive?.mapReady() === true,
    clock: CLOCK,
    args: [`--js-flags=${flags}`],
  });
  const { page, step, tick, close } = opened;
  const cdp = await page.context().newCDPSession(page);
  const tickUntil = async (done) => {
    while (!(await page.evaluate(done))) await tick();
    while ((await page.evaluate(() => window.__alandDrive.stream().loading)) > 0) await tick();
  };
  for (const view of views) {
    await step(`${pass}: ${view.name}`, async () => {
      await page.evaluate(
        ({ seaSeconds, hour, key, at }) => {
          const probe = window.__alandDrive;
          probe.hold(true);
          probe.holdSea(seaSeconds);
          probe.setDay({ hour, held: true });
          window.__frameCpuDone = false;
          if (key !== undefined) {
            void probe.jumpTo(key).then(() => {
              window.__frameCpuDone = true;
            });
          } else {
            probe.look(at);
            window.__frameCpuDone = true;
          }
        },
        { seaSeconds: CLOCK / 1000, hour: HOUR, key: view.key, at: view.at },
      );
      await tickUntil(() => window.__frameCpuDone === true);
      await tick(SETTLE_FRAMES);
      await atView(view, "held", { page, cdp, tick });
      if (FREE) {
        await page.evaluate(() => window.__alandDrive.hold(false));
        await tick(SETTLE_FRAMES);
        await atView(view, "free", { page, cdp, tick });
        await page.evaluate(() => window.__alandDrive.hold(true));
      }
    });
  }
  const problems = opened.reported();
  if (problems) console.log(`\nThe page reported (${pass}):\n${problems}`);
  await close();
}

/** The calls of one frame, by function, from V8's invocation counts: taking them resets them, so each take is the calls since the last. */
async function countCalls({ cdp, tick }) {
  const take = async () => {
    const { result } = await cdp.send("Profiler.takePreciseCoverage");
    const calls = new Map();
    for (const script of result) {
      for (const fn of script.functions) {
        const range = fn.ranges[0];
        if (range.count > 0) calls.set(`${script.scriptId}|${range.startOffset}`, { url: script.url, name: fn.functionName, offset: range.startOffset, calls: range.count });
      }
    }
    return calls;
  };
  await take();
  const frames = [];
  for (let frame = 0; frame < FRAMES; frame++) {
    await tick();
    frames.push(await take());
  }
  // Frames differ where something asynchronous landed in one of them: the frame most frames agree with is the frame's.
  const totals = frames.map((calls) => [...calls.values()].reduce((sum, fn) => sum + fn.calls, 0));
  const sorted = [...totals].sort((x, y) => x - y);
  const median = sorted[Math.floor(sorted.length / 2)];
  const typical = frames[totals.indexOf(median)];
  const functions = [];
  let getters = 0;
  for (const fn of typical.values()) {
    const script = await scripts.of(fn.url);
    const binding = Scripts.exportGetterAt(script, fn.offset);
    if (binding !== null) {
      getters += fn.calls;
      continue;
    }
    functions.push({ name: fn.name || "(anonymous)", module: Scripts.moduleAt(script, fn.offset), line: Scripts.lineOf(script, fn.offset), calls: fn.calls });
  }
  functions.sort((x, y) => y.calls - x.calls);
  return { calls: median - getters, getters, functions, callsSpread: [sorted[0] - getters, sorted[sorted.length - 1] - getters] };
}

/** The bytes one frame allocates: the heap's growth over a tick after a full collection, and the sites, sampled. */
async function countBytes({ cdp, tick }) {
  const usage = async () => cdp.send("Runtime.getHeapUsage");
  const grown = [];
  for (let frame = 0; frame < FRAMES; frame++) {
    await cdp.send("HeapProfiler.collectGarbage");
    const was = await usage();
    await tick();
    const now = await usage();
    grown.push({ heap: now.usedSize - was.usedSize, external: (now.backingStorageSize ?? 0) - (was.backingStorageSize ?? 0) });
  }
  const heaps = grown.map((g) => g.heap).sort((x, y) => x - y);
  const externals = grown.map((g) => g.external).sort((x, y) => x - y);
  await cdp.send("HeapProfiler.enable");
  await cdp.send("HeapProfiler.collectGarbage");
  await cdp.send("HeapProfiler.startSampling", { samplingInterval: SAMPLING_BYTES, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  await tick();
  const { profile } = await cdp.send("HeapProfiler.stopSampling");
  const sites = new Map();
  const placeOf = async ({ functionName, url, lineNumber, columnNumber }) => {
    const script = await scripts.of(url);
    const offset = Scripts.offsetOf(script, lineNumber, columnNumber);
    return `${functionName || "(anonymous)"} ${Scripts.moduleAt(script, offset)}:${lineNumber + 1}`;
  };
  // A native site (an iterator's results, a builtin's numbers) is told by the game function that called it.
  const walk = async (node, caller) => {
    const own = node.callFrame.url !== "";
    if (node.selfSize > 0) {
      const label = own ? await placeOf(node.callFrame) : `${node.callFrame.functionName || "(native)"} (native) in ${caller}`;
      sites.set(label, (sites.get(label) ?? 0) + node.selfSize);
    }
    const next = own ? await placeOf(node.callFrame) : caller;
    for (const child of node.children) await walk(child, next);
  };
  await walk(profile.head, "(idle)");
  return {
    bytes: heaps[Math.floor(heaps.length / 2)],
    bytesSpread: [heaps[0], heaps[heaps.length - 1]],
    external: externals[Math.floor(externals.length / 2)],
    sites: [...sites].map(([site, bytes]) => ({ site, bytes })).sort((x, y) => y.bytes - x.bytes),
  };
}

if (PASSES.includes("calls")) {
  let enabled = false;
  await eachView("calls", TIERS_OFF, async (view, mode, context) => {
    if (!enabled) {
      await context.cdp.send("Profiler.enable");
      await context.cdp.send("Profiler.startPreciseCoverage", { callCount: true, detailed: false, allowTriggeredUpdates: false });
      enabled = true;
    }
    Object.assign(run.views[view.name][mode], await countCalls(context));
  });
}
if (PASSES.includes("bytes")) {
  await eachView("bytes", HEAP_FLAGS, async (view, mode, context) => {
    Object.assign(run.views[view.name][mode], await countBytes(context));
  });
}
tiles.server.close();

const headlineOf = (functions, name, module) => functions.filter((fn) => fn.name === name && fn.module === module).reduce((most, fn) => Math.max(most, fn.calls), 0);
const ranged = (spread) => (spread && spread[0] !== spread[1] ? `  (frames ranged ${count(spread[0])} to ${count(spread[1])})` : "");
for (const view of views) {
  for (const mode of FREE ? ["held", "free"] : ["held"]) {
    const result = run.views[view.name][mode];
    const was = before?.views?.[view.name]?.[mode];
    const line = (label, value, previous) => `  ${label.padEnd(26)} ${count(value).padStart(12)}${was ? `  ${change(previous, value)}` : ""}`;
    console.log(`\n${view.name}${mode === "free" ? " (free: the simulation running)" : " (held)"}`);
    if (result.functions) {
      console.log(line("calls a frame", result.calls, was?.calls) + ranged(result.callsSpread));
      console.log(line("functions called", result.functions.length, was?.functions?.length));
      console.log(line("export getters besides", result.getters, was?.getters) + "  (the dev bundle's own, left out above)");
      for (const [label, name, module] of HEADLINES) {
        const value = headlineOf(result.functions, name, module);
        const previous = was ? headlineOf(was.functions ?? [], name, module) : undefined;
        if (value > 0 || (previous ?? 0) > 0) console.log(line(label, value, previous));
      }
    }
    if (result.bytes !== undefined) {
      console.log(line("bytes allocated", result.bytes, was?.bytes) + ranged(result.bytesSpread));
      if (result.external) console.log(line("external bytes besides", result.external, was?.external) + "  (buffers outside the heap, context only)");
    }
    if (result.functions) {
      const byModule = new Map();
      for (const fn of result.functions) byModule.set(fn.module, (byModule.get(fn.module) ?? 0) + fn.calls);
      const wasByModule = new Map();
      for (const fn of was?.functions ?? []) wasByModule.set(fn.module, (wasByModule.get(fn.module) ?? 0) + fn.calls);
      console.log(`  by module:        ${"calls".padStart(9)}  module`);
      for (const [module, calls] of [...byModule].sort((x, y) => y[1] - x[1]).slice(0, MODULES)) console.log(`  ${"".padEnd(16)}  ${count(calls).padStart(9)}  ${module}${was ? `  ${change(wasByModule.get(module) ?? 0, calls)}` : ""}`);
      console.log(`  by function:      ${"calls".padStart(9)}  function  module:line`);
      for (const fn of result.functions.slice(0, TOP)) {
        const previous = was?.functions?.find((entry) => entry.name === fn.name && entry.module === fn.module && entry.line === fn.line);
        console.log(`  ${"".padEnd(16)}  ${count(fn.calls).padStart(9)}  ${fn.name}  ${fn.module}:${fn.line}${was ? `  ${change(previous?.calls ?? 0, fn.calls)}` : ""}`);
      }
    }
    if (result.sites) {
      console.log(`  allocating:       ${"bytes".padStart(9)}  site (sampled every ${SAMPLING_BYTES} bytes)`);
      for (const { site, bytes } of result.sites.slice(0, SITES)) {
        const previous = was?.sites?.find((entry) => entry.site === site);
        console.log(`  ${"".padEnd(16)}  ${count(bytes).padStart(9)}  ${site}${was ? `  ${change(previous?.bytes ?? 0, bytes)}` : ""}`);
      }
    }
  }
}

if (SAVE) {
  writeFileSync(SAVE, JSON.stringify(run, null, 1));
  console.log(`\nsaved ${SAVE}`);
}
