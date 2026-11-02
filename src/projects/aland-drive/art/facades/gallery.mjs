// The facades' gallery: the real game on built tiles, each style at a real building's door, and the models the game doesn't
// stand yet (churches, fuel stations, villas' add-ons) placed in the world. The tiles must be built with the facades.
// The full Chromium is asked for by name: the default headless shell falls back to WebGL2 here.
//
//   node src/projects/aland-drive/art/facades/gallery.mjs --out=<folder> [--tiles=<built tiles>] [--size=2408x1007] [--only=a,b]

/* eslint-disable security/detect-non-literal-fs-filename -- a localhost tool writing to the folder it was told to */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";
import sharp from "sharp";
import { looksFrom } from "./gallery-looks.mjs";
import { patchSource } from "./integration.mjs";

const flags = process.argv.slice(2);
const option = (name) => flags.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../../../..");
const OUT = option("out");
if (!OUT) throw new Error("--out=<folder> is required");
const TILES = resolve(option("tiles") ?? resolve(HERE, "../../.data/tiles"));
const [WIDTH, HEIGHT] = (option("size") ?? "2408x1007").split("x").map(Number);
const ONLY = option("only")?.split(",");
const SETTLE_FRAMES = 8;
const SHEET_COLUMNS = 4;
const SHEET_CELL_WIDTH = 800;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".wasm": "application/wasm", ".json": "application/json", ".webp": "image/webp", ".png": "image/png" };

async function bundle(folder) {
  const gameParts = {
    name: "game-parts",
    setup(on) {
      on.onLoad({ filter: /render[\\/]game\.ts$/ }, ({ path }) => ({ contents: patchSource(readFileSync(path, "utf8"), "game"), loader: "ts" }));
      on.onLoad({ filter: /render[\\/]buildings\.ts$/ }, ({ path }) => ({ contents: patchSource(readFileSync(path, "utf8"), "buildings"), loader: "ts" }));
      on.onLoad({ filter: /render[\\/]stream\.ts$/ }, ({ path }) => ({ contents: readFileSync(path, "utf8").replace('new URL("./tile.worker.ts", import.meta.url)', '"/tile.worker.js"'), loader: "ts" }));
    },
  };
  await build({
    entryPoints: { page: join(HERE, "gallery-page.ts"), "tile.worker": join(HERE, "../../render/tile.worker.ts") },
    outdir: folder,
    bundle: true,
    format: "esm",
    target: "esnext",
    tsconfig: join(REPO, "tsconfig.json"),
    define: { "process.env.NEXT_PUBLIC_SUPABASE_URL": '"http://unused.localhost"' },
    plugins: [gameParts],
    logLevel: "warning",
  });
}

function pageHtml() {
  const globals = readFileSync(join(REPO, "src/app/globals.css"), "utf8");
  const tokens = [...globals.matchAll(/--color-aland-drive-[\w-]+:\s*[^;]+;/g)].map(([line]) => line).join("");
  return `<!doctype html><meta charset="utf-8"><style>:root{${tokens}}html,body,#game{margin:0;width:100%;height:100%;overflow:hidden;background:#000}</style><div id="game"></div><script type="module" src="/page.js"></script>`;
}

function listen(server) {
  return new Promise((done) => {
    server.listen(0, "127.0.0.1", () => done(server.address().port));
  });
}

/** The page's files, and the tiles. */
function servers(folder, html) {
  const page = createServer((request, response) => {
    const path = new URL(request.url, "http://localhost").pathname;
    if (path === "/") {
      response.writeHead(200, { "Content-Type": TYPES[".html"] }).end(html);
      return;
    }
    const file = join(folder, path);
    if (!existsSync(file)) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
  });
  const tiles = createServer((request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    const path = normalize(decodeURIComponent(new URL(request.url, "http://localhost").pathname));
    const file = join(TILES, path);
    if (!existsSync(file)) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
  });
  return { page, tiles };
}

mkdirSync(join(OUT, ".bundle"), { recursive: true });
await bundle(join(OUT, ".bundle"));
const { page: pageServer, tiles: tileServer } = servers(join(OUT, ".bundle"), pageHtml());
const [pagePort, tilePort] = [await listen(pageServer), await listen(tileServer)];

