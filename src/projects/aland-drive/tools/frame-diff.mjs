// Whether two builds of the game draw the same pixels: the proof a rendering change is pixel-identical, or the measure of
// how far it isn't. Two pages, one on each build's server, on the same local tiles, each on a clock of the tool's own
// (`game-page.mjs`, `clock`) that moves only by whole frames, so every clock the game keeps (the clouds' drift, the
// ripples, the gaits, the flags) is at the same place in both once both have drawn the same number of frames. At each
// view both are jumped, settled and drawn level, then shot, and the two pictures are compared pixel by pixel:
// how many differ, by how much at most, and where (a picture of the differences beside the two shots).
//
// Prereq: a server for each build (a dev server in each worktree). Usage:
//   node src/projects/aland-drive/tools/frame-diff.mjs --a=<url of the build before> --b=<url of the build after>
//     [--keys=1,2,...,0] [--size=3440x1440] [--folder=<tiles>] [--out=<folder>] [--hour=11] [name:east,north,height,yaw,pitch ...]
// Positions are ETRS-TM35FIN metres, as `tools/look.mjs` takes them. A view that differs in nothing says so; one that
// differs says how many pixels and the largest channel difference, and the pictures in --out show where.

/* eslint-disable security/detect-non-literal-fs-filename -- a localhost tool writing the pictures it was told to */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openGame } from "./game-page.mjs";
import { serveTiles } from "./serve-tiles.mjs";

const option = (name, otherwise) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? otherwise;
const A = option("a", "");
const B = option("b", "");
if (!A || !B) throw new Error("frame-diff needs --a=<url> and --b=<url>, the two builds' game pages");
const [WIDTH, HEIGHT] = option("size", "3440x1440").split("x").map(Number);
const KEYS = option("keys", "1,2,3,4,5,6,7,8,9,0").split(",").filter(Boolean);
const FOLDER = option("folder", "src/projects/aland-drive/.data/tiles");
const OUT = option("out", "");
const HOUR = Number(option("hour", "11"));
/** The clock both pages start on, and the boats' clock: one moment, so every run sees the same world. */
const CLOCK = Date.parse("2026-06-21T10:00:00Z");
const SETTLE_FRAMES = 12;
const LOOKS = process.argv.slice(2).filter((arg) => !arg.startsWith("--")).map((look) => {
  const [name, place] = look.split(":");
  const [east, north, height, yaw, pitch] = place.split(",").map(Number);
  return { name, at: { east, north, height, yaw, pitch } };
});

const tiles = await serveTiles(FOLDER);
const withTiles = (base) => `${base}${base.includes("?") ? "&" : "?"}tiles=local:${tiles.port}&hour=${HOUR}`;
const ready = () => window.__alandDrive?.mapReady() === true;
const pages = [];
for (const base of [A, B]) {
  pages.push(await openGame(withTiles(base), { width: WIDTH, height: HEIGHT, ready, clock: CLOCK, cleanup: pages.length === 0 ? () => tiles.server.close() : () => {} }));
}
const [before] = pages;
for (const opened of pages) await opened.page.addStyleTag({ content: "body *:not(canvas[data-engine]) { visibility: hidden !important } canvas[data-engine] { visibility: visible !important }" });
if (OUT) mkdirSync(OUT, { recursive: true });

/** Ticks a page until what it was asked has happened, and the stream has drained. */
const tickUntil = async (opened, done) => {
  while (!(await opened.page.evaluate(done))) await opened.tick();
  while ((await opened.page.evaluate(() => window.__alandDrive.stream().loading)) > 0) await opened.tick();
};

const views = [
  ...KEYS.map((key) => ({ name: `view-${key}`, go: (opened) => opened.page.evaluate((id) => { window.__frameDiffDone = false; void window.__alandDrive.jumpTo(id).then(() => { window.__frameDiffDone = true; }); }, key) })),
  ...LOOKS.map(({ name, at }) => ({ name, go: (opened) => opened.page.evaluate((place) => { window.__frameDiffDone = true; window.__alandDrive.look(place); }, at) })),
];

const frames = async (opened) => opened.page.evaluate(() => window.__alandDrive.frames());
/** Ticks the pages until both have drawn `target` frames. */
const drawLevel = async (target) => {
  for (const opened of pages) while ((await frames(opened)) < target) await opened.tick();
};
const hold = (opened) =>
  opened.page.evaluate(({ seaSeconds, hour }) => {
    const probe = window.__alandDrive;
    probe.hold(true);
    probe.holdSea(seaSeconds);
    probe.setDay({ hour, held: true });
  }, { seaSeconds: CLOCK / 1000, hour: HOUR });

