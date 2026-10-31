// Follows one tree from 1.5 km to the car and prints its height and width in pixels, which perspective alone should set:
// a tree that stands still has a height times distance that doesn't change. Saves a filmstrip of it, alone and in the forest.
//
// The tree is found by its cell, marked by a private patch of the game (`window.__treeMark`, read in the forest's update:
// that cell in pure magenta, and with the third number 1 no other tree drawn), so this runs against a patched preview.
//
// Prereq: a page server. Usage: node tree-film.mjs --out=<folder> --cell=<column,row> --from=<x,z> [--folder=<tiles>] [--size=2408x1007]
// --from is where the camera ends up: it walks a straight line to there from 1.5 km out, the tree dead ahead.

/* eslint-disable security/detect-non-literal-fs-filename -- a folder this tool was told to write to */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import sharp from "sharp";
import { serveTiles } from "./serve-tiles.mjs";

const option = (name, otherwise) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? otherwise;
const [WIDTH, HEIGHT] = option("size", "2408x1007").split("x").map(Number);
const OUT = option("out", "film");
const [COLUMN, ROW] = option("cell", "").split(",").map(Number);
const FOLDER = option("folder", "src/projects/aland-drive/.data/tiles");
const PAGE = process.env.ALAND_DRIVE_URL ?? "http://localhost:3001/games/3d-games/aland-drive";
const ORIGIN = [110000, 6690000];
const STEP_M = 6;
const EYE_M = 70;
const FAR_M = 1500;
const NEAR_M = 60;
const STEPS = 60;
const STRIP_EVERY = 5;
const CROP = 260;

mkdirSync(OUT, { recursive: true });
const tiles = await serveTiles(FOLDER);
const browser = await chromium.launch({ channel: "chromium", headless: true, args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--enable-gpu", "--disable-gpu-vsync", "--disable-frame-rate-limit"] });
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
await page.goto(`${PAGE}?tiles=local:${tiles.port}`, { waitUntil: "load" });
await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
await page.waitForFunction(() => window.__alandDrive !== undefined, null, { timeout: 180000 });

const tree = [COLUMN * STEP_M, ROW * STEP_M];
const [fromX, fromZ] = option("from", "").split(",").map(Number);
const toEye = Math.hypot(fromX - tree[0], fromZ - tree[1]);
const way = [(fromX - tree[0]) / toEye, (fromZ - tree[1]) / toEye];

const settle = () =>
  page.evaluate(async () => {
    const probe = window.__alandDrive;
    for (let frame = probe.frames() + 3; probe.frames() < frame || probe.stream().loading > 0; ) await new Promise(requestAnimationFrame);
  });

const rows = [];
const strip = [];
for (let step = 0; step <= STEPS; step++) {
  const distance = FAR_M * (NEAR_M / FAR_M) ** (step / STEPS);
  const [x, z] = [tree[0] + way[0] * distance, tree[1] + way[1] * distance];
  await page.evaluate(({ at, origin, height, tree: spot, ahead }) => {
    const yaw = Math.atan2(at[0] - spot[0], at[1] - spot[1]);
    window.__alandDrive.look({ east: at[0] + origin[0], north: origin[1] - at[1], height, yaw, pitch: Math.atan2(4, ahead) - Math.atan2(height, ahead) });
  }, { at: [x, z], origin: ORIGIN, height: EYE_M, tree, ahead: distance });
  await page.evaluate((cell) => {
    window.__treeMark = [cell[0], cell[1], 1];
  }, [COLUMN, ROW]);
  await settle();
  const alone = await sharp(await page.screenshot()).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let [top, bottom, left, right] = [HEIGHT, -1, WIDTH, -1];
  for (let y = 0; y < HEIGHT; y++) {
    for (let x2 = 0; x2 < WIDTH; x2++) {
      const at = (y * WIDTH + x2) * 3;
      if (alone.data[at] > 200 && alone.data[at + 1] < 80 && alone.data[at + 2] > 200) {
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
        left = Math.min(left, x2);
        right = Math.max(right, x2);
      }
    }
  }
  const tall = bottom - top + 1;
  const wide = right - left + 1;
  rows.push({ distance: Number(distance.toFixed(1)), tall, wide, tallTimesDistance: Math.round(tall * distance), wideTimesDistance: Math.round(wide * distance) });
  console.log(JSON.stringify(rows[rows.length - 1]));
  if (step % STRIP_EVERY === 0 && tall > 0) {
    await page.evaluate(() => {
      window.__treeMark = undefined;
    });
    await settle();
    const whole = await page.screenshot();
    const cx = Math.max(CROP / 2, Math.min(WIDTH - CROP / 2, (left + right) >> 1));
    const cy = Math.max(CROP / 2, Math.min(HEIGHT - CROP / 2, (top + bottom) >> 1));
    const crop = { left: Math.round(cx - CROP / 2), top: Math.round(cy - CROP / 2), width: CROP, height: CROP };
    strip.push({ input: await sharp(whole).extract(crop).png().toBuffer(), left: strip.length * (CROP + 4), top: 0 });
  }
}
writeFileSync(`${OUT}/film.json`, JSON.stringify(rows, null, 1));
await sharp({ create: { width: strip.length * (CROP + 4), height: CROP, channels: 3, background: { r: 0, g: 0, b: 0 } } }).composite(strip).png().toFile(`${OUT}/filmstrip.png`);

// Pixels round down to whole ones, so a far tree is only read to one in its own height.
const worstOf = (name, size) => {
  const seen = rows.filter((row) => row[size] >= 12);
  const typical = seen.map((row) => row[name]).sort((a, b) => a - b)[seen.length >> 1];
  return { typical, worstShare: Number(Math.max(...seen.map((row) => Math.abs(row[name] / typical - 1) - 1 / row[size])).toFixed(3)) };
};
console.log("HEIGHT", JSON.stringify(worstOf("tallTimesDistance", "tall")));
console.log("WIDTH", JSON.stringify(worstOf("wideTimesDistance", "wide")));
await browser.close();
tiles.server.close();
