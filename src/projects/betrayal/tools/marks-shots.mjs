// Screenshots of the marks bench (`?bench=marks`, see ../art/marks-bench.ts), for judging the connection marks
// without a browser open. Drives the bench's control surface (window.__betrayalMarks) over Playwright and waits
// on its events (the house lit, the camera settled, frames drawn), never a sleep.
//
// Prereq: a dev server (BETRAYAL_URL, default http://localhost:3001/board-games/betrayal) + `npx playwright install chromium`.
// Usage:  node src/projects/betrayal/tools/marks-shots.mjs [label] [--kinds=a,b] [--face=ink|bone]
//
// Writes to src/projects/betrayal/.shots/<label>/marks/ (gitignored): for each kind, the row of rooms
// (<kind>-row.png) and each room close (<kind>-<room>.png), from two opposite views, with the walls cut and
// raised; wall kinds on every wall and into every corner.

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const FLAGS = process.argv.slice(2).filter((arg) => arg.startsWith("--"));
const flag = (name) => FLAGS.find((f) => f.startsWith(`--${name}=`))?.slice(name.length + 3);
const [LABEL = "latest"] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const KINDS = (flag("kinds") ?? "secret-passage,secret-stairs,wall-switch,slide,below-collapsed-room").split(",");
const FACE = flag("face") ?? "ink";
const BASE = process.env.BETRAYAL_URL ?? "http://localhost:3001/board-games/betrayal";
const ROOMS = ["library", "organ-room", "chasm", "graveyard", "wine-cellar"];
const OUT = join(HERE, "..", ".shots", LABEL, "marks");
// eslint-disable-next-line security/detect-non-literal-fs-filename -- dev-only tool writing under the project's own .shots folder
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on("pageerror", async (error) => {
  console.error(`The marks bench threw:\n${error.stack ?? error.message}`);
  await browser.close();
  process.exit(1);
});
await page.goto(`${BASE}?bench=marks&face=${FACE}`, { waitUntil: "load" });
await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
await page.waitForFunction(() => "__betrayalMarks" in window, null, { timeout: 60000 });
await page.evaluate(() => window.__betrayalMarks.freezeClock(2));

/** Waits for the house to be lit and the camera settled, then for two more frames drawn. */
async function settled() {
  await page.waitForFunction(() => window.__betrayalMarks.isFullyLit(), null, { timeout: 180000 });
  const frame = await page.evaluate(() => window.__betrayalMarks.frameCount());
  await page.waitForFunction((from) => window.__betrayalMarks.frameCount() > from + 2, frame);
}

async function shoot(name) {
  await settled();
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log(`wrote ${name}.png`);
}

const isWall = (kind) => ["secret-passage", "secret-stairs", "wall-switch"].includes(kind);
for (const kind of KINDS) {
  for (const walls of isWall(kind) ? ["walls", "corners"] : ["walls"]) {
    const tag = isWall(kind) ? `${kind}-${walls}` : kind;
    await page.evaluate(({ kind, walls }) => {
      const bench = window.__betrayalMarks;
      bench.setKind(kind);
      bench.setWalls(walls);
      bench.setRoom(null);
      bench.setView(0);
      bench.fit();
    }, { kind, walls });
    await shoot(`${tag}-row`);
    for (const room of ROOMS) {
      for (const view of [0, 2]) {
        await page.evaluate(({ room, view }) => {
          const bench = window.__betrayalMarks;
          bench.setRoom(room);
          bench.setView(view);
          bench.fit();
        }, { room, view });
        await shoot(`${tag}-${room}-v${view}`);
      }
      await page.evaluate(() => window.__betrayalMarks.raiseWalls(true));
      await shoot(`${tag}-${room}-raised`);
      await page.evaluate(() => window.__betrayalMarks.raiseWalls(false));
    }
  }
}
await browser.close();
