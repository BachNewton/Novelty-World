// Renders every car on the real renderer, in WebGPU, from chase distance, side and three-quarter, and saves a contact
// sheet. Needs no dev server: it bundles its own page and serves it to itself on a port the OS picks.
//
//   node src/projects/aland-drive/art/cars/gallery.mjs <out-folder> [--car=<index>] [--size=WxH] [--detail]
//
// --detail adds the views a car is judged on up close: a tight chase, the back, braking, steered wheels, the far model
// at 60 m, and the bumper camera. The full Chromium is asked for by name: the default headless shell falls back to WebGL2.

/* eslint-disable security/detect-non-literal-fs-filename -- a localhost tool writing to the folder it was told to */

import { readFile, mkdir, writeFile, rm } from "node:fs/promises";
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
const onlyCar = option("car") === undefined ? null : Number(option("car"));
const detail = flags.includes("--detail");

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
await tab.waitForFunction(() => window.__startCarGallery !== undefined);
await tab.evaluate(async ([width, height]) => window.__startCarGallery(width, height), [WIDTH, HEIGHT]);

const cars = await tab.evaluate(() => window.__carGallery.cars());
const adapter = await tab.evaluate(async () => (await navigator.gpu.requestAdapter())?.info?.description);
console.log(`adapter: ${adapter}`);
for (const car of cars) console.log(`${car.index} ${car.name}: near ${car.near.total} (body ${car.near.body}, glass ${car.near.glass}, wheel ${car.near.wheel}), far ${car.far.total}`);

const views = (car) => {
  const shots = [
    { name: "chase", car, detail: "hero", camera: "chase" },
    { name: "side", car, detail: "hero", camera: [20, 0.3, 0, 0, 0.15, 0, 9] },
    { name: "front34", car, detail: "hero", camera: [8, 1.3, -11, 0, 0.1, 0, 11] },
    { name: "rear34", car, detail: "hero", camera: [8, 1.6, 11, 0, 0.1, 0, 11] },
  ];
  if (detail) {
    shots.push(
      { name: "chase-tight", car, detail: "hero", camera: [0, 2.15, 6.2, 0, 0.25, 0, 22] },
      { name: "back", car, detail: "hero", camera: [0, 0.5, 8, 0, 0.2, 0, 24] },
      { name: "brake", car, detail: "hero", camera: [0, 2.15, 6.2, 0, 0.25, 0, 22], lights: { brake: true, headlights: true } },
      { name: "steer", car, detail: "hero", camera: [3.5, 1.2, -5.2, 0, 0.1, -0.8, 26], steer: 0.5, roll: 0.6 },
      { name: "far", car, detail: "far", camera: [8, 2.5, 18, 0, 0.1, 0, 12] },
      { name: "hood", car, detail: "hero", camera: "hood" },
    );
  }
  return shots;
};

await mkdir(outFolder, { recursive: true });
const saved = [];
for (const car of cars) {
  if (onlyCar !== null && car.index !== onlyCar) continue;
  for (const { name, ...shot } of views(car.index)) {
    await tab.evaluate(async (s) => {
      window.__carGallery.clear();
      await window.__carGallery.shoot(s);
    }, shot);
    const path = join(outFolder, `${car.index}-${name}.png`);
    await tab.screenshot({ path });
    saved.push({ path, car: car.name, view: name });
  }
}

// The sheet is a page of the shots themselves, screenshotted whole.
const columns = detail ? 5 : 4;
const cell = Math.floor(2400 / columns);
const sheetRows = Math.ceil(saved.length / columns);
const pictures = await Promise.all(
  saved.map(async ({ path, car, view }) => {
    const data = (await readFile(path)).toString("base64");
    return `<figure><img src="data:image/png;base64,${data}"><figcaption>${car} · ${view}</figcaption></figure>`;
  }),
);
const sheetHtml = `<!doctype html><style>body{margin:0;background:#1c2a36;font:14px sans-serif;color:#f4f8fb;display:grid;grid-template-columns:repeat(${columns},${cell}px)}figure{margin:0;position:relative}img{display:block;width:100%}figcaption{position:absolute;left:6px;top:4px;text-shadow:0 0 3px #000}</style>${pictures.join("")}`;
const sheet = await browser.newPage({ viewport: { width: cell * columns, height: 300 }, deviceScaleFactor: 1 });
await sheet.setContent(sheetHtml, { waitUntil: "load" });
const sheetPath = join(outFolder, "contact-sheet.png");
await sheet.screenshot({ path: sheetPath, fullPage: true });
console.log(`${saved.length} shots (${sheetRows} rows): ${sheetPath}`);

if (problems.length > 0) console.log(`The page reported:\n${[...new Set(problems)].slice(0, 20).join("\n")}`);
await browser.close();
server.close();
await rm(bundleDir, { recursive: true, force: true });
await writeFile(join(outFolder, "cars.json"), JSON.stringify(cars, null, 2));
