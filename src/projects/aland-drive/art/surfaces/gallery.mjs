// The surfaces' gallery: the real game, on the real tiles, renderer and lighting, with the surfaces wired in by the same
// few replacements `integration.mjs` lists, so these pictures are what the integration gives. Each look is a camera at a
// place; `--measure` swaps the art in and out at each place and reads the GPU's timestamps in alternated pairs.
// The full Chromium is asked for by name: the default headless shell falls back to WebGL2 here.
//
//   node src/projects/aland-drive/art/surfaces/gallery.mjs --out=<folder> [--tiles=<tiles folder>] [--base=<folder>] [--size=3440x1440] [--only=a,b] [--measure] [--shimmer]
//
// --base is a copy of the repo's layout holding the project's code, for working while the game itself is being changed:
// this folder is copied into it and the page is built from there.

/* eslint-disable security/detect-non-literal-fs-filename -- a localhost tool writing to the folder it was told to */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";
import { serveTiles } from "../../tools/serve-tiles.mjs";
import { patchSource } from "./integration.mjs";
import { LOOKS } from "./gallery-looks.mjs";

const flags = process.argv.slice(2);
const option = (name) => flags.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../../../..");
const BASE = option("base");
const OUT = option("out");
if (!OUT) throw new Error("--out=<folder> is required");
const TILES = option("tiles") ?? resolve(HERE, "../../.data/tiles");
const [WIDTH, HEIGHT] = (option("size") ?? "3440x1440").split("x").map(Number);
const ONLY = option("only")?.split(",");
const MEASURE = flags.includes("--measure");
const SHIMMER = flags.includes("--shimmer");
const SHIMMER_STEP_M = 0.03;
const PLAIN = flags.includes("--plain");
const PAIRS = Number(option("pairs") ?? 12);
const READINGS_A_SIDE = 15;
const SETTLE_FRAMES = 8;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".map": "application/json", ".wasm": "application/wasm" };

/** The game, bundled here because the page is not on the site: the integration applied, and the worker built on its own. */
async function bundle(folder) {
  const gameParts = {
    name: "game-parts",
    setup(on) {
      on.onLoad({ filter: /render[\\/]game\.ts$/ }, ({ path }) => ({ contents: PLAIN ? readFileSync(path, "utf8") : patchSource(readFileSync(path, "utf8"), "game"), loader: "ts" }));
      on.onLoad({ filter: /render[\\/]buildings\.ts$/ }, ({ path }) => ({ contents: PLAIN ? readFileSync(path, "utf8") : patchSource(readFileSync(path, "utf8"), "buildings"), loader: "ts" }));
      on.onLoad({ filter: /render[\\/]stream\.ts$/ }, ({ path }) => ({
        contents: readFileSync(path, "utf8").replace('new URL("./tile.worker.ts", import.meta.url)', '"/tile.worker.js"'),
        loader: "ts",
      }));
    },
  };
  const art = BASE ? join(BASE, "src/projects/aland-drive/art/surfaces") : HERE;
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
  const surfaces = readFileSync(join(HERE, "tokens.css"), "utf8");
  return `<!doctype html><meta charset="utf-8"><style>:root{${tokens}}${surfaces}html,body,#game{margin:0;width:100%;height:100%;overflow:hidden;background:#000}</style><div id="game"></div><script type="module" src="/page.js"></script>`;
}

