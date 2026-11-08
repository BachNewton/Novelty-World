// What starting the game costs, counted: a cold page on the tool's clock, every request it makes (bytes as served, by
// what the file is), the shader modules and pipelines compiled, and the frames drawn, each read at every step of the
// start: the page's load event, the game's script running, each count the start bar shows, the drive starting and the
// map ready. Requests, bytes, modules and pipelines are the same on every run; the ticks each step took are this
// machine's and are printed as context only (the repo's speed rule).
//
// Prereq: a dev server. Usage:
//   node src/projects/aland-drive/tools/load-count.mjs [--folder=<tiles>] [--size=1720x720] [--top=20]
// A dev server serves the page's scripts unminified and uncompressed, so their bytes are the dev build's, not what a
// player downloads; the tiles' bytes are what a player downloads. ALAND_DRIVE_URL overrides the page's address.

import { openGame } from "./game-page.mjs";
import { serveTiles } from "./serve-tiles.mjs";
import { watchDevice } from "./device-watch.mjs";

const option = (name, otherwise) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? otherwise;
const [WIDTH, HEIGHT] = option("size", "1720x720").split("x").map(Number);
const FOLDER = option("folder", "src/projects/aland-drive/.data/tiles");
const TOP = Number(option("top", "20"));
const PAGE = process.env.ALAND_DRIVE_URL ?? "http://localhost:3001/games/3d-games/aland-drive";
const CLOCK = Date.parse("2026-06-21T10:00:00Z");
/** Frames the drive is watched for after the map is ready, for what still arrives. */
const AFTER_FRAMES = 60;

const tiles = await serveTiles(FOLDER);
const requests = [];
const opened = await openGame(`${PAGE}?tiles=local:${tiles.port}&hour=11`, {
  width: WIDTH,
  height: HEIGHT,
  clock: CLOCK,
  init: watchDevice,
  cleanup: () => tiles.server.close(),
  // Ready as soon as the page has loaded: the steps after are watched from here.
  ready: () => document.readyState === "complete",
});
const { page, step, tick, ticks, close } = opened;
const tileHost = `localhost:${tiles.port}`;
// A response's size as served, from its header; a response that names none (a dev server's chunk) is read for its length.
page.on("requestfinished", (request) => {
  const tick = ticks();
  void (async () => {
    const response = await request.response();
    const named = Number(response?.headers()["content-length"]);
    const bytes = Number.isFinite(named) && named >= 0 ? named : ((await response?.body().catch(() => null))?.length ?? 0);
    const url = new URL(request.url());
    requests.push({ url, bytes, type: request.resourceType(), tick, tile: url.host === tileHost });
  })();
});

/** What the page shows and has done, read at a tick. */
const stateNow = () =>
  page.evaluate(() => {
    const bar = document.querySelector('[role="progressbar"]');
    const probe = window.__alandDrive;
    const shaders = window.__shaderCount;
    return {
      bar: bar ? `${bar.getAttribute("aria-valuenow")} of ${bar.getAttribute("aria-valuemax")}` : null,
      game: probe !== undefined,
      frames: probe?.frames() ?? 0,
      mapReady: probe?.mapReady() === true,
      modules: shaders?.modules.length ?? 0,
      pipelines: shaders?.pipelines.length ?? 0,
    };
  });

const steps = [];
const note = (name, state) => {
  const bytes = requests.reduce((sum, request) => sum + request.bytes, 0);
  steps.push({ name, tick: ticks(), frames: state.frames, requests: requests.length, bytes, modules: state.modules, pipelines: state.pipelines });
};

await step("the start", async () => {
  let last = await stateNow();
  note("page loaded", last);
  let afterReady = 0;
  while (afterReady < AFTER_FRAMES) {
    await tick();
    const now = await stateNow();
    if (now.game && !last.game) note("game script running", now);
    if (now.bar !== last.bar && now.bar !== null) note(`start bar ${now.bar}`, now);
    if (now.bar === null && last.bar !== null) note("start bar gone", now);
    if (now.mapReady && !last.mapReady) note("map ready", now);
    if (now.mapReady) afterReady++;
    last = now;
  }
  note(`${AFTER_FRAMES} frames after the map is ready`, last);
});

const mb = (bytes) => (bytes / 1e6).toFixed(2);
console.log(`${"tick".padStart(6)} ${"frames".padStart(6)} ${"requests".padStart(8)} ${"MB".padStart(7)} ${"modules".padStart(7)} ${"pipelines".padStart(9)}  step`);
for (const entry of steps) console.log(`${String(entry.tick).padStart(6)} ${String(entry.frames).padStart(6)} ${String(entry.requests).padStart(8)} ${mb(entry.bytes).padStart(7)} ${String(entry.modules).padStart(7)} ${String(entry.pipelines).padStart(9)}  ${entry.name}`);

/** A request's kind: a tile file by its name with the tile's own folder dropped, or the page's resource type. */
const kindOf = (request) => {
  if (!request.tile) return request.type === "script" ? "page script" : request.type === "document" ? "page" : `page ${request.type}`;
  const parts = request.url.pathname.split("/").filter(Boolean);
  const file = parts[parts.length - 1] ?? "";
  return `tile ${parts.length > 2 ? file : parts.slice(1).join("/")}`;
};
const byKind = new Map();
for (const request of requests) {
  const kind = kindOf(request);
  const entry = byKind.get(kind) ?? { requests: 0, bytes: 0 };
  entry.requests++;
  entry.bytes += request.bytes;
  byKind.set(kind, entry);
}
console.log(`\nby kind:  ${"requests".padStart(8)} ${"MB".padStart(7)}  kind`);
for (const [kind, entry] of [...byKind].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, TOP)) console.log(`          ${String(entry.requests).padStart(8)} ${mb(entry.bytes).padStart(7)}  ${kind}`);
const served = tiles.counts();
console.log(`\nthe tile server sent ${mb(served.served)} MB in ${served.requests} requests`);
const problems = opened.reported();
if (problems) console.log(`\nThe page reported:\n${problems}`);
await close();
