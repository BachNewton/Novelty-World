// Screenshots of rooms on the Betrayal art bench, for judging the art without a browser open.
//
// Drives the bench's control surface (window.__betrayalBench, see ../art/bench.ts) over Playwright and
// waits on its events (room built, textures decoded, camera settled, frames rendered), never a sleep.
//
// Prereq: dev server on :3001 (npm run dev) + `npx playwright install chromium` (one-time).
// Usage:  node src/projects/betrayal/tools/shots.mjs <room-id> [label] [--explorer=<id>] [--explorer-zoom=<z>] [--idle] [--compare=<room-id>] [--res=<short side>]
//         node src/projects/betrayal/tools/shots.mjs --all [label]
//         --every=<s> --frames=<n> --from=<s> set the idle strip's spacing, length and start (see IDLE_TIMES);
//         --strip-view=<n> shoots it from another view.
//
// One room writes to src/projects/betrayal/.shots/<label>/<room-id>/ (gitignored): view-0..3.png (desktop
// dollhouse views), phone.png (360×780 portrait), close-up.png, explorer.png (the explorer framed close),
// and contact-sheet.png combining them; props/<n>.png, every prop framed close at full resolution from the
// view that faces it, and close-ups.png combining them. --explorer picks who stands at the room's pawn spot
// (the bench's first explorer by default; `pawn` is the plain scale pawn). --idle also writes
// idle-strip.png: the explorer at a run of frozen times, to judge the idle animation. --explorer-zoom=0.5
// frames the explorer shots wider, for a figure bigger than a person. --compare=<room-id>
// also shoots that room the same way (views and close-up, same explorer, clock and resolution) and writes
// compare-<room-id>.png, the two side by side, to judge whether they look like one house.
//
// --all shoots view 0 of every bench room into .shots/<label>/rooms/: rooms.png, named, to ask whether every
// room looks like the same house, and rooms-blind.png, numbered in a shuffled order with the names in
// rooms-blind-key.txt, to ask whether each room can be told from the others without its name.
//
// --query=<params> adds to the bench's URL, for a setting the page reads from it, e.g. --query=name=value.
//
// The bench's clock is frozen at FREEZE_AT for every shot, so candle flicker and the explorer's idle
// stand still and two runs differ only where the art does.

import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const FLAGS = process.argv.slice(2).filter((arg) => arg.startsWith("--"));
const flag = (name) => FLAGS.find((f) => f.startsWith(`--${name}=`))?.slice(name.length + 3);
const ALL = FLAGS.includes("--all");
const POSITIONAL = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const [ROOM, LABEL = "latest"] = ALL ? [null, ...POSITIONAL] : POSITIONAL;
const EXPLORER = flag("explorer");
const COMPARE = flag("compare");
const IDLE = FLAGS.includes("--idle");
/** Zooms the explorer framing out (below 1) for a figure wider than a person: a big monster, or a line-up. */
const EXPLORER_ZOOM = Number(flag("explorer-zoom") ?? 1);
/** Draws the room at this short side in pixels instead of the bench's native default, e.g. --res=540. */
const RES = flag("res") === undefined ? null : Number(flag("res"));
/** More of the bench's query string, e.g. --query=name=value. */
const QUERY = flag("query");
const FREEZE_AT = 2;
/** Where the idle strip starts: at 0 by default, or --from=<s>. */
const FREEZE_AT_STRIP = Number(flag("from") ?? 0);
/** The idle strip's frozen times: by default every 1.5 s over 24 s, long enough to catch the occasional gestures.
 *  --every=<s> and --frames=<n> change the spacing and count: --every=0.04 --frames=16 shows a walk or run at
 *  real speed, a frame every 40 ms. */
const IDLE_EVERY = Number(flag("every") ?? 1.5);
/** The view the idle strip is shot from: --strip-view=1 sees a line-up side on, to judge a gait. */
const STRIP_VIEW = Number(flag("strip-view") ?? 0);
const IDLE_TIMES = Array.from({ length: Number(flag("frames") ?? 16) }, (_, i) => FREEZE_AT_STRIP + i * IDLE_EVERY);
if (!ROOM && !ALL) {
  console.error("usage: node src/projects/betrayal/tools/shots.mjs <room-id> [label] [--explorer=<id>] [--idle] [--compare=<room-id>]");
  console.error("       node src/projects/betrayal/tools/shots.mjs --all [label]");
  process.exit(1);
}
const SHOTS = join(HERE, "..", ".shots", LABEL);
const BASE = process.env.BETRAYAL_URL ?? "http://localhost:3001/board-games/betrayal";
const DESKTOP = { width: 1920, height: 1080 };
const PHONE = { width: 360, height: 780 };
/** The walls each preset view cuts away, so a prop hung on one of them hides in it. */
const VIEW_CUTS = [
  ["right", "bottom"],
  ["right", "top"],
  ["left", "top"],
  ["left", "bottom"],
];