const browser = await chromium.launch({
  channel: "chromium",
  headless: true,
  args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--enable-gpu", "--disable-gpu-vsync", "--disable-frame-rate-limit"],
});
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
page.setDefaultTimeout(240000);
const problems = [];
page.on("console", (message) => {
  if (message.type() === "error" || message.type() === "warning") problems.push(`${message.type()}: ${message.text()}`);
});
page.on("pageerror", (error) => problems.push(`thrown: ${error.stack ?? error.message}`));

const close = async () => {
  await browser.close();
  pageServer.close();
  tileServer.close();
};

await page.goto(`http://127.0.0.1:${pagePort}/?tiles=local:${tilePort}`, { waitUntil: "load" });
await page.waitForFunction(() => window.__facadesGallery !== undefined || window.__facadesFailure !== undefined, null, { timeout: 240000 }).catch(() => undefined);
const failure = await page.evaluate(() => window.__facadesFailure);
if (failure !== undefined || !(await page.evaluate(() => window.__facadesGallery !== undefined))) {
  console.log(`no game: ${failure}\n${[...new Set(problems)].slice(0, 12).join("\n").slice(0, 6000)}`);
  await close();
  process.exit(1);
}
const adapter = await page.evaluate(async () => {
  const found = await navigator.gpu.requestAdapter();
  return found?.info?.description || found?.info?.architecture || found?.info?.vendor;
});
console.log(`adapter: ${adapter}`);

const settle = () =>
  page.evaluate(async (count) => {
    const probe = window.__alandDrive;
    const pass = async () => {
      const target = probe.frames() + count;
      while (probe.frames() < target) await new Promise(requestAnimationFrame);
    };
    await pass();
    while (probe.stream().loading > 0 && window.__facadesFailure === undefined) await new Promise(requestAnimationFrame);
    await pass();
  }, SETTLE_FRAMES);

const looks = looksFrom().filter(({ name }) => !ONLY || ONLY.some((wanted) => name.startsWith(wanted)));
const shots = [];
for (const look of looks) {
  await page.evaluate(async ({ at, stage, door }) => {
    const probe = window.__alandDrive;
    const gallery = window.__facadesGallery;
    probe.hold(true);
    const origin = { east: 110000, north: 6690000 };
    probe.loadAround({ x: at.east - origin.east, z: -(at.north - origin.north) });
    await new Promise(requestAnimationFrame);
    while (probe.stream().loading > 0 && window.__facadesFailure === undefined) await new Promise(requestAnimationFrame);
    probe.look(door ? gallery.doorLook(door) : at);
    if (stage) gallery.showStage(stage);
    else gallery.models();
  }, look);
  await settle();
  const path = join(OUT, `${look.name}.png`);
  await page.screenshot({ path });
  shots.push({ path, label: look.name });
  const counts = await page.evaluate(() => window.__alandDrive.counts());
  console.log(look.name, JSON.stringify({ drawCalls: counts.drawCalls, triangles: counts.triangles, gpuMs: counts.gpuMs }));

}
console.log("models", JSON.stringify(await page.evaluate(() => window.__facadesGallery.counts())));
if (problems.length > 0) console.log(`The page reported:\n${[...new Set(problems)].slice(0, 12).join("\n").slice(0, 4000)}`);
await close();

const cellHeight = Math.round((SHEET_CELL_WIDTH * HEIGHT) / WIDTH);
const cells = await Promise.all(
  shots.map(async ({ path, label }, at) => {
    const caption = Buffer.from(`<svg width="${SHEET_CELL_WIDTH}" height="30"><rect width="100%" height="100%" fill="black" fill-opacity="0.55"/><text x="8" y="21" font-family="sans-serif" font-size="18" fill="white">${label}</text></svg>`);
    const input = await sharp(path).resize(SHEET_CELL_WIDTH, cellHeight).composite([{ input: caption, gravity: "north" }]).toBuffer();
    return { input, left: (at % SHEET_COLUMNS) * SHEET_CELL_WIDTH, top: Math.floor(at / SHEET_COLUMNS) * cellHeight };
  }),
);
const sheet = join(OUT, "contact-sheet.png");
await sharp({ create: { width: SHEET_COLUMNS * SHEET_CELL_WIDTH, height: Math.ceil(shots.length / SHEET_COLUMNS) * cellHeight, channels: 3, background: "black" } }).composite(cells).png().toFile(sheet);
console.log(sheet);
