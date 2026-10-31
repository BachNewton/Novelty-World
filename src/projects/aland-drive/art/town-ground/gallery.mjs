// The town ground's gallery: the real game on the real L2334E, with `integration.mjs` applied in memory, viewed from a
// driver's height. `--measure` swaps the art in and out at each measured place and reads the GPU's timestamps in alternated pairs.
// The full Chromium is asked for by name: the default headless shell falls back to WebGL2 here.
//
//   node src/projects/aland-drive/art/town-ground/gallery.mjs --out=<folder> --bake=<folder of bake_tile.py's output> [--base=<snapshot>] [--size=2408x1007] [--only=a,b] [--measure] [--shimmer]
//
// --base is a copy of the repo's layout holding the project's code, for working while the game itself is being changed.

/* eslint-disable security/detect-non-literal-fs-filename -- a localhost tool writing to the folder it was told to */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";
import { serveTiles } from "../../tools/serve-tiles.mjs";
import { patchSurfaces, patchTown } from "./integration.mjs";
import { LOOKS } from "./gallery-looks.mjs";

const flags = process.argv.slice(2);
const option = (name) => flags.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../../../..");
const BASE = option("base");
const OUT = option("out");
const BAKE = option("bake");
if (!OUT || !BAKE) throw new Error("--out=<folder> and --bake=<folder> are required");
const TILES = option("tiles") ?? resolve(HERE, "../../.data/tiles");
const [WIDTH, HEIGHT] = (option("size") ?? "2408x1007").split("x").map(Number);
const ONLY = option("only")?.split(",");
const MEASURE = flags.includes("--measure");
const SHIMMER = flags.includes("--shimmer");
const SHIMMER_STEP_M = 0.03;
const PAIRS = Number(option("pairs") ?? 10);
const READINGS_A_SIDE = 12;
const SETTLE_FRAMES = 8;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".wasm": "application/wasm" };
const CSS = ["../surfaces/tokens.css", "../street/tokens.css", "../cars/tokens.css", "./tokens.css"];

async function bundle(folder) {
  const gameParts = {
    name: "game-parts",
    setup(on) {
      on.onLoad({ filter: /render[\\/]game\.ts$/ }, ({ path }) => ({ contents: patchTown(readFileSync(path, "utf8")), loader: "ts" }));
      on.onLoad({ filter: /render[\\/]buildings\.ts$/ }, ({ path }) => ({ contents: patchSurfaces(readFileSync(path, "utf8"), "buildings"), loader: "ts" }));
      on.onLoad({ filter: /render[\\/]stream\.ts$/ }, ({ path }) => ({
        contents: readFileSync(path, "utf8").replace('new URL("./tile.worker.ts", import.meta.url)', '"/tile.worker.js"'),
        loader: "ts",
      }));
    },
  };
  const art = BASE ? join(BASE, "src/projects/aland-drive/art/town-ground") : HERE;
  if (BASE) cpSync(HERE, art, { recursive: true });
  await build({
    entryPoints: { page: join(art, "gallery-page.ts"), "tile.worker": join(art, "../../render/tile.worker.ts") },
    outdir: folder,
    bundle: true,
    format: "esm",
    target: "esnext",
    sourcemap: "inline",
    tsconfig: join(REPO, "tsconfig.json"),
    nodePaths: [join(REPO, "node_modules")],
    define: { "process.env.NEXT_PUBLIC_SUPABASE_URL": '"http://unused.localhost"' },
    plugins: [gameParts],
    logLevel: "warning",
  });
}

function pageHtml() {
  const globals = readFileSync(join(REPO, "src/app/globals.css"), "utf8");
  const tokens = [...globals.matchAll(/--color-aland-drive-[\w-]+:\s*[^;]+;/g)].map(([line]) => line).join("");
  const css = CSS.map((file) => readFileSync(join(HERE, file), "utf8")).join("\n");
  return `<!doctype html><meta charset="utf-8"><style>:root{${tokens}}${css}html,body,#game{margin:0;width:100%;height:100%;overflow:hidden;background:#000}</style><div id="game"></div><script type="module" src="/page.js"></script>`;
}

function serveBundle(folder, html) {
  const server = createServer((request, response) => {
    const path = new URL(request.url, "http://localhost").pathname;
    if (path === "/") {
      response.writeHead(200, { "Content-Type": TYPES[".html"] }).end(html);
      return;
    }
    const file = path.startsWith("/town/") ? join(BAKE, path.slice("/town/".length)) : join(folder, path);
    if (!existsSync(file)) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
  });
  return new Promise((done) => {
    server.listen(0, "127.0.0.1", () => done({ server, port: server.address().port }));
  });
}

const bundled = join(OUT, ".bundle");
mkdirSync(bundled, { recursive: true });
await bundle(bundled);
const tiles = await serveTiles(TILES);
const { server, port } = await serveBundle(bundled, pageHtml());

const browser = await chromium.launch({
  channel: "chromium",
  headless: true,
  // Uncapped, frames outrun the GPU by seconds of queued work and a timestamp arrives long after its frame, so measuring runs capped.
  args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--enable-gpu", ...(MEASURE ? [] : ["--disable-gpu-vsync", "--disable-frame-rate-limit"])],
});
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
const problems = [];
page.on("console", (message) => {
  if (message.type() === "error" || message.type() === "warning") problems.push(`${message.type()}: ${message.text()}`);
});
page.on("pageerror", (error) => {
  problems.push(`thrown: ${error.stack ?? error.message}`);
  console.log(`thrown: ${error.message}`);
});

