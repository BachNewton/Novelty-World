// The facades' gallery: the real game on real Mariehamn tiles, with the integration applied in memory and the tiles' solids
// swapped for ones `bake.py` has assigned, so these pictures are what the integration gives. Each look is a camera at a real
// building. `--measure` swaps the art in and out and reads the GPU's timestamps in alternated pairs.
// The full Chromium is asked for by name: the default headless shell falls back to WebGL2 here.
//
//   node src/projects/aland-drive/art/facades/gallery.mjs --out=<folder> --baked=<bake.py's folder> [--size=2408x1007] [--only=a,b] [--measure] [--pairs=12] [--shimmer]

/* eslint-disable security/detect-non-literal-fs-filename -- a localhost tool writing to the folder it was told to */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
const BAKED = option("baked");
if (!OUT || !BAKED) throw new Error("--out=<folder> and --baked=<folder> are required");
const TILES = resolve(HERE, "../../.data/tiles");
const [WIDTH, HEIGHT] = (option("size") ?? "2408x1007").split("x").map(Number);
const ONLY = option("only")?.split(",");
const MEASURE = flags.includes("--measure");
const PAIRS = Number(option("pairs") ?? 12);
const SHIMMER = flags.includes("--shimmer");
const SHIMMER_STEP_M = 0.03;
const READINGS_A_SIDE = 15;
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
  const own = ["facades", "surfaces"].map((folder) => readFileSync(join(HERE, "..", folder, "tokens.css"), "utf8")).join("");
  return `<!doctype html><meta charset="utf-8"><style>:root{${tokens}}${own}html,body,#game{margin:0;width:100%;height:100%;overflow:hidden;background:#000}</style><div id="game"></div><script type="module" src="/page.js"></script>`;
}

function listen(server) {
  return new Promise((done) => {
    server.listen(0, "127.0.0.1", () => done(server.address().port));
  });
}

/** The page's files, and the tiles with a baked tile's solids in place of the built one's. */
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
    const baked = join(BAKED, path);
    const file = existsSync(baked) ? baked : join(TILES, path);
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

const looks = looksFrom(BAKED).filter(({ name }) => !ONLY || ONLY.some((wanted) => name.startsWith(wanted)));
const shots = [];
const costs = [];
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

  if (SHIMMER && look.measure) {
    // A camera moved by far less than a pixel at this range: what changes is shimmer, with the art and without it.
    const moved = {};
    for (const art of [true, false]) {
      const shot = async (by) => {
        await page.evaluate(({ at, on, by }) => {
          window.__facadesGallery.setArt(on);
          window.__alandDrive.look({ ...at, east: at.east + by });
        }, { at: look.at, on: art, by });
        await settle();
        return sharp(await page.screenshot()).removeAlpha().raw().toBuffer();
      };
      const [still, shifted] = [await shot(0), await shot(SHIMMER_STEP_M)];
      let changed = 0;
      for (let at = 0; at < still.length; at++) changed += Math.abs(still[at] - shifted[at]);
      moved[art ? "art" : "plain"] = changed / still.length;
    }
    console.log(look.name, "shimmer, mean change per channel", JSON.stringify(moved));
    await page.evaluate(() => window.__facadesGallery.setArt(true));
  }

  if (MEASURE && look.measure) {
    const cost = await page.evaluate(
      async ({ pairs, readings }) => {
        const gallery = window.__facadesGallery;
        const probe = window.__alandDrive;
        // Timestamps resolve some frames after they're drawn, so a side counts fresh readings, not frames.
        const sample = async () => {
          const seen = [];
          let last = probe.counts().gpuMs;
          const giveUp = probe.frames() + readings * 12;
          while (seen.length < readings && probe.frames() < giveUp) {
            await new Promise(requestAnimationFrame);
            const { gpuMs } = probe.counts();
            if (gpuMs !== null && gpuMs !== last) seen.push(gpuMs);
            last = gpuMs;
          }
          if (seen.length < readings) throw new Error(`only ${seen.length} GPU readings`);
          return seen.sort((a, b) => a - b)[Math.floor(seen.length / 2)];
        };
        const ratios = [];
        const plain = [];
        const dressed = [];
        for (let pair = 0; pair < pairs; pair++) {
          gallery.setArt(false);
          await sample();
          const off = await sample();
          gallery.setArt(true);
          await sample();
          const on = await sample();
          plain.push(off);
          dressed.push(on);
          ratios.push(on / off);
        }
        const middle = (list) => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)];
        const sorted = [...ratios].sort((a, b) => a - b);
        return { offMs: middle(plain), onMs: middle(dressed), ratio: middle(ratios), low: sorted[1], high: sorted[sorted.length - 2] };
      },
      { pairs: PAIRS, readings: READINGS_A_SIDE },
    );
    costs.push({ look: look.name, ...cost });
    console.log(look.name, JSON.stringify(cost));
  }
}
if (MEASURE) writeFileSync(join(OUT, "gpu-cost.json"), JSON.stringify({ adapter, size: `${WIDTH}x${HEIGHT}`, pairs: PAIRS, costs }, null, 2));
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
