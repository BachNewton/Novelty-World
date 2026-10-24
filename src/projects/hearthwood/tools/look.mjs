// One look at any Hearthwood page, for checking a change by eye: the world (with any of its URL switches),
// the art gallery (?art) or the animals' preview (?cats). Waits for the page's own readiness where it has
// one (the world's probe, the gallery's), then for a few drawn frames, and saves a screenshot. Errors the
// page logs or throws are printed, so a shader that fails to build says so.
//
// Prereq: a dev server (npm run dev). Usage:
//   node src/projects/hearthwood/tools/look.mjs "<query>" <out.png> [--frames=N] [--size=WxH] [--eval=<js>]
// e.g. node src/projects/hearthwood/tools/look.mjs "?hour=17.4&weather=clear&features=none,+water" /tmp/lake.png
// --eval runs a script in the page once it is ready (e.g. to move the probe's camera) before the frames.
// HEARTHWOOD_URL overrides the page's address.

import { launchBrowser } from "./browser.mjs";

const [QUERY = "", OUT = "look.png"] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const option = (name) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
const FRAMES = Number(option("frames") ?? 4);
const [WIDTH, HEIGHT] = (option("size") ?? "1280x720").split("x").map(Number);
const EVAL = option("eval");
const BASE = process.env.HEARTHWOOD_URL ?? "http://localhost:3001/games/3d-games/hearthwood";

const browser = await launchBrowser();
const page = await (await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 })).newPage();
const problems = [];
page.on("console", (message) => {
  if (message.type() === "error" || message.type() === "warning") problems.push(`${message.type()}: ${message.text()}`);
});
page.on("pageerror", (error) => problems.push(`thrown: ${error.stack ?? error.message}`));

const started = Date.now();
await page.goto(`${BASE}${QUERY}`, { waitUntil: "load" });
await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
await page.waitForFunction(
  () => {
    if (document.querySelector("[data-testid=hearthwood-no-webgpu]")) return true;
    const world = window.__hearthwoodWorld;
    if (world) return world.isReady();
    const art = window.__hearthwoodArt;
    if (art) return art.isReady?.() ?? true;
    return document.querySelector("canvas") !== null;
  },
  null,
  { timeout: 600000 },
);
if (EVAL) await page.evaluate(EVAL);
await page.evaluate(
  (count) =>
    new Promise((resolve) => {
      let left = count;
      requestAnimationFrame(function tick() {
        if (--left <= 0) resolve(null);
        else requestAnimationFrame(tick);
      });
    }),
  FRAMES,
);
await page.screenshot({ path: OUT });
console.log(`${OUT} after ${((Date.now() - started) / 1000).toFixed(1)} s`);
if (problems.length > 0) console.log(`The page reported:\n${[...new Set(problems)].slice(0, 30).join("\n")}`);
await browser.close();
