// Shoots stills of Adventure from exact views, headless, for a session to see what it placed or built without the
// owner's browser. Opens the game on the dev server, waits for the world (or the piece bench) to load, then for each
// view puts the camera at its eye looking at its target, waits for a drawn frame, and saves a PNG named for the view.
//
// Usage: npm run slot -- browser -- node src/projects/adventure/tools/look.mjs --out <folder>
//          [--query view=pieces] [--width W] [--height H] [--overlay true] <name>:<ex>,<ey>,<ez>,<tx>,<ty>,<tz> ...
//
// A view on the bench finds a piece by its place there (`bench.ts`). `--overlay true` shows the ~ overlay's names.

/* eslint-disable security/detect-non-literal-fs-filename -- a tool writing to the folder named on its command line */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { requireSlot } from "../../../../scripts/machine-budget.mjs";

const argv = process.argv.slice(2);
const flags = Object.fromEntries(argv.flatMap((a, i) => (a.startsWith("--") ? [[a.slice(2), argv[i + 1]]] : [])));
const views = argv.filter((a, i) => !a.startsWith("--") && !argv[i - 1]?.startsWith("--")).map((a) => {
  const [name, numbers] = a.split(":");
  const n = numbers.split(",").map(Number);
  if (n.length !== 6 || n.some(Number.isNaN)) throw new Error(`look: a view is name:ex,ey,ez,tx,ty,tz, not ${a}`);
  return { name, eye: n.slice(0, 3), at: n.slice(3) };
});
if (flags.out === undefined || views.length === 0) throw new Error("look: pass --out <folder> and at least one view");
mkdirSync(flags.out, { recursive: true });

requireSlot("The Adventure look tool", { radeon: 1, egpu: 0 });
const browser = await chromium.launch({ channel: "chromium", headless: true, args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--enable-gpu"] });
try {
  const page = await browser.newPage({ viewport: { width: Number(flags.width ?? 1280), height: Number(flags.height ?? 800) } });
  page.on("pageerror", (e) => console.error("page threw:", e.message));
  const bench = (flags.query ?? "").includes("view=pieces");
  await page.goto(`http://localhost:3001/3d-games/adventure${flags.query ? `?${flags.query}` : ""}`);
  await page.waitForFunction((n) => window.__adventure?.loaded().length === n, bench ? 1 : 4, { timeout: 180_000 });
  if (flags.overlay === "true") await page.keyboard.press("Backquote");
  for (const { name, eye, at } of views) {
    await page.evaluate(([e, t]) => window.__adventure.lookFrom(e, t), [eye, at]);
    // Two frames: one draws the new view, the next is the one the screenshot is sure to see.
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.screenshot({ path: join(flags.out, `${name}.png`) });
    console.log(join(flags.out, `${name}.png`));
  }
} finally {
  await browser.close();
}
