// Setup's character portraits, shot from the art bench: each character as a seat shows them in the house
// (their figure, or the pawn in their card's colour), standing on the pawn spot of one room, framed whole
// from near eye level and close in, like a character-select portrait. The room is the Abandoned Room: from
// view 0 its pawn spot has solid wall behind it, so the room fills the frame and the void past the bench's
// one tile never shows. Every character is framed at the same scale, so their heights stay true.
// Run it again whenever a figure lands or changes, and commit the images it writes.
//
// Drives the bench's control surface (window.__betrayalBench, see ../art/bench.ts) over Playwright and
// waits on its events (room built and lit, frames rendered), never a sleep. The clock is frozen, so two
// runs differ only where the art does.
//
// Prereq: a server for the app (the dev server on :3001, or BETRAYAL_URL pointing at another) and
// `npx playwright install chromium` (one-time).
// Usage:  node src/projects/betrayal/tools/portraits.mjs [character-id ...]
//         With no ids, every character is shot. --room=<room-id> picks the room they stand in, --view=<0-3>,
//         --zoom=<z> and --tilt=<degrees above level> the bench's preset view, zoom and camera tilt, and
//         --out=<dir> another folder, to try a look.
//
// Writes public/betrayal/portraits/<character-id>.jpg.

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const FLAGS = process.argv.slice(2).filter((arg) => arg.startsWith("--"));
const flag = (name) => FLAGS.find((f) => f.startsWith(`--${name}=`))?.slice(name.length + 3);
const WANTED = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const ROOM = flag("room") ?? "abandoned-room";
/** The bench's preset view, zoom and tilt the portraits are shot from. */
const VIEW = Number(flag("view") ?? 0);
const ZOOM = Number(flag("zoom") ?? 1.3);
const TILT = Number(flag("tilt") ?? 12);
const BASE = process.env.BETRAYAL_URL ?? "http://localhost:3001/board-games/betrayal";
const OUT = flag("out") ?? join(HERE, "..", "..", "..", "..", "public", "betrayal", "portraits");
/** A portrait's size in CSS pixels, drawn at twice that for sharp screens; setup shows it at most this big. */
const SIZE = { width: 192, height: 240 };
const FREEZE_AT = 2;

// eslint-disable-next-line security/detect-non-literal-fs-filename -- dev-only tool writing the project's own portraits
mkdirSync(OUT, { recursive: true });

// Real GPU through ANGLE/D3D11, as the shots tool; SHOTS_CPU=1 falls back to SwiftShader.
const browser = await chromium.launch({
  headless: true,
  args:
    process.env.SHOTS_CPU === "1"
      ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
      : ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"],
});
const page = await browser.newPage({ viewport: SIZE, deviceScaleFactor: 2 });
page.on("pageerror", async (error) => {
  console.error(`The bench threw:\n${error.stack ?? error.message}`);
  await browser.close();
  process.exit(1);
});
await page.goto(`${BASE}?bench=${encodeURIComponent(ROOM)}&frame=explorer`, { waitUntil: "load" });
await page.addStyleTag({ content: "nextjs-portal{display:none!important} .pointer-events-none{visibility:hidden!important}" });
await page.waitForFunction(() => "__betrayalBench" in window, null, { timeout: 60000 });

const SEATED = "seated:";
const characters = (await page.evaluate(() => window.__betrayalBench.explorers())).filter((id) => id.startsWith(SEATED)).map((id) => id.slice(SEATED.length));
for (const id of WANTED) if (!characters.includes(id)) throw new Error(`No character "${id}"; there are: ${characters.join(", ")}`);

for (const id of WANTED.length > 0 ? WANTED : characters) {
  await page.evaluate(
    ({ id, at, view, zoom, tilt }) => {
      const bench = window.__betrayalBench;
      bench.setExplorer(`seated:${id}`);
      bench.setView(view);
      bench.setZoom(zoom);
      bench.setTilt(tilt);
      bench.setSubject("explorer");
      bench.freezeClock(at);
    },
    { id, at: FREEZE_AT, view: VIEW, zoom: ZOOM, tilt: TILT },
  );
  await page.waitForFunction(() => window.__betrayalBench.isReady(), null, { timeout: 120000 });
  const frame = await page.evaluate(() => window.__betrayalBench.frameCount());
  await page.waitForFunction((n) => window.__betrayalBench.frameCount() >= n + 2, frame, { timeout: 20000 });
  const path = join(OUT, `${id}.jpg`);
  await page.screenshot({ path, type: "jpeg", quality: 82 });
  console.log("wrote", path);
}
await browser.close();
