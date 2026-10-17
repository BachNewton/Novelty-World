// Screenshots of the cat preview (`?cats`), for judging the cats' art without a browser open.
//
// Drives the preview's control surface (window.__hearthwoodCats, in components/cats/cat-preview.tsx) over
// Playwright and waits on its frames, never a sleep. The clock is frozen, so two runs differ only where
// the art does.
//
// Prereq: a dev server (HEARTHWOOD_URL, default http://localhost:3001) + `npx playwright install chromium`.
// Usage:  node src/projects/hearthwood/tools/cat-shots.mjs [label] [--seed=<field seed>] [--cats=0,1,2]
//         [--activities=stand,walk,sit,loaf,greet] [--views=front,three-quarter,side,back] [--time=<s>]
//         [--strip=<cat>] (a walk strip: 12 frames 0.06 s apart, side on)
//
// Writes to src/projects/hearthwood/.shots/<label>/ (gitignored): field.png (desktop), field-phone.png and
// field-phone-landscape.png (a Pixel 8 Pro's Chrome view), field-far.png (the field from further off), one
// cat-<n>-<activity>-<view>.png per cat, activity and view, close-<n>.png (the face), and sheet.png
// combining them.

import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const FLAGS = process.argv.slice(2).filter((arg) => arg.startsWith("--"));
const flag = (name) => FLAGS.find((f) => f.startsWith(`--${name}=`))?.slice(name.length + 3);
const [LABEL = "latest"] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const SEED = flag("seed") ?? "hearthwood";
const CATS = (flag("cats") ?? "0,1,2").split(",").filter(Boolean).map(Number);
const ACTIVITIES = (flag("activities") ?? "stand").split(",").filter(Boolean);
const VIEW_NAMES = (flag("views") ?? "three-quarter,side,front").split(",").filter(Boolean);
const TIME = Number(flag("time") ?? 2);
const STRIP = flag("strip");
const BASE = process.env.HEARTHWOOD_URL ?? "http://localhost:3001";
const URL = `${BASE}/games/3d-games/hearthwood?cats`;
const SHOTS = join(HERE, "..", ".shots", LABEL);
// eslint-disable-next-line security/detect-non-literal-fs-filename -- dev-only tool writing under the project's own .shots folder
mkdirSync(SHOTS, { recursive: true });

/** Camera angles round a cat: azimuth from its front, height angle, distance. */
const VIEWS = {
  front: [0, 12, 0.95],
  "three-quarter": [40, 16, 1.0],
  side: [90, 8, 1.05],
  back: [150, 20, 1.05],
  above: [30, 55, 1.2],
};
/** The Pixel 8 Pro in Chrome: 448 CSS pixels across, less Chrome's own bars. */
const PHONE = { width: 448, height: 890 };
const PHONE_LANDSCAPE = { width: 960, height: 410 };

const browser = await chromium.launch({ headless: true, args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"] });

async function open(viewport, scale = 1) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: scale });
  page.on("pageerror", (error) => {
    console.error(`The preview threw:\n${error.stack ?? error.message}`);
    process.exit(1);
  });
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") console.error("page:", m.text());
  });
  await page.goto(URL, { waitUntil: "load" });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.waitForFunction(() => window.__hearthwoodCats?.isReady(), null, { timeout: 120000 });
  await page.evaluate(({ seed, time }) => {
    window.__hearthwoodCats.setSeed(seed);
    window.__hearthwoodCats.freeze(time);
  }, { seed: SEED, time: TIME });
  return page;
}

/** Runs `change` on the control surface, then waits for frames drawn after it. */
async function settle(page, change, arg) {
  if (change) await page.evaluate(change, arg);
  const frame = await page.evaluate(() => window.__hearthwoodCats.frameCount());
  await page.waitForFunction((n) => window.__hearthwoodCats.frameCount() >= n + 3, frame, { timeout: 60000 });
}