// Every clock the game keeps moves by the frame, so once both pages have drawn the same number of frames their clocks
// agree, however many ticks each spent loading before its first frame. The clocks the hold stops (the ripples', the
// indicators') keep the value the hold found, so the pages are drawn level before the first hold, and stay held after.
await before.step("drawing the pages level", async () => {
  await drawLevel(Math.max(...(await Promise.all(pages.map(frames)))));
  for (const opened of pages) await hold(opened);
});

let identical = 0;
for (const { name, go } of views) {
  const result = await before.step(name, async () => {
    for (const opened of pages) {
      await hold(opened);
      await go(opened);
      await tickUntil(opened, () => window.__frameDiffDone === true);
    }
    await drawLevel(Math.max(...(await Promise.all(pages.map(frames)))) + SETTLE_FRAMES);
    const drawn = await Promise.all(pages.map(frames));
    if (drawn[0] !== drawn[1]) throw new Error(`the pages drew ${drawn.join(" and ")} frames: a tick must be one frame`);
    // The page with only the game's canvas showing: nothing of the HUD, which fades and counts on its own, over it.
    const shots = [];
    for (const opened of pages) shots.push((await opened.page.screenshot({ type: "png" })).toString("base64"));
    const compared = await before.page.evaluate(async ([first, second]) => {
      const decode = async (base64) => {
        const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext("2d");
        context.drawImage(bitmap, 0, 0);
        return context.getImageData(0, 0, bitmap.width, bitmap.height);
      };
      const [a, b] = await Promise.all([decode(first), decode(second)]);
      if (a.width !== b.width || a.height !== b.height) return { differing: -1, most: 0, box: null, picture: null, pixels: 0 };
      const diff = new ImageData(a.width, a.height);
      let differing = 0;
      let most = 0;
      let [left, top, right, bottom] = [a.width, a.height, -1, -1];
      for (let at = 0; at < a.width * a.height; at++) {
        const delta = Math.max(Math.abs(a.data[at * 4] - b.data[at * 4]), Math.abs(a.data[at * 4 + 1] - b.data[at * 4 + 1]), Math.abs(a.data[at * 4 + 2] - b.data[at * 4 + 2]));
        const grey = (a.data[at * 4] + a.data[at * 4 + 1] + a.data[at * 4 + 2]) / 3;
        // The picture: the first shot faded to grey, with every differing pixel in red, brighter the more it differs.
        diff.data[at * 4] = delta > 0 ? 255 : grey * 0.4 + 60;
        diff.data[at * 4 + 1] = delta > 0 ? Math.max(0, 80 - delta * 2) : grey * 0.4 + 60;
        diff.data[at * 4 + 2] = delta > 0 ? Math.max(0, 80 - delta * 2) : grey * 0.4 + 60;
        diff.data[at * 4 + 3] = 255;
        if (delta === 0) continue;
        differing++;
        most = Math.max(most, delta);
        const x = at % a.width;
        const y = Math.floor(at / a.width);
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
      let picture = null;
      if (differing > 0) {
        const canvas = new OffscreenCanvas(a.width, a.height);
        canvas.getContext("2d").putImageData(diff, 0, 0);
        const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer());
        let binary = "";
        for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
        picture = btoa(binary);
      }
      return { differing, most, box: differing > 0 ? [left, top, right, bottom] : null, picture, pixels: a.width * a.height };
    }, shots);
    if (OUT) {
      writeFileSync(join(OUT, `${name}-a.png`), Buffer.from(shots[0], "base64"));
      writeFileSync(join(OUT, `${name}-b.png`), Buffer.from(shots[1], "base64"));
      if (compared.picture) writeFileSync(join(OUT, `${name}-diff.png`), Buffer.from(compared.picture, "base64"));
    }
    return compared;
  });
  if (result.differing === 0) {
    identical++;
    console.log(`${name}: identical, ${result.pixels.toLocaleString("en-US")} pixels`);
  } else if (result.differing < 0) {
    console.log(`${name}: the shots are different sizes`);
  } else {
    const [left, top, right, bottom] = result.box;
    console.log(`${name}: ${result.differing.toLocaleString("en-US")} pixels differ (${((result.differing / result.pixels) * 100).toFixed(3)}%), at most ${result.most} of 255 in a channel, within x ${left}-${right}, y ${top}-${bottom}`);
  }
}
console.log(`\n${identical} of ${views.length} views identical`);
for (const opened of pages) {
  const problems = opened.reported();
  if (problems) console.log(`${opened === before ? "A" : "B"} reported:\n${problems}`);
}
for (const opened of pages) await opened.close();