function serveBundle(folder, html) {
  const server = createServer((request, response) => {
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

console.log("page opening");
await page.goto(`http://127.0.0.1:${port}/?tiles=local:${tiles.port}`, { waitUntil: "load" });
await page.waitForFunction(() => window.__alandDrive !== undefined || window.__galleryFailure !== undefined, null, { timeout: 240000 }).catch(() => undefined);
console.log("page waited");
const failure = await page.evaluate(() => window.__galleryFailure);
const ready = await page.evaluate(() => window.__alandDrive !== undefined);
if (failure !== undefined || !ready) {
  console.log(`no game: ${failure}\n${[...new Set(problems)].slice(0, 20).join("\n")}`);
  await browser.close();
  server.close();
  tiles.server.close();
  process.exit(1);
}

const adapter = await page.evaluate(async () => {
  const found = await navigator.gpu.requestAdapter();
  return found?.info?.description || found?.info?.architecture || found?.info?.vendor;
});
console.log(`adapter: ${adapter}`);

const settle = (frames) =>
  page.evaluate(async (count) => {
    const probe = window.__alandDrive;
    const framesPass = async (wanted) => {
      const target = probe.frames() + wanted;
      while (probe.frames() < target) await new Promise(requestAnimationFrame);
    };
    await framesPass(count);
    while (probe.stream().loading > 0 && window.__galleryFailure === undefined) await new Promise(requestAnimationFrame);
    await framesPass(count);
  }, frames);

const results = [];
page.setDefaultTimeout(120000);
for (const look of LOOKS.filter(({ name }) => !ONLY || ONLY.some((wanted) => name.startsWith(wanted)))) {
  await page.evaluate(async ({ at, add }) => {
    const probe = window.__alandDrive;
    probe.hold(true);
    window.__surfacesGallery?.show(add ?? null, at);
    const worldOrigin = window.__surfacesGallery?.worldOrigin ?? { east: 110000, north: 6690000 };
    probe.loadAround({ x: at.east - worldOrigin.east, z: -(at.north - worldOrigin.north) });
    await new Promise(requestAnimationFrame);
    while (probe.stream().loading > 0 && window.__galleryFailure === undefined) await new Promise(requestAnimationFrame);
    probe.look(at);
  }, look);
  const broke = await page.evaluate(() => window.__galleryFailure);
  if (broke !== undefined) throw new Error(`${broke}\n${problems.slice(0, 10).join("\n")}`);
  console.log(`${look.name}: placed`);
  await settle(SETTLE_FRAMES);
  await page.screenshot({ path: join(OUT, `${look.name}.png`) });
  const counts = await page.evaluate(() => window.__alandDrive.counts());
  console.log(look.name, JSON.stringify(counts));

  if (SHIMMER && look.measure) {
    // A camera moved by far less than a pixel at this range: what changes is shimmer, with the art and without it.
    const shot = async (art, shifted) => {
      await page.evaluate(({ at, on, by }) => {
        window.__surfacesGallery.setArt("all", on);
        window.__alandDrive.look({ ...at, east: at.east + by });
      }, { at: look.at, on: art, by: shifted ? SHIMMER_STEP_M : 0 });
      await settle(SETTLE_FRAMES);
      return page.screenshot({ path: join(OUT, `${look.name}-${art ? "art" : "plain"}-${shifted ? "shift" : "still"}.png`) });
    };
    for (const art of [true, false]) {
      await shot(art, false);
      await shot(art, true);
    }
    await page.evaluate(() => window.__surfacesGallery.setArt("all", true));
  }

  if (MEASURE && look.measure) {
    const cost = await page.evaluate(
      async ({ pairs, readings, groups }) => {
        const gallery = window.__surfacesGallery;
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
        const report = {};
        for (const group of groups) {
          const ratios = [];
          const plain = [];
          const dressed = [];
          for (let pair = 0; pair < pairs; pair++) {
            gallery.setArt(group, false);
            await sample();
            const off = await sample();
            gallery.setArt(group, true);
            await sample();
            const on = await sample();
            plain.push(off);
            dressed.push(on);
            ratios.push(on / off);
          }
          ratios.sort((a, b) => a - b);
          plain.sort((a, b) => a - b);
          dressed.sort((a, b) => a - b);
          const mid = (list) => list[Math.floor(list.length / 2)];
          report[group] = { offMs: mid(plain), onMs: mid(dressed), ratio: mid(ratios), low: ratios[1], high: ratios[ratios.length - 2] };
        }
        return report;
      },
      { pairs: PAIRS, readings: READINGS_A_SIDE, groups: ["all", ...look.measure] },
    );
    results.push({ look: look.name, cost });
    console.log(look.name, JSON.stringify(cost));
  }
}
if (MEASURE) writeFileSync(join(OUT, "gpu-cost.json"), JSON.stringify({ adapter, size: await page.evaluate(() => window.__alandDrive.counts()), results }, null, 2));
if (problems.length > 0) console.log(`The page reported:\n${[...new Set(problems)].slice(0, 20).join("\n")}`);
await browser.close();
server.close();
tiles.server.close();
