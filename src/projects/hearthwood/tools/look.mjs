// One look at the world, for checking a change by eye: waits until everything the camera wants is built
// and drawn (the page's own probe, `window.__hearthwood`), then a few more frames, and saves a screenshot.
// Errors the page logs or throws are printed, so a shader that fails to build says so.
//
// Prereq: a dev server. Usage:
//   node src/projects/hearthwood/tools/look.mjs "<query>" <out.png> [--frames=N] [--size=WxH] [--eval=<js>]
// e.g. node src/projects/hearthwood/tools/look.mjs "?hour=17.4&date=autumn-3" look.png
// --eval runs a script in the page once it is ready (e.g. `__hearthwood.setCamera({ pitch: -0.4 })`), and the
// page settles again before the shot. HEARTHWOOD_URL overrides the page's address.

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
const settled = () => page.waitForFunction(() => window.__hearthwood?.settled() === true, null, { timeout: 600000 });
await settled();
if (EVAL) {
  await page.evaluate(EVAL);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await settled();
}
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
