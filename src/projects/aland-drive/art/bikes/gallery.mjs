// Renders every bike on the real renderer, in WebGPU, with its rider through the ways of riding, and saves a contact
// sheet. Needs no dev server: it bundles its own page and serves it to itself on a port the OS picks.
//
//   node src/projects/aland-drive/art/bikes/gallery.mjs <out-folder> [--bike=<index>] [--size=WxH]
//
// The full Chromium is asked for by name: the default headless shell falls back to WebGL2.

/* eslint-disable security/detect-non-literal-fs-filename -- a localhost tool writing to the folder it was told to */

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../../..");
const flags = process.argv.slice(2).filter((arg) => arg.startsWith("--"));
const outFolder = resolve(process.argv.slice(2).find((arg) => !arg.startsWith("--")) ?? ".");
const option = (name) => flags.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const [WIDTH, HEIGHT] = (option("size") ?? "2408x1007").split("x").map(Number);
const onlyBike = option("bike") === undefined ? null : Number(option("bike"));

const bundleDir = join(outFolder, ".bundle");
await mkdir(bundleDir, { recursive: true });
await build({
  entryPoints: [join(here, "gallery-page.ts")],
  bundle: true,
  format: "esm",
  outfile: join(bundleDir, "gallery.js"),
  tsconfig: join(root, "tsconfig.json"),
  logLevel: "warning",
});

const globals = await readFile(join(root, "src/app/globals.css"), "utf8");
const tokens = globals.match(/--color-aland-drive-[a-z-]+:[^;]+;/g).join("\n");
const page = `<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><style>:root{${tokens}}html,body{margin:0;background:#000;overflow:hidden}</style><link rel="stylesheet" href="/gallery.css"><script type="module" src="/gallery.js"></script>`;

const server = createServer(async (request, response) => {
  if (request.url === "/") {
    response.writeHead(200, { "content-type": "text/html" }).end(page);
    return;
  }
  const name = request.url === "/gallery.js" ? "gallery.js" : request.url === "/gallery.css" ? "gallery.css" : null;
  if (name === null) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { "content-type": name.endsWith(".js") ? "text/javascript" : "text/css" }).end(await readFile(join(bundleDir, name)));
});
await new Promise((ready) => server.listen(0, "127.0.0.1", ready));
const address = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({
  channel: "chromium",
  headless: true,
  args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--enable-gpu", "--disable-gpu-vsync", "--disable-frame-rate-limit"],
});
const tab = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
const problems = [];
tab.on("console", (message) => {
  if (message.type() === "error" || message.type() === "warning") problems.push(`${message.type()}: ${message.text()}`);
});
tab.on("pageerror", (error) => problems.push(`thrown: ${error.stack ?? error.message}`));
await tab.goto(address, { waitUntil: "load" });
await tab.waitForFunction(() => window.__startBikeGallery !== undefined);
await tab.evaluate(async ([width, height]) => window.__startBikeGallery(width, height), [WIDTH, HEIGHT]);

const bikes = await tab.evaluate(() => window.__bikeGallery.bikes());
const adapter = await tab.evaluate(async () => (await navigator.gpu.requestAdapter())?.info?.description);
console.log(`adapter: ${adapter}`);
for (const bike of bikes) console.log(`${bike.index} ${bike.name}: near ${bike.near} (bike ${bike.nearBike}), far ${bike.far}`);

