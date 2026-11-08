// What a frame of the game costs, counted (`tools/gpu-meter.mjs`): at each showcase view, or looks of one's own, the
// draw calls, the triangles and vertex shader invocations (indirect draws read back from the GPU, so the forest and the
// plantings count), the fragments shaded and the overdraw, the compute invocations that pick the plantings, and the
// bytes uploaded, all for one frame held still. The same on every run: a change is judged by the difference, exact.
// The GPU's time for the frame is printed beside them as context only, never as the evidence (the repo's speed rule).
//
// Prereq: a dev server. Usage:
//   node src/projects/aland-drive/tools/frame-cost.mjs [--size=3440x1440] [--keys=1,2,...,0] [--folder=<tiles>]
//     [--draws] [--list] [--top=14] [--image=<folder>] [--save=<file.json>] [--against=<file.json>] [--fragments=written|rasterized|none]
//     [--hour=11] [name:east,north,height,yaw,pitch ...]
// --draws attributes the frame's fragments to each draw and so to each pipeline, redrawing the held frame once per draw
// (a minute or two a view at 3440×1440), and --list prints every draw of the scene pass. --image saves each view's overdraw as a picture beside a screenshot of it.
// --save keeps the run as JSON and --against prints each view's change from a saved run. Positions are ETRS-TM35FIN
// metres, as `tools/look.mjs` takes them. ALAND_DRIVE_URL overrides the page's address.

/* eslint-disable security/detect-non-literal-fs-filename -- a localhost tool reading and writing the files it was told to */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openGame, settleFrames } from "./game-page.mjs";
import { byPipeline, change, count, installGpuMeter, totalsOf } from "./gpu-meter.mjs";
import { serveTiles } from "./serve-tiles.mjs";

const option = (name, otherwise) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? otherwise;
const flag = (name) => process.argv.includes(`--${name}`);
const [WIDTH, HEIGHT] = option("size", "3440x1440").split("x").map(Number);
const KEYS = option("keys", "1,2,3,4,5,6,7,8,9,0").split(",").filter(Boolean);
const FOLDER = option("folder", "src/projects/aland-drive/.data/tiles");
const DRAWS = flag("draws");
const IMAGES = option("image", "");
const SAVE = option("save", "");
const AGAINST = option("against", "");
const STENCIL = option("fragments", "written");
const LIST = flag("list");
const TOP = Number(option("top", "14"));
const HOUR = Number(option("hour", "11"));
/** The boats' clock, held at one moment so every run sees the same boats where they are then. */
const SEA_HELD_AT = Date.parse("2026-06-21T10:00:00Z") / 1000;
const SETTLE_FRAMES = 30;
const GPU_SAMPLES = 20;
const PAGE = process.env.ALAND_DRIVE_URL ?? "http://localhost:3001/games/3d-games/aland-drive";
const LOOKS = process.argv.slice(2).filter((arg) => !arg.startsWith("--")).map((look) => {
  const [name, place] = look.split(":");
  const [east, north, height, yaw, pitch] = place.split(",").map(Number);
  return { name, at: { east, north, height, yaw, pitch } };
});

const tiles = await serveTiles(FOLDER);
const { page, step, reported, close } = await openGame(`${PAGE}?tiles=local:${tiles.port}&hour=${HOUR}`, {
  width: WIDTH,
  height: HEIGHT,
  ready: () => window.__alandDrive?.mapReady() === true,
  cleanup: () => tiles.server.close(),
  init: installGpuMeter,
  initArg: { stencil: STENCIL },
});
if (IMAGES) mkdirSync(IMAGES, { recursive: true });

const gpu = await page.evaluate(() => window.__gpuMeter.adapterInfo());
const drawn = await page.evaluate(() => {
  const { width, height } = window.__alandDrive.counts();
  return `${width}x${height}`;
});
console.log(`${gpu?.vendor ?? "?"} ${gpu?.architecture ?? ""} ${gpu?.description ?? ""}`.trim(), `drawing ${drawn}, fragments counted as ${STENCIL}`);