function outdir(...parts) {
  const path = join(SHOTS, ...parts);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- dev-only tool writing under the project's own .shots folder
  mkdirSync(path, { recursive: true });
  return path;
}

// Real GPU through ANGLE/D3D11, as Shipwright's shots tool; SHOTS_CPU=1 falls back to SwiftShader.
const USE_GPU = process.env.SHOTS_CPU !== "1";
const browser = await chromium.launch({
  headless: true,
  args: USE_GPU
    ? ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"]
    : ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
// A room that throws while building never becomes ready, so without this the
// run would end in a bare timeout instead of the room's own error.
async function failOnPageError(room, error) {
  console.error(`The bench threw while showing "${room}":\n${error.stack ?? error.message}`);
  await browser.close();
  process.exit(1);
}

async function openBench(room, viewport) {
  const page = await browser.newPage({ viewport });
  page.on("pageerror", (error) => void failOnPageError(room, error));
  page.on("console", (m) => {
    if (m.type() === "error") console.error("page console error:", m.text());
  });
  await page.goto(`${BASE}?bench=${encodeURIComponent(room)}${QUERY ? `&${QUERY}` : ""}`, { waitUntil: "load" });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.waitForFunction(() => "__betrayalBench" in window, null, { timeout: 30000 });
  const known = await page.evaluate(() => window.__betrayalBench.rooms());
  if (!known.includes(room)) throw new Error(`The bench has no room "${room}"; it has: ${known.join(", ")}`);
  await page.evaluate(
    ({ explorer, frozenAt, res }) => {
      const bench = window.__betrayalBench;
      if (explorer) {
        if (!bench.explorers().includes(explorer)) {
          throw new Error(`The bench has no explorer "${explorer}"; it has: ${bench.explorers().join(", ")}`);
        }
        bench.setExplorer(explorer);
      }
      bench.freezeClock(frozenAt);
      if (res !== null) bench.setResolution(res);
    },
    { explorer: EXPLORER, frozenAt: FREEZE_AT, res: RES },
  );
  return page;
}

async function capture(page, path, { view = 0, zoom = 1, chrome = true, subject = "room", at = FREEZE_AT, clip } = {}) {
  await page.evaluate(
    ({ view, zoom, chrome, subject, at }) => {
      const bench = window.__betrayalBench;
      bench.setView(view);
      bench.setZoom(zoom);
      bench.setSubject(subject);
      bench.freezeClock(at);
      document.querySelectorAll(".pointer-events-none").forEach((el) => {
        el.style.visibility = chrome ? "" : "hidden";
      });
    },
    { view, zoom, chrome, subject, at },
  );
  await page.waitForFunction(() => window.__betrayalBench.isReady(), null, { timeout: 30000 });
  const frame = await page.evaluate(() => window.__betrayalBench.frameCount());
  await page.waitForFunction((n) => window.__betrayalBench.frameCount() >= n + 2, frame, { timeout: 10000 });
  await page.screenshot({ path, clip });
  console.log("wrote", path);
  return path;
}

/** The view that shows a prop best: from in front of it, among the views that don't cut a wall it hangs on. */
function viewFacing({ turn, walls }) {
  const facing = (turn * Math.PI) / 180;
  const open = [0, 1, 2, 3].filter((view) => !VIEW_CUTS[view].some((wall) => walls.includes(wall)));
  const towards = (view) => {
    const angle = ((45 + 90 * view) * Math.PI) / 180;
    return Math.sin(angle) * Math.sin(facing) + Math.cos(angle) * Math.cos(facing);
  };
  return open.sort((a, b) => towards(b) - towards(a))[0] ?? 0;
}

/** The desktop dollhouse views and the close-up of one room, into `dir`. */
async function shootViews(page, dir) {
  const shots = [];
  for (const view of [0, 1, 2, 3]) {
    shots.push({ name: `view ${view}`, path: await capture(page, join(dir, `view-${view}.png`), { view, chrome: false }) });
  }
  shots.push({ name: "close-up", path: await capture(page, join(dir, "close-up.png"), { view: 0, zoom: 2.4, chrome: false }) });
  return shots;
}

/** Every prop framed close, at full resolution, from the view that faces it. Leaves the page at full resolution. */
async function shootProps(page, dir) {
  const props = await page.evaluate(() => window.__betrayalBench.props());
  await page.evaluate(() => window.__betrayalBench.setResolution(null));
  const shots = [];
  for (const [i, prop] of props.entries()) {
    const path = join(dir, `${String(i).padStart(2, "0")}.png`);
    shots.push({ name: `${i}: ${prop.label}`, path: await capture(page, path, { view: viewFacing(prop), subject: { prop: i }, chrome: false }) });
  }
  return shots;
}

const dataUrl = (path) =>
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- reads back the screenshots this run just wrote
  `data:image/png;base64,${readFileSync(path).toString("base64")}`;
const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const cell = (shot, style = "") =>
  `<figure style="margin:0;${style}"><img src="${dataUrl(shot.path)}" style="width:100%;display:block;image-rendering:pixelated"><figcaption>${escape(shot.name)}</figcaption></figure>`;
const sheet = await browser.newPage({ viewport: { width: 2000, height: 200 } });
async function writeSheet(path, title, body) {
  await sheet.setContent(`<!doctype html><html><body style="margin:0;padding:16px;background:#111;color:#bbb;font:14px sans-serif">
<h1 style="margin:0 0 12px;font-size:18px">${escape(title)}</h1>
${body}</body></html>`);
  await sheet.waitForFunction(() => [...document.images].every((img) => img.complete && img.naturalWidth > 0));
  await sheet.screenshot({ path, fullPage: true });
  console.log("wrote", path);
}
const grid = (columns, shots, gap = 12) =>
  `<div style="display:grid;grid-template-columns:repeat(${columns},1fr);gap:${gap}px;align-items:start">${shots.map((shot) => cell(shot)).join("")}</div>`;

if (ALL) {
  const dir = outdir("rooms");
  const probe = await openBench("drawing-room", DESKTOP);
  const rooms = await probe.evaluate(() => window.__betrayalBench.rooms());
  await probe.close();
  const shots = [];
  for (const room of rooms) {
    const page = await openBench(room, DESKTOP);
    shots.push({ name: room, path: await capture(page, join(dir, `${room}.png`), { view: 0, chrome: false }) });
    await page.close();
  }
  await writeSheet(join(dir, "rooms.png"), `every room · ${LABEL}`, grid(4, shots));
  // A fixed shuffle of the label, so a rerun numbers the rooms the same way.
  let seed = [...LABEL].reduce((hash, ch) => (hash * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const shuffled = shots
    .map((shot) => {
      seed = (seed * 1103515245 + 12345) >>> 0;
      return { shot, order: seed };
    })
    .sort((a, b) => a.order - b.order)
    .map(({ shot }) => shot);
  await writeSheet(join(dir, "rooms-blind.png"), `which room is which? · ${LABEL}`, grid(4, shuffled.map((shot, i) => ({ ...shot, name: `${i + 1}` }))));
  const key = join(dir, "rooms-blind-key.txt");
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- dev-only tool writing under the project's own .shots folder
  writeFileSync(key, shuffled.map((shot, i) => `${i + 1}: ${shot.name}`).join("\n") + "\n");
  console.log("wrote", key);
  await browser.close();
  process.exit(0);
}

const OUTDIR = outdir(ROOM);
const desktop = await openBench(ROOM, DESKTOP);
const shots = await shootViews(desktop, OUTDIR);
shots.push({ name: "explorer", path: await capture(desktop, join(OUTDIR, "explorer.png"), { view: 0, zoom: EXPLORER_ZOOM, subject: "explorer", chrome: false }) });
const idle = [];
if (IDLE) {
  const clip = { x: (DESKTOP.width - 640) / 2, y: 0, width: 640, height: DESKTOP.height };
  for (const at of IDLE_TIMES) {
    const name = `idle-${at.toFixed(2)}s`;
    idle.push({ name, path: await capture(desktop, join(OUTDIR, `${name}.png`), { view: STRIP_VIEW, zoom: EXPLORER_ZOOM, subject: "explorer", chrome: false, at, clip }) });
  }
}
const props = await shootProps(desktop, outdir(ROOM, "props"));
await desktop.close();

const phone = await openBench(ROOM, PHONE);
const phoneShot = { name: "phone", path: await capture(phone, join(OUTDIR, "phone.png"), { view: 0 }) };
await phone.close();

await writeSheet(
  join(OUTDIR, "contact-sheet.png"),
  `${ROOM} · ${LABEL}`,
  `<div style="display:grid;grid-template-columns:1fr 1fr 1fr 230px;gap:12px;align-items:start">
${cell(shots[0])}${cell(shots[1])}${cell(shots[4])}
${cell(phoneShot, "grid-row:span 2")}
${cell(shots[2])}${cell(shots[3])}${cell(shots[5])}
</div>`,
);
await writeSheet(join(OUTDIR, "close-ups.png"), `${ROOM} · ${LABEL} · every prop, close`, grid(4, props));

if (IDLE) {
  await writeSheet(join(OUTDIR, "idle-strip.png"), `${ROOM} · ${LABEL} · idle, one frame every ${IDLE_EVERY} s`, grid(8, idle, 8));
}

if (COMPARE) {
  const page = await openBench(COMPARE, DESKTOP);
  const theirs = await shootViews(page, outdir(ROOM, `compare-${COMPARE}`));
  await page.close();
  const pairs = shots.slice(0, 5).flatMap((shot, i) => [{ ...shot, name: `${ROOM} · ${shot.name}` }, { ...theirs[i], name: `${COMPARE} · ${theirs[i].name}` }]);
  await writeSheet(join(OUTDIR, `compare-${COMPARE}.png`), `${ROOM} beside ${COMPARE} · ${LABEL}`, grid(2, pairs));
}

await browser.close();