const SIDE = [9, 0.95, 0, 0, 0.95, 0, 16];
const views = (bike) => [
  { name: "side", detail: "near", camera: SIDE, riders: [{ bike, seed: bike * 3 + 1 }] },
  { name: "bare", detail: "near", camera: [-7, 1.2, -6, 0, 0.6, 0, 14], riders: [{ bike, rider: false, ride: { steer: 0.3 } }] },
  { name: "front34", detail: "near", camera: [3.4, 1.4, -5.5, 0, 0.9, 0, 22], riders: [{ bike, seed: bike * 3 + 2, helmet: true, ride: { steer: -0.2, lean: 0.05 } }] },
  { name: "chase", detail: "near", camera: "chase", riders: [{ bike, seed: bike * 3 + 3, ride: { lean: 0.32, steer: 0.1 } }] },
  { name: "stand", detail: "near", camera: [5.5, 1.1, -3.5, 0, 0.95, 0, 20], riders: [{ bike, seed: bike * 3 + 4, motion: { stand: 1, crank: 0.9 }, ride: { effort: 1, speedMS: 4 } }] },
  { name: "coast", detail: "near", camera: SIDE, riders: [{ bike, seed: bike * 3 + 5, motion: { coast: 1, crank: 0 }, ride: { effort: 0, headYaw: 0.8 } }] },
  { name: "stop", detail: "near", camera: [-3.4, 1.3, -6, 0, 0.8, 0, 18], riders: [{ bike, seed: bike * 3 + 6, motion: { stop: 1, crank: -0.75 }, ride: { speedMS: 0, effort: 0 } }] },
  { name: "far", detail: "far", camera: SIDE, riders: [{ bike, seed: bike * 3 + 1 }] },
];

await mkdir(outFolder, { recursive: true });
const saved = [];
for (const bike of bikes) {
  if (onlyBike !== null && bike.index !== onlyBike) continue;
  for (const { name, ...shot } of views(bike.index)) {
    await tab.evaluate(async (s) => window.__bikeGallery.shoot(s), shot);
    const path = join(outFolder, `${bike.index}-${name}.png`);
    await tab.screenshot({ path });
    saved.push({ path, label: `${bike.name} · ${name}` });
  }
}

// The whole family, near and at the distance a car meets them, and the first-person view.
const line = (detail, seedFrom) => bikes.flatMap((bike) => [0, 1].map((at) => ({ bike: bike.index, x: (bike.index * 2 + at) * 0.9 - 3.2, z: (at - bike.index) * 2.6, seed: seedFrom + bike.index * 2 + at, helmet: at === 1 })));
const shots = [
  { name: "crowd", detail: "near", camera: [0, 1.8, 13, 0, 0.8, -2, 26], riders: line("near", 10) },
  { name: "crowd-far", detail: "far", camera: [12, 3, 60, 0, 0.8, 0, 9], riders: line("far", 30) },
  { name: "first-person", detail: "near", camera: "first", riders: [{ bike: 0, seed: 1, firstPerson: true }] },
  { name: "first-person-road", detail: "near", camera: "first", riders: [{ bike: 3, seed: 1, firstPerson: true }] },
];
const costs = {};
for (const { name, ...shot } of shots) {
  costs[name] = await tab.evaluate(async (s) => window.__bikeGallery.shoot(s), shot);
  const path = join(outFolder, `${name}.png`);
  await tab.screenshot({ path });
  saved.push({ path, label: name });
}
console.log(JSON.stringify(costs));

// The sheet is a page of the shots themselves, screenshotted whole.
const columns = 8;
const cell = Math.floor(3200 / columns);
const pictures = await Promise.all(
  saved.map(async ({ path, label }) => {
    const data = (await readFile(path)).toString("base64");
    return `<figure><img src="data:image/png;base64,${data}"><figcaption>${label}</figcaption></figure>`;
  }),
);
const sheetHtml = `<!doctype html><style>body{margin:0;background:#1c2a36;font:14px sans-serif;color:#f4f8fb;display:grid;grid-template-columns:repeat(${columns},${cell}px)}figure{margin:0;position:relative;overflow:hidden;height:${Math.round(cell * 0.72)}px}img{display:block;height:100%;width:100%;object-fit:cover}figcaption{position:absolute;left:6px;top:4px;text-shadow:0 0 3px #000}</style>${pictures.join("")}`;
const sheet = await browser.newPage({ viewport: { width: cell * columns, height: 300 }, deviceScaleFactor: 1 });
await sheet.setContent(sheetHtml, { waitUntil: "load" });
const sheetPath = join(outFolder, "contact-sheet.png");
await sheet.screenshot({ path: sheetPath, fullPage: true });
console.log(`${saved.length} shots: ${sheetPath}`);

if (problems.length > 0) console.log(`The page reported:\n${[...new Set(problems)].slice(0, 20).join("\n")}`);
await browser.close();
server.close();
await rm(bundleDir, { recursive: true, force: true });
await writeFile(join(outFolder, "bikes.json"), JSON.stringify({ bikes, costs }, null, 2));
