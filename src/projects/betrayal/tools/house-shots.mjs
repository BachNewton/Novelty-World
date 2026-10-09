// Screenshots of the Betrayal house view (?house, see ../art/house-scene.ts and the stand-in game driving it, ../art/house-demo.ts), for judging how rooms
// join into a house without a browser open.
//
// Drives the view's control surface (window.__betrayalHouse) over Playwright and waits on its events
// (house built, textures decoded, camera settled, frames rendered), never a sleep. The clock is frozen
// at FREEZE_AT for every shot, so two runs differ only where the art does.
//
// Prereq: dev server on :3001 (npm run dev) + `npx playwright install chromium` (one-time).
// Usage:  node src/projects/betrayal/tools/house-shots.mjs [label] [--res=<short side>] [--room=<room-id>]
// Writes to src/projects/betrayal/.shots/<label>/house/ (gitignored): every floor from the four views,
// the whole house stacked, close views of single rooms, a phone shot, and three contact sheets:
// sheet-ground.png, sheet-upper.png and sheet-house.png (stacked, basement, close views, phone). Those
// judge the art, so the choices' glow and route are hidden in them. sheet-spill.png shows light between rooms: the
// lit Foyer beside the dark Dining Room, through an open doorway and, turned, through a solid wall. sheet-room-graveyard.png
// shows an outdoor tile among indoor ones (see --room). sheet-play.png shows the stand-in
// decision: a focused choice with its route preview (desktop and phone), "Stop here" focused, and a walk up the grand
// staircase frozen at several moments, ending with the room framed close as the explorer enters it.
//
// --room=<room-id> shoots only that room, in a small house built round it (?house&layout=room:<room-id>): plain rooms
// joined to every doorway, so every wall between rooms is cut as the house cuts it. It writes sheet-room-<room-id>.png:
// the floor from the four views, the room framed close from two (its back walls standing, as when an explorer enters),
// and a phone shot, with Longfellow at the room's pawn spot and the scale pawn next door.

import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const [LABEL = "latest"] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
/** Shoots only this room, in a house built round it, e.g. --room=kitchen. */
const ROOM = process.argv.find((arg) => arg.startsWith("--room="))?.slice("--room=".length) ?? null;
/** Draws at this short side in pixels instead of the view's native default, e.g. --res=540. */
const RES_FLAG = process.argv.find((arg) => arg.startsWith("--res="));
const RES = RES_FLAG === undefined ? null : Number(RES_FLAG.slice("--res=".length));
const FREEZE_AT = 2;
const OUTDIR = join(HERE, "..", ".shots", LABEL, "house");
const BASE = process.env.BETRAYAL_URL ?? "http://localhost:3001/board-games/betrayal";
const DESKTOP = { width: 1920, height: 1080 };
const PHONE = { width: 360, height: 780 };

// eslint-disable-next-line security/detect-non-literal-fs-filename -- dev-only tool writing under the project's own .shots folder
mkdirSync(OUTDIR, { recursive: true });

