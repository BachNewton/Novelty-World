// Setup's character portraits, shot in the figure viewer (`?bench=figures`): each character as a seat shows them
// (their figure, or the pawn in their card's colour), on their base, like a miniature photographed on a plain
// dark backdrop: a sweep whose floor curves up behind the figure, under a soft warm key with the cold moon
// behind as a rim (the viewer's portrait light). Behind the figure a light gelled in the character's seat colour
// (their card's) glows on the backdrop, so the portrait reads as that seat's at a glance while the figure keeps its
// true colours: the light takes the colour from the character shown, so each shot is accented by its own. They
// are framed whole from near eye level and close in, like a character-select portrait, and every character at the
// same scale (the viewer's portrait camera), so their heights stay true. No colour ring round the base.
// Run it again whenever a figure lands or changes, and commit the images it writes.
//
// Drives the viewer's control surface (window.__betrayalFigures, see ../art/figure-viewer.ts) over Playwright and
// waits on its events (figure built and readied, frames rendered), never a sleep. The clock is frozen, so two
// runs differ only where the art does.
//
// Prereq: a server for the app (the dev server on :3001, or BETRAYAL_URL pointing at another) and
// `npx playwright install chromium` (one-time).
// Usage:  node src/projects/betrayal/tools/portraits.mjs [character-id ...]
//         With no ids, every character is shot. --light=<preset> and --camera=<preset> pick another of the
//         viewer's lights and cameras, --view=<0-3> turns the camera by quarter turns, --zoom=<z> brings it
//         nearer (above 1) or farther, and --out=<dir> writes to another folder, to try a look.
//
//         --quality=<q> encodes at another JPEG quality, and --png also keeps the lossless shot beside it, to compare.
//
// Writes src/projects/betrayal/portraits/<character-id>.jpg: the page imports them (`play/portraits.ts`), so each one's
// URL carries a hash of its content and a reshoot reaches every browser and image cache with no version bump.

import { chromium } from "playwright";
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const FLAGS = process.argv.slice(2).filter((arg) => arg.startsWith("--"));
const flag = (name) => FLAGS.find((f) => f.startsWith(`--${name}=`))?.slice(name.length + 3);
const WANTED = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const LIGHT = flag("light") ?? "portrait";
const CAMERA = flag("camera") ?? "portrait";
const VIEW = Number(flag("view") ?? 0);
const ZOOM = Number(flag("zoom") ?? 1);
const BASE = process.env.BETRAYAL_URL ?? "http://localhost:3001/board-games/betrayal";
const OUT = flag("out") ?? join(HERE, "..", "portraits");
/** A portrait's size in CSS pixels, drawn at twice that for sharp screens. The largest setup shows one is a seat
 *  card's on a phone, one card a row and the card at most 20rem wide, so the portrait is shot at that width. */
const SIZE = { width: 320, height: 400 };
/** JPEG at this quality with full-resolution colour keeps the backdrop's dark gradient and the seat colour's glow as
 *  smooth as the lossless shot; lossy WebP, even at 95, blotches those dark gradients and shifts their colour. */
const QUALITY = Number(flag("quality") ?? 90);
const KEEP_PNG = FLAGS.includes("--png");
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
  console.error(`The viewer threw:\n${error.stack ?? error.message}`);
  await browser.close();
  process.exit(1);
});
const address = new URLSearchParams({ bench: "figures", light: LIGHT, camera: CAMERA, ring: "off", t: String(FREEZE_AT) });
await page.goto(`${BASE}?${address}&paused`, { waitUntil: "load" });
await page.addStyleTag({ content: "nextjs-portal{display:none!important} .pointer-events-none{visibility:hidden!important}" });
await page.waitForFunction(() => "__betrayalFigures" in window, null, { timeout: 60000 });

const seated = new Map((await page.evaluate(() => window.__betrayalFigures.characters())).map(({ character, figure }) => [character, figure]));
for (const id of WANTED) if (!seated.has(id)) throw new Error(`No character "${id}"; there are: ${[...seated.keys()].join(", ")}`);
await page.evaluate(
  ({ view, zoom }) => {
    const viewer = window.__betrayalFigures;
    viewer.orbit(view);
    viewer.zoom(zoom);
  },
  { view: VIEW, zoom: ZOOM },
);

for (const id of WANTED.length > 0 ? WANTED : [...seated.keys()]) {
  await page.evaluate(
    ({ figure, at }) => {
      const viewer = window.__betrayalFigures;
      viewer.setFigure(figure);
      viewer.freezeAt(at);
    },
    { figure: seated.get(id), at: FREEZE_AT },
  );
  await page.waitForFunction(() => window.__betrayalFigures.isReady(), null, { timeout: 120000 });
  const frame = await page.evaluate(() => window.__betrayalFigures.frameCount());
  await page.waitForFunction((n) => window.__betrayalFigures.frameCount() >= n + 2, frame, { timeout: 20000 });
  const shot = await page.screenshot({ type: "png" });
  const path = join(OUT, `${id}.jpg`);
  await sharp(shot).jpeg({ quality: QUALITY, chromaSubsampling: "4:4:4", mozjpeg: true }).toFile(path);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- dev-only tool writing the project's own portraits
  if (KEEP_PNG) writeFileSync(join(OUT, `${id}.png`), shot);
  console.log("wrote", path);
}
await browser.close();
