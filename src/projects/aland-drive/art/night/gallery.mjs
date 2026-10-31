// The night's gallery: the real game on real tiles with the integration applied in memory, each place at full day, golden
// hour, dusk and deep night. `--measure` hides and shows the night's own draws in alternated pairs and reads the GPU's
// timestamps: context, never proof. The full Chromium is asked for by name: the default headless shell falls back to WebGL2.
//
//   node src/projects/aland-drive/art/night/gallery.mjs --out=<folder> [--size=2408x1007] [--only=a,b] [--hours=day,night] [--measure] [--pairs=8]

/* eslint-disable security/detect-non-literal-fs-filename -- a localhost tool writing to the folder it was told to */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";
import sharp from "sharp";
import { patchSource } from "./integration.mjs";

const flags = process.argv.slice(2);
const option = (name) => flags.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../../../..");
const OUT = option("out");
if (!OUT) throw new Error("--out=<folder> is required");
const TILES = resolve(HERE, "../../.data/tiles");
const [WIDTH, HEIGHT] = (option("size") ?? "1600x670").split("x").map(Number);
const ONLY = option("only")?.split(",");
const HOURS = option("hours")?.split(",") ?? ["day", "golden", "dusk", "night"];
const MEASURE = flags.includes("--measure");
const PAIRS = Number(option("pairs") ?? 8);
const READINGS_A_SIDE = 12;
const SETTLE_FRAMES = 6;
const SHEET_CELL_WIDTH = 640;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".wasm": "application/wasm", ".json": "application/json", ".webp": "image/webp", ".png": "image/png" };

const toRad = (deg) => (deg * Math.PI) / 180;
const at = (east, north, height, bearingDeg, pitchDeg = 2) => ({ east, north, height, yaw: -toRad(bearingDeg), pitch: toRad(pitchDeg) });

const VIEWS = [
  { name: "esplanade", at: at(107940, 6683264, 2.6, 268), seconds: 3 },
  { name: "sodragatan", at: at(107880, 6683073, 2.6, 92, 3), seconds: 3 },
  { name: "vasterhamn", at: at(106930, 6683290, 7, 240, 1), seconds: 4.2 },
  { name: "country-chase", chaseAlong: 1400, seconds: 2 },
  { name: "lighthouse", at: at(127020, 6682800, 14, 58, 2), seconds: 1.2 },
  { name: "aurora-north", at: at(106200, 6716000, 120, 6, 6), seconds: 40, aurora: 1 },
];

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
  const own = readFileSync(join(HERE, "tokens.css"), "utf8");
  return `<!doctype html><meta charset="utf-8"><style>:root{${tokens}}${own}html,body,#game{margin:0;width:100%;height:100%;overflow:hidden;background:#000}</style><div id="game"></div><script type="module" src="/page.js"></script>`;
}

const listen = (server) => new Promise((done) => server.listen(0, "127.0.0.1", () => done(server.address().port)));