const USE_GPU = process.env.SHOTS_CPU !== "1";
const browser = await chromium.launch({
  headless: true,
  args: USE_GPU
    ? ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"]
    : ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
// A house that throws while building never becomes ready; fail with its own error, not a timeout.
async function failOnPageError(error) {
  console.error(`The house view threw:\n${error.stack ?? error.message}`);
  await browser.close();
  process.exit(1);
}

async function openHouse(viewport, layout = null) {
  const page = await browser.newPage({ viewport });
  page.on("pageerror", (error) => void failOnPageError(error));
  page.on("console", (m) => {
    if (m.type() === "error") console.error("page console error:", m.text());
  });
  await page.goto(`${BASE}?house${layout ? `&layout=${layout}` : ""}`, { waitUntil: "load" });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.waitForFunction(() => "__betrayalHouse" in window, null, { timeout: 30000 });
  await page.evaluate(
    ({ at, res }) => {
      window.__betrayalHouse.freezeClock(at);
      if (res !== null) window.__betrayalHouse.setResolution(res);
    },
    { at: FREEZE_AT, res: RES },
  );
  return page;
}

async function settle(page) {
  await page.waitForFunction(() => window.__betrayalHouse.isReady(), null, { timeout: 60000 });
  const frame = await page.evaluate(() => window.__betrayalHouse.frameCount());
  await page.waitForFunction((n) => window.__betrayalHouse.frameCount() >= n + 2, frame, { timeout: 10000 });
}

async function capture(page, name, { floor = "ground", view = 0, zoom = 1, focus = null, chrome = false } = {}) {
  await page.evaluate(
    ({ floor, view, zoom, focus, chrome }) => {
      const house = window.__betrayalHouse;
      house.showChoices(false);
      house.setFloor(floor);
      house.setCloseUp(focus);
      house.setView(view);
      house.setZoom(zoom);
      document.querySelectorAll(".pointer-events-none").forEach((el) => {
        el.style.visibility = chrome ? "" : "hidden";
      });
    },
    { floor, view, zoom, focus, chrome },
  );
  await page.waitForFunction(() => window.__betrayalHouse.isReady(), null, { timeout: 60000 });
  const frame = await page.evaluate(() => window.__betrayalHouse.frameCount());
  await page.waitForFunction((n) => window.__betrayalHouse.frameCount() >= n + 2, frame, { timeout: 10000 });
  const path = join(OUTDIR, `${name}.png`);
  await page.screenshot({ path });
  console.log("wrote", path);
  return { name, path };
}

const dataUrl = (path) =>
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- reads back the screenshots this run just wrote
  `data:image/png;base64,${readFileSync(path).toString("base64")}`;
const cell = (shot) =>
  `<figure style="margin:0"><img src="${dataUrl(shot.path)}" style="width:100%;display:block;image-rendering:pixelated"><figcaption>${shot.name}</figcaption></figure>`;
const sheet = await browser.newPage({ viewport: { width: 2000, height: 200 } });
async function contactSheet(name, shots, columns) {
  await sheet.setContent(`<!doctype html><html><body style="margin:0;padding:16px;background:#111;color:#bbb;font:14px sans-serif">
<h1 style="margin:0 0 12px;font-size:18px">house · ${name} · ${LABEL}</h1>
<div style="display:grid;grid-template-columns:repeat(${columns},1fr);gap:12px;align-items:start">${shots.map(cell).join("")}</div>
</body></html>`);
  await sheet.waitForFunction(() => [...document.images].every((img) => img.complete && img.naturalWidth > 0));
  const path = join(OUTDIR, `sheet-${name}.png`);
  await sheet.screenshot({ path, fullPage: true });
  console.log("wrote", path);
}
/** One room in a house built round it: the floor from every view, the room close, and a phone shot. */
async function shootRoom(room) {
  const layout = `room:${room}`;
  const shots = [];
  const page = await openHouse(DESKTOP, layout);
  const floor = await page.evaluate(() => window.__betrayalHouse.state().floor);
  for (const view of [0, 1, 2, 3]) shots.push(await capture(page, `room-${room}-${view}`, { floor, view }));
  shots.push(await capture(page, `room-${room}-close-0`, { floor, focus: room, view: 0 }));
  shots.push(await capture(page, `room-${room}-close-2`, { floor, focus: room, view: 2 }));
  await page.close();
  const phone = await openHouse(PHONE, layout);
  shots.push(await capture(phone, `room-${room}-phone`, { floor, view: 0, chrome: true }));
  await phone.close();
  return shots;
}

if (ROOM) {
  await contactSheet(`room-${ROOM}`, await shootRoom(ROOM), 3);
  await browser.close();
  process.exit(0);
}

const desktop = await openHouse(DESKTOP);
const ground = [];
const upper = [];
for (const view of [0, 1, 2, 3]) ground.push(await capture(desktop, `ground-${view}`, { floor: "ground", view }));
for (const view of [0, 1, 2, 3]) upper.push(await capture(desktop, `upper-${view}`, { floor: "upper", view }));
const house = [
  await capture(desktop, "all-0", { floor: "all", view: 0 }),
  await capture(desktop, "all-2", { floor: "all", view: 2 }),
  await capture(desktop, "basement-0", { floor: "basement", view: 0 }),
  await capture(desktop, "close-staircase-1", { focus: "grand-staircase", view: 1 }),
  await capture(desktop, "close-staircase-2", { focus: "grand-staircase", view: 2 }),
  await capture(desktop, "close-library-0", { focus: "library", view: 0 }),
  await capture(desktop, "close-chapel-3", { focus: "chapel", view: 3 }),
  await capture(desktop, "close-drawing-room-0", { focus: "drawing-room", view: 0 }),
  await capture(desktop, "close-entrance-hall-2", { focus: "entrance-hall", view: 2 }),
];
await desktop.close();

const phone = await openHouse(PHONE);
house.push(await capture(phone, "phone", { floor: "ground", view: 0, chrome: true }));
await phone.close();

/** The stand-in decision as a player sees it, with the page's own panel and hints. */
async function shoot(page, name) {
  await settle(page);
  const path = join(OUTDIR, `${name}.png`);
  await page.screenshot({ path });
  console.log("wrote", path);
  return { name, path };
}
const play = [];
const choosing = await openHouse(DESKTOP);
// A key press first, so the panel shows the keyboard's hints.
await choosing.keyboard.press("ArrowLeft");
await choosing.evaluate(() => window.__betrayalHouse.focus("walk:dining-room"));
play.push(await shoot(choosing, "play-focused"));
await choosing.evaluate(() => window.__betrayalHouse.focus("stop"));
play.push(await shoot(choosing, "play-stop"));
await choosing.evaluate(() => window.__betrayalHouse.focus("walk:upper-landing"));
play.push(await shoot(choosing, "play-focused-upstairs"));
// A walk from the Library up the grand staircase, frozen at moments along it.
await choosing.evaluate(() => window.__betrayalHouse.choose("walk:upper-landing"));
for (const after of [1.2, 4.2, 5.2, 5.9, 6.6]) {
  await choosing.evaluate((at) => window.__betrayalHouse.freezeClock(at), FREEZE_AT + after);
  play.push(await shoot(choosing, `play-walk-${after}`));
}
await choosing.evaluate(() => window.__betrayalHouse.freezeClock(null));
await choosing.waitForFunction(() => window.__betrayalHouse.state().closeUp === "upper-landing", null, { timeout: 30000 });
await choosing.evaluate((at) => window.__betrayalHouse.freezeClock(at), FREEZE_AT);
play.push(await shoot(choosing, "play-entering"));
await choosing.close();
const phonePlay = await openHouse(PHONE);
await phonePlay.evaluate(() => window.__betrayalHouse.focus("walk:foyer"));
play.push(await shoot(phonePlay, "play-phone"));
await phonePlay.close();

// Light between rooms: the lit Foyer and the dark Dining Room, through an open doorway and through a wall.
const spill = [];
for (const layout of ["spill-doorway", "spill-wall"]) {
  const page = await openHouse(DESKTOP, layout);
  spill.push(await capture(page, `${layout}-floor`, { floor: "ground", view: 2 }));
  spill.push(await capture(page, `${layout}-dining-room`, { focus: "dining-room", view: 2 }));
  await page.close();
}

await contactSheet("ground", ground, 2);
await contactSheet("upper", upper, 2);
await contactSheet("house", house, 3);
await contactSheet("play", play, 3);
await contactSheet("spill", spill, 2);
await contactSheet("room-graveyard", await shootRoom("graveyard"), 3);
await browser.close();