const finish = async (code) => {
  if (problems.length > 0) console.log(`The page reported:\n${[...new Set(problems)].slice(0, 12).join("\n").slice(0, 3000)}`);
  await browser.close();
  server.close();
  tiles.server.close();
  process.exit(code);
};

await page.goto(`http://127.0.0.1:${port}/?tiles=local:${tiles.port}`, { waitUntil: "load" });
await page.waitForFunction(() => window.__alandDrive !== undefined || window.__townFailure !== undefined, null, { timeout: 300000 }).catch(() => undefined);
const failure = await page.evaluate(() => window.__townFailure);
if (failure !== undefined || !(await page.evaluate(() => window.__alandDrive !== undefined))) {
  console.log(`no game: ${failure}`);
  await finish(1);
}
const adapter = await page.evaluate(async () => {
  const found = await navigator.gpu.requestAdapter();
  return found?.info?.description || found?.info?.architecture || found?.info?.vendor;
});
console.log(`adapter: ${adapter}`);

const props = JSON.parse(readFileSync(join(BAKE, "L2334E-props.json"), "utf8"));
const settle = (frames) =>
  page.evaluate(async (count) => {
    const probe = window.__alandDrive;
    const framesPass = async (wanted) => {
      const target = probe.frames() + wanted;
      while (probe.frames() < target) await new Promise(requestAnimationFrame);
    };
    await framesPass(count);
    while (probe.stream().loading > 0 && window.__townFailure === undefined) await new Promise(requestAnimationFrame);
    await framesPass(count);
  }, frames);

const results = [];
page.setDefaultTimeout(180000);
for (const look of LOOKS.filter(({ name }) => !ONLY || ONLY.some((wanted) => name.startsWith(wanted)))) {
  await page.evaluate(async ({ at, props: list }) => {
    const probe = window.__alandDrive;
    const gallery = window.__townGallery;
    probe.hold(true);
    probe.loadAround({ x: at.east - gallery.worldOrigin.east, z: -(at.north - gallery.worldOrigin.north) });
    await new Promise(requestAnimationFrame);
    while (probe.stream().loading > 0 && window.__townFailure === undefined) await new Promise(requestAnimationFrame);
    gallery.placeProps(list, at, 500);
    probe.look(at);
  }, { at: look.at, props });
  await settle(SETTLE_FRAMES);
  const broke = await page.evaluate(() => window.__townFailure);
  if (broke !== undefined) {
    console.log(broke);
    await finish(1);
  }
  await page.screenshot({ path: join(OUT, `${look.name}.png`) });
  console.log(look.name, JSON.stringify(await page.evaluate(() => window.__alandDrive.counts())));

  if (flags.includes("--before")) {
    await page.evaluate(() => window.__townGallery.setArt("all", false));
    await settle(SETTLE_FRAMES);
    await page.screenshot({ path: join(OUT, `${look.name}-before.png`) });
    await page.evaluate(() => window.__townGallery.setArt("all", true));
  }

  if (SHIMMER && look.measure) {
    // A camera moved by far less than a pixel at this range: what changes is shimmer, with the art and without it.
    for (const on of [true, false]) {
      for (const shifted of [false, true]) {
        await page.evaluate(({ at, art, by }) => {
          window.__townGallery.setArt("all", art);
          window.__alandDrive.look({ ...at, east: at.east + by });
        }, { at: look.at, art: on, by: shifted ? SHIMMER_STEP_M : 0 });
        await settle(SETTLE_FRAMES);
        await page.screenshot({ path: join(OUT, `shimmer-${look.name}-${on ? "art" : "plain"}-${shifted ? "shift" : "still"}.png`) });
      }
    }
    await page.evaluate(({ at }) => {
      window.__townGallery.setArt("all", true);
      window.__alandDrive.look(at);
    }, { at: look.at });
  }

  if (MEASURE && look.measure) {
    const cost = await page.evaluate(
      async ({ pairs, readings }) => {
        const gallery = window.__townGallery;
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
        const [ratios, plain, dressed] = [[], [], []];
        for (let pair = 0; pair < pairs; pair++) {
          gallery.setArt("all", false);
          await sample();
          const off = await sample();
          gallery.setArt("all", true);
          await sample();
          const on = await sample();
          plain.push(off);
          dressed.push(on);
          ratios.push(on / off);
        }
        const sorted = (list) => [...list].sort((a, b) => a - b);
        const mid = (list) => sorted(list)[Math.floor(list.length / 2)];
        return { offMs: mid(plain), onMs: mid(dressed), ratio: mid(ratios), low: sorted(ratios)[1], high: sorted(ratios)[ratios.length - 2] };
      },
      { pairs: PAIRS, readings: READINGS_A_SIDE },
    );
    results.push({ look: look.name, cost });
    console.log(look.name, JSON.stringify(cost));
  }
}
if (MEASURE) writeFileSync(join(OUT, "gpu-cost.json"), JSON.stringify({ adapter, size: [WIDTH, HEIGHT], results }, null, 2));
await finish(0);