async function shot(page, name) {
  const path = join(SHOTS, `${name}.png`);
  await page.screenshot({ path });
  console.log("wrote", path);
  return { name, path };
}

const shots = [];
let clockAt = TIME;
const desktop = await open({ width: 1400, height: 900 });
await settle(desktop);
console.log((await desktop.evaluate(() => window.__hearthwoodCats.cats())).map((c, i) => `${i}: ${c}`).join("\n"));
shots.push(await shot(desktop, "field"));
await settle(desktop, () => window.__hearthwoodCats.setView(35, 22, 7.5));
shots.push(await shot(desktop, "field-far"));

for (const n of CATS) {
  await settle(desktop, (i) => window.__hearthwoodCats.focus(i), n);
  for (const activity of ACTIVITIES) {
    // A change of activity blends in over a second from the frame that sees it, so the frozen clock is
    // moved on past the blend before the shots.
    clockAt += 20;
    await settle(desktop, ({ a, t }) => {
      window.__hearthwoodCats.freeze(t);
      window.__hearthwoodCats.setGreeting(a === "greet");
      window.__hearthwoodCats.setActivity(a === "greet" ? "stand" : a);
    }, { a: activity, t: clockAt });
    await settle(desktop, (t) => window.__hearthwoodCats.freeze(t), clockAt + 3);
    for (const view of VIEW_NAMES) {
      await settle(desktop, (v) => window.__hearthwoodCats.setView(...v), VIEWS[view]);
      shots.push(await shot(desktop, `cat-${n}-${activity}-${view}`));
    }
  }
  clockAt += 20;
  await settle(desktop, (t) => {
    window.__hearthwoodCats.freeze(t);
    window.__hearthwoodCats.setActivity("stand");
    window.__hearthwoodCats.setGreeting(false);
  }, clockAt);
  await settle(desktop, (t) => window.__hearthwoodCats.freeze(t), clockAt + 3);
  await settle(desktop, () => window.__hearthwoodCats.setView(25, 8, 0.45, true));
  shots.push(await shot(desktop, `close-${n}`));
  await settle(desktop, () => window.__hearthwoodCats.focus(null));
}

if (STRIP !== undefined) {
  await settle(desktop, (i) => window.__hearthwoodCats.focus(i), Number(STRIP));
  await settle(desktop, () => window.__hearthwoodCats.setActivity("walk"));
  await settle(desktop, (t) => window.__hearthwoodCats.freeze(t), TIME + 1);
  await settle(desktop, () => window.__hearthwoodCats.setView(90, 6, 1.0));
  for (let f = 0; f < 12; f++) {
    await settle(desktop, (t) => window.__hearthwoodCats.freeze(t), TIME + 1 + f * 0.06);
    shots.push(await shot(desktop, `strip-${String(f).padStart(2, "0")}`));
  }
}

const phone = await open(PHONE, 2);
await settle(phone);
shots.push(await shot(phone, "field-phone"));
await phone.setViewportSize(PHONE_LANDSCAPE);
await settle(phone);
shots.push(await shot(phone, "field-phone-landscape"));

const dataUrl = (path) =>
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- reads back the screenshots this run just wrote
  `data:image/png;base64,${readFileSync(path).toString("base64")}`;
const sheet = await browser.newPage({ viewport: { width: 2000, height: 200 } });
await sheet.setContent(`<!doctype html><html><body style="margin:0;padding:12px;background:#111;color:#bbb;font:13px sans-serif">
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">${shots
  .map((s) => `<figure style="margin:0"><img src="${dataUrl(s.path)}" style="width:100%;display:block"><figcaption>${s.name}</figcaption></figure>`)
  .join("")}</div></body></html>`);
await sheet.waitForFunction(() => [...document.images].every((img) => img.complete && img.naturalWidth > 0));
await sheet.screenshot({ path: join(SHOTS, "sheet.png"), fullPage: true });
console.log("wrote", join(SHOTS, "sheet.png"));
await browser.close();