function serveFolder(folder, html, cors) {
  return createServer((request, response) => {
    if (cors) response.setHeader("Access-Control-Allow-Origin", "*");
    const path = normalize(decodeURIComponent(new URL(request.url, "http://localhost").pathname));
    if (html && (path === "/" || path === "\\")) {
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
}

mkdirSync(join(OUT, ".bundle"), { recursive: true });
await bundle(join(OUT, ".bundle"));
const pageServer = serveFolder(join(OUT, ".bundle"), pageHtml(), false);
const tileServer = serveFolder(TILES, null, true);
const [pagePort, tilePort] = [await listen(pageServer), await listen(tileServer)];

const browser = await chromium.launch({
  channel: "chromium",
  headless: true,
  // Uncapped, frames outrun the GPU by seconds of queued work and a timestamp arrives long after its frame, so measuring runs capped.
  args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--enable-gpu", ...(MEASURE ? [] : ["--disable-gpu-vsync", "--disable-frame-rate-limit"])],
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
await page.waitForFunction(() => window.__nightGallery !== undefined || window.__nightFailure !== undefined, null, { timeout: 240000 }).catch(() => undefined);
const failure = await page.evaluate(() => window.__nightFailure);
if (failure !== undefined || !(await page.evaluate(() => window.__nightGallery !== undefined))) {
  console.log(`no game: ${failure}\n${[...new Set(problems)].slice(0, 12).join("\n").slice(0, 6000)}`);
  await close();
  process.exit(1);
}
const adapter = await page.evaluate(async () => {
  const found = await navigator.gpu.requestAdapter();
  return found?.info?.description || found?.info?.architecture || found?.info?.vendor;
});
console.log(`adapter: ${adapter}; ${JSON.stringify(await page.evaluate(() => window.__nightGallery.instances))}`);

const settle = () =>
  page.evaluate(async (count) => {
    const probe = window.__alandDrive;
    const pass = async () => {
      const target = probe.frames() + count;
      while (probe.frames() < target) await new Promise(requestAnimationFrame);
    };
    await pass();
    while (probe.stream().loading > 0 && window.__nightFailure === undefined) await new Promise(requestAnimationFrame);
    await pass();
  }, SETTLE_FRAMES);

const place = (view) =>
  page.evaluate(async (wanted) => {
    const probe = window.__alandDrive;
    probe.hold(true);
    if (wanted.at) {
      const origin = { east: 110000, north: 6690000 };
      probe.setCamera("free");
      probe.loadAround({ x: wanted.at.east - origin.east, z: -(wanted.at.north - origin.north) });
    } else {
      probe.loadAround(null);
      probe.setCamera("chase");
      probe.startRoute(0, 40, wanted.chaseAlong);
      probe.advance(600);
    }
    await new Promise(requestAnimationFrame);
    while (probe.stream().loading > 0 && window.__nightFailure === undefined) await new Promise(requestAnimationFrame);
    window.__nightGallery.show(wanted);
  }, view);

const views = VIEWS.filter(({ name }) => !ONLY || ONLY.includes(name));
const shots = [];
for (const view of views) {
  await place(view);
  for (const hour of HOURS) {
    await page.evaluate((look) => window.__nightGallery.setHour(look), hour);
    await settle();
    const path = join(OUT, `${view.name}-${hour}.png`);
    await page.screenshot({ path });
    shots.push({ path, label: `${view.name} ${hour}` });
  }
  const counts = await page.evaluate(() => window.__alandDrive.counts());
  console.log(view.name, JSON.stringify({ drawCalls: counts.drawCalls, triangles: counts.triangles, gpuMs: counts.gpuMs }));

  if (MEASURE) {
    await page.evaluate(() => window.__nightGallery.setHour("night"));
    const cost = await page.evaluate(
      async ({ pairs, readings }) => {
        const probe = window.__alandDrive;
        const gallery = window.__nightGallery;
        const side = async (drawn) => {
          gallery.setDrawn(drawn);
          const skip = probe.frames() + 6;
          while (probe.frames() < skip) await new Promise(requestAnimationFrame);
          const times = [];
          while (times.length < readings) {
            await new Promise(requestAnimationFrame);
            const { gpuMs } = probe.counts();
            if (gpuMs) times.push(gpuMs);
          }
          return times.sort((a, b) => a - b)[times.length >> 1];
        };
        const ratios = [];
        const differences = [];
        for (let pair = 0; pair < pairs; pair++) {
          const first = pair % 2 === 0;
          const a = await side(first);
          const b = await side(!first);
          const [drawn, hidden] = first ? [a, b] : [b, a];
          differences.push(drawn - hidden);
          ratios.push(drawn / hidden);
        }
        gallery.setDrawn(true);
        differences.sort((a, b) => a - b);
        ratios.sort((a, b) => a - b);
        return { medianMs: differences[pairs >> 1], low: differences[0], high: differences.at(-1), ratio: ratios[pairs >> 1] };
      },
      { pairs: PAIRS, readings: READINGS_A_SIDE },
    );
    console.log(view.name, "night's draws cost, pairs", JSON.stringify(cost));
  }
}

await close();
if (problems.length > 0) console.log(`problems:\n${[...new Set(problems)].slice(0, 12).join("\n").slice(0, 4000)}`);

const columns = HOURS.length;
const cellHeight = Math.round((SHEET_CELL_WIDTH * HEIGHT) / WIDTH);
const cells = await Promise.all(
  shots.map(async ({ path, label }, index) => {
    const caption = Buffer.from(`<svg width="${SHEET_CELL_WIDTH}" height="26"><rect width="100%" height="100%" fill="black" fill-opacity="0.55"/><text x="8" y="18" font-family="sans-serif" font-size="15" fill="white">${label}</text></svg>`);
    const input = await sharp(path).resize(SHEET_CELL_WIDTH, cellHeight).composite([{ input: caption, gravity: "north" }]).toBuffer();
    return { input, left: (index % columns) * SHEET_CELL_WIDTH, top: Math.floor(index / columns) * cellHeight };
  }),
);
const sheet = join(OUT, "contact-sheet.png");
await sharp({ create: { width: columns * SHEET_CELL_WIDTH, height: Math.ceil(shots.length / columns) * cellHeight, channels: 3, background: "black" } }).composite(cells).png().toFile(sheet);
console.log(sheet);
