// Screenshots of the item models on the item bench (?bench=items, see ../art/item-bench.ts), for judging them
// without a browser open.
//
// Drives the bench's control surface (window.__betrayalItems) over Playwright and waits on its events (the light
// baked, the models built, frames rendered), never a sleep. The clock stands frozen, so two runs differ only where
// the art does.
//
// Prereq: dev server on :3001 (npm run dev) + `npx playwright install chromium` (one-time); BETRAYAL_URL points
// it at another server.
// Usage:  node src/projects/betrayal/tools/item-shots.mjs [label] [--items=axe,spear] [--explorer=<character-id>]
//         [--room=foyer|chapel] [--active] [--t=<s>] [--query=<params>]
//
// Writes to src/projects/betrayal/.shots/<label>/items/ (gitignored): all.png, every item shown; and for each item
// <id>.png, held and on its plate; <id>-hand.png and <id>-plate.png, each close; <id>-house.png, the house's camera
// zoomed in on it; and <id>-phone.png, the same on a phone; then items.png, a sheet of them all, a row an item.
// --items shoots only those; --room=chapel lights them dim; --active adds the light over the explorer in play.

import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const FLAGS = process.argv.slice(2).filter((arg) => arg.startsWith("--"));
const flag = (name) => FLAGS.find((f) => f.startsWith(`--${name}=`))?.slice(name.length + 3);
const [LABEL = "latest"] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const ITEMS = flag("items");
const QUERY = new URLSearchParams();
if (ITEMS) QUERY.set("items", ITEMS);
for (const name of ["explorer", "room", "t"]) if (flag(name) !== undefined) QUERY.set(name, flag(name));
if (FLAGS.includes("--active")) QUERY.set("active", "");
/** More of the bench's query string, for a setting the page reads from it, e.g. --query=shine=off. */
for (const [name, value] of new URLSearchParams(flag("query") ?? "")) QUERY.set(name, value);
const BASE = process.env.BETRAYAL_URL ?? "http://localhost:3001/board-games/betrayal";
const DIR = join(HERE, "..", ".shots", LABEL, "items");
// eslint-disable-next-line security/detect-non-literal-fs-filename -- dev-only tool writing under the project's own .shots folder
mkdirSync(DIR, { recursive: true });

// Real GPU through ANGLE/D3D11, as shots.mjs; SHOTS_CPU=1 falls back to SwiftShader.
const browser = await chromium.launch({
  headless: true,
  args: process.env.SHOTS_CPU === "1" ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"],
});

async function openBench(viewport) {
  const page = await browser.newPage({ viewport });
  page.on("pageerror", async (error) => {
    console.error(`The item bench threw:\n${error.stack ?? error.message}`);
    await browser.close();
    process.exit(1);
  });
  page.on("console", (m) => {
    if (m.type() === "error") console.error("page console error:", m.text());
  });
  await page.goto(`${BASE}?bench=items${QUERY.size > 0 ? `&${QUERY.toString().replace(/=(&|$)/g, "$1")}` : ""}`, { waitUntil: "load" });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.waitForFunction(() => "__betrayalItems" in window, null, { timeout: 60000 });
  return page;
}

/** Frames as asked, waits for the bench to be ready and two more frames drawn, and shoots it without its panel. */
async function capture(page, path, { focus = null, camera = "all" } = {}) {
  await page.evaluate(
    ({ focus, camera }) => {
      const bench = window.__betrayalItems;
      bench.setFocus(focus);
      if (focus !== null) bench.setCamera(camera);
      document.querySelectorAll(".pointer-events-none").forEach((el) => {
        el.style.visibility = "hidden";
      });
    },
    { focus, camera },
  );
  await page.waitForFunction(() => window.__betrayalItems.isReady(), null, { timeout: 180000 });
  const frame = await page.evaluate(() => window.__betrayalItems.frameCount());
  await page.waitForFunction((n) => window.__betrayalItems.frameCount() >= n + 2, frame, { timeout: 10000 });
  await page.screenshot({ path });
  console.log("wrote", path);
  return path;
}

const desktop = await openBench({ width: 1920, height: 1080 });
const items = await desktop.evaluate(() => {
  const shown = new URL(window.location.href).searchParams.get("items");
  return shown ? shown.split(",") : window.__betrayalItems.items();
});
await capture(desktop, join(DIR, "all.png"));
/** Each item's shots, in the sheet's order: held and on its plate, each close, and in the house zoomed in. */
const VIEWS = [
  ["close", ""],
  ["hand", "-hand"],
  ["plate", "-plate"],
  ["near", "-house"],
];
const shots = [];
for (const item of items) {
  for (const [camera, suffix] of VIEWS) shots.push({ name: `${item}, ${camera}`, path: await capture(desktop, join(DIR, `${item}${suffix}.png`), { focus: item, camera }) });
}
await desktop.close();

const phone = await openBench({ width: 360, height: 780 });
const phones = [];
for (const item of items) phones.push({ name: `${item}, phone`, path: await capture(phone, join(DIR, `${item}-phone.png`), { focus: item, camera: "near" }) });
await phone.close();

const dataUrl = (path) =>
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- reads back the screenshots this run just wrote
  `data:image/png;base64,${readFileSync(path).toString("base64")}`;
const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const cell = (shot) => `<figure style="margin:0"><img src="${dataUrl(shot.path)}" style="width:100%;display:block"><figcaption>${escape(shot.name)}</figcaption></figure>`;
const sheet = await browser.newPage({ viewport: { width: 2000, height: 200 } });
const rows = items.map((_, i) => `${shots.slice(i * VIEWS.length, (i + 1) * VIEWS.length).map(cell).join("")}${cell(phones[i])}`).join("");
await sheet.setContent(`<!doctype html><html><body style="margin:0;padding:16px;background:#111;color:#bbb;font:14px sans-serif">
<h1 style="margin:0 0 12px;font-size:18px">items · ${escape(LABEL)}</h1>
<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 120px;gap:12px;align-items:start">${rows}</div></body></html>`);
await sheet.waitForFunction(() => [...document.images].every((img) => img.complete && img.naturalWidth > 0));
await sheet.screenshot({ path: join(DIR, "items.png"), fullPage: true });
console.log("wrote", join(DIR, "items.png"));
await browser.close();