const views = [...KEYS.map((key) => ({ name: `view-${key}`, go: () => page.evaluate((id) => window.__alandDrive.jumpTo(id), key) })), ...LOOKS.map(({ name, at }) => ({ name, go: () => page.evaluate((place) => window.__alandDrive.look(place), at) }))];
const run = { size: `${WIDTH}x${HEIGHT}`, gpu, stencil: STENCIL, hour: HOUR, views: {} };
const before = AGAINST ? JSON.parse(readFileSync(AGAINST, "utf8")) : null;

for (const { name, go } of views) {
  const result = await step(name, async () => {
    await page.evaluate(({ seaHeldAt, hour }) => {
      const probe = window.__alandDrive;
      probe.hold(true);
      probe.holdSea(seaHeldAt);
      probe.setDay({ hour, held: true });
    }, { seaHeldAt: SEA_HELD_AT, hour: HOUR });
    await go();
    await settleFrames(page, SETTLE_FRAMES);
    const measured = await page.evaluate(async ({ samples, draws, image }) => {
      const probe = window.__alandDrive;
      const meter = window.__gpuMeter;
      // The GPU's time as the probe reads it, a few frames old each, over a run of frames: a median, as context.
      const gpuMs = [];
      for (let frame = 0; frame < samples; frame++) {
        const { gpuMs: ms } = probe.counts();
        if (ms !== null) gpuMs.push(ms);
        await new Promise(requestAnimationFrame);
      }
      gpuMs.sort((a, b) => a - b);
      const whole = await meter.measure({ indirect: true, fragments: true, image });
      const picture = whole.picture ? await meter.heatMap(whole.picture) : null;
      const histogram = whole.picture ? meter.histogram(whole.picture) : null;
      const perDraw = draws ? await meter.measureDraws() : null;
      const { triangles: probeTriangles, drawCalls: probeDraws } = probe.counts();
      return { frame: whole.frame, picture, histogram, perDraw, probe: { triangles: probeTriangles, draws: probeDraws, gpuMsMedian: gpuMs.length > 0 ? gpuMs[Math.floor(gpuMs.length / 2)] : null }, car: probe.car().position.map(Math.round), loaded: probe.stream().loaded.length };
    }, { samples: GPU_SAMPLES, draws: DRAWS, image: Boolean(IMAGES) });
    if (IMAGES) {
      await page.screenshot({ path: join(IMAGES, `${name}.png`) });
      if (measured.picture) writeFileSync(join(IMAGES, `${name}-overdraw.png`), Buffer.from(measured.picture, "base64"));
    }
    return measured;
  });

  const totals = totalsOf(result.frame);
  const scenePass = result.frame.passes.find((pass) => pass.scene);
  const view = {
    ...totals,
    overdraw: totals.fragments === null ? null : totals.fragments / totals.pixels,
    histogram: result.histogram,
    probe: result.probe,
    car: result.car,
    loaded: result.loaded,
    pipelines: byPipeline(result.perDraw ?? scenePass?.draws ?? []),
    draws: LIST ? (result.perDraw ?? scenePass?.draws ?? []) : undefined,
  };
  run.views[name] = view;

  const was = before?.views?.[name];
  const line = (label, value, key = label) => `  ${label.padEnd(20)} ${count(value).padStart(12)}${was ? `  ${change(was[key], value)}` : ""}`;
  console.log(`
${name}: car at ${view.car.join(", ")}, ${view.loaded} tiles at detail, scene drawn ${totals.width}x${totals.height} at ${totals.sampleCount} samples${view.probe.gpuMsMedian !== null ? `, GPU ${view.probe.gpuMsMedian.toFixed(2)} ms (context only)` : ""}`);
  console.log(line("draws", view.draws === undefined ? totals.draws : totals.draws, "draws") + `  (three counts ${view.probe.draws} draws, ${count(view.probe.triangles)} triangles)`);
  console.log(line("triangles", totals.triangles));
  console.log(line("vertices", totals.vertices));
  if (totals.fragments !== null) {
    console.log(line("fragments", totals.fragments));
    console.log(`  ${"overdraw".padEnd(20)} ${view.overdraw.toFixed(3).padStart(12)}${was?.overdraw !== undefined && was.overdraw !== null ? `  ${(view.overdraw - was.overdraw >= 0 ? "+" : "") + (view.overdraw - was.overdraw).toFixed(3)}` : ""}  fragments per pixel`);
    console.log(line("covered pixels", totals.covered));
    console.log(line("samples written", totals.samples));
  }
  console.log(line("attachment bytes", totals.attachmentBytes) + `  (scene pass ${count(totals.sceneAttachmentBytes)})`);
  console.log(line("compute invocations", totals.computeInvocations));
  console.log(line("dispatches", totals.dispatches));
  console.log(line("upload bytes", totals.uploadBytes));
  console.log(line("pipeline sets", totals.pipelineSets));
  console.log(line("bind group sets", totals.bindGroupSets));
  for (const other of totals.otherPasses) console.log(`  other pass ${other.index}${other.canvas ? " (canvas)" : ""}: ${other.draws} draws, ${count(other.fragments)} fragments, ${other.width}x${other.height} at ${other.sampleCount} samples, ${count(other.attachmentBytes)} attachment bytes`);
  if (view.histogram) console.log(`  overdraw histogram   ${view.histogram.map((pixelsAt, depth) => `${depth}:${((pixelsAt / totals.pixels) * 100).toFixed(1)}%`).join(" ")}`);
  const top = [...view.pipelines].sort((a, b) => (DRAWS ? b.fragments - a.fragments : b.vertices - a.vertices)).slice(0, TOP);
  if (top.length > 0) {
    console.log(`  ${DRAWS ? "by fragments" : "by vertices"}: ${"draws".padStart(5)} ${"triangles".padStart(11)} ${"vertices".padStart(11)}${DRAWS ? ` ${"fragments".padStart(11)}` : ""}  pipeline`);
    for (const group of top) {
      const previous = was?.pipelines?.find((entry) => entry.label === group.label && entry.inputs === group.inputs);
      const delta = previous ? `  ${DRAWS ? change(previous.fragments, group.fragments) : change(previous.vertices, group.vertices)}` : "";
      console.log(`  ${"".padEnd(12)}  ${String(group.draws).padStart(5)} ${count(group.triangles).padStart(11)} ${count(group.vertices).padStart(11)}${DRAWS ? ` ${count(group.fragments).padStart(11)}` : ""}  ${group.label || "(unnamed)"} [${group.inputs}]${delta}`);
    }
  }
  if (LIST) {
    console.log(`  every draw: ${"index".padStart(5)} ${"count".padStart(9)} ${"inst".padStart(6)} ${"triangles".padStart(10)} ${"vertices".padStart(10)}${DRAWS ? ` ${"fragments".padStart(10)}` : ""}  pipeline`);
    for (const entry of view.draws) console.log(`  ${"".padEnd(12)}${String(entry.index).padStart(5)} ${count(entry.count).padStart(9)} ${count(entry.instances).padStart(6)} ${count(entry.triangles).padStart(10)} ${count(entry.vertices).padStart(10)}${DRAWS ? ` ${count(entry.fragments).padStart(10)}` : ""}  ${entry.label}${entry.indirect ? " (indirect)" : ""}`);
  }
}

if (SAVE) {
  writeFileSync(SAVE, JSON.stringify(run, null, 1));
  console.log(`\nsaved ${SAVE}`);
}
const problems = reported();
if (problems) console.log(`\nThe page reported:\n${problems}`);
await close();
