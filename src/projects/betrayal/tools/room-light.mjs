// Measures how bright every room is, so a room's light can be compared with the rest of the house's.
//
// Rooms are lit one at a time, by eye, and the camera has no auto-exposure, so neighbouring rooms are
// seen together: a room far brighter or darker than the others should be so on purpose. This renders
// each room on the art bench, from the four dollhouse views, with the clock frozen and the room fully
// lit (the bounce included), and measures only the room's own pixels.
//
// The mask: the page's clears of the screen are swapped for a key colour no room draws, so whatever
// still shows it is background, and the pixels within MASK_MARGIN of it (the edges blended with it)
// are left out too. The explorer standing on the prime place, and the light over it, are counted as
// part of the room, as the house shows them.
//
// For each view, over the room's pixels, from the screenshot's sRGB values:
//   - relative luminance Y in linear light (Rec. 709 weights), its mean and median;
//   - the same as perceptual lightness, CIE L* (0 black to 100 white), its mean and median;
//   - the dark spots and bright spots: Y's and L*'s 10th and 90th percentiles;
//   - the range, p90 / p10 of Y, and in stops (log2 of it);
//   - pools: the share of pixels more than POOL_STOPS stops above the median.
// A room's figures are the mean of its four views' figures.
//
// The rooms' intents (dark, normal, bright) come from the ledger in the betrayal-room-art skill. The
// normal band is Tukey's fences (quartiles ± 1.5 × the spread between them) over the median L* of the
// rooms the ledger calls normal; a normal room outside it, or a dark or bright room that isn't
// darker or brighter than it, is flagged.
//
// Prereq: a production server of the app on a free port, never the dev server on 3001, as for
// startup-perf.mjs (NEXT_DIST_DIR=... npx next build, then npx next start --port <port>).
// Usage:  BETRAYAL_URL=http://localhost:<port>/board-games/betrayal node src/projects/betrayal/tools/room-light.mjs [flags]
//   --out=<dir>         where room-light.json, room-light.html and room-light.png go (default .shots/room-light)
//   --rooms=a,b         only these rooms (default every bench room)
//   --explorer=<id>     who stands on the prime place (default the bench's first explorer)
//   --query=<params>    more of the bench's query string, e.g. --query=shine=on&shadows=soft
//   --shots             also keeps each view's screenshot, as <out>/shots/<room>-<view>.png, to see what was measured
//   --note=<text>       a line printed on the chart and kept in the JSON, e.g. what the numbers are a baseline of
//
// The output is deterministic: two runs of the same code give the same numbers.

import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const flag = (name) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const OUT = resolve(flag("out") ?? join(HERE, "..", ".shots", "room-light"));
const ONLY = flag("rooms")?.split(",");
const EXPLORER = flag("explorer");
const QUERY = flag("query");
const NOTE = flag("note") ?? null;
const KEEP_SHOTS = process.argv.includes("--shots");
const BASE = process.env.BETRAYAL_URL ?? "http://localhost:3001/board-games/betrayal";
const LEDGER = join(HERE, "..", "..", "..", "..", ".claude", "skills", "betrayal-room-art", "SKILL.md");
const VIEWPORT = { width: 1920, height: 1080 };
const VIEWS = [0, 1, 2, 3];
const FREEZE_AT = 2;
/** Pixels this close to the background are its blended edge, not the room. */
const MASK_MARGIN = 2;
/** A pixel in a pool of light is this many stops above the view's median. */
const POOL_STOPS = 2;
/** Where a percentile is pure black, the range is taken from the darkest step a screenshot has above it. */
const DARKEST_STEP = srgbToLinear(1);

function srgbToLinear(value) {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

// eslint-disable-next-line security/detect-non-literal-fs-filename -- dev-only tool writing its own output folder
mkdirSync(OUT, { recursive: true });

/** Each room's light intent, from the ledger's "Light intent" column: dark, normal or bright, and whether it is a proposal. */
function ledgerIntents() {
  const rows = readFileSync(LEDGER, "utf8")
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));
  const header = rows.find((cells) => cells.includes("Light intent"));
  if (!header) throw new Error(`The ledger in ${LEDGER} has no "Light intent" column`);
  const column = header.indexOf("Light intent");
  const intents = new Map();
  for (const cells of rows.slice(rows.indexOf(header) + 2)) {
    if (cells.length !== header.length) continue;
    const intent = /^(dark|normal|bright)/.exec(cells[column])?.[1];
    if (!intent) throw new Error(`The ledger row for ${cells[0]} has no light intent: "${cells[column]}"`);
    const id = cells[0]
      .toLowerCase()
      .replace(/'/g, "")
      .replace(/[^a-z0-9]+/g, "-");
    intents.set(id, { name: cells[0], intent, proposed: /propos/i.test(cells[column]) });
  }
  return intents;
}

/** Runs in the page before its scripts: every clear of the screen itself clears to a key colour, so the background can be told from the room. */
function keyBackground() {
  const proto = WebGL2RenderingContext.prototype;
  const clear = proto.clear;
  proto.clear = function (mask) {
    if ((mask & this.COLOR_BUFFER_BIT) === 0 || this.getParameter(this.DRAW_FRAMEBUFFER_BINDING) !== null) return clear.call(this, mask);
    const [r, g, b, a] = this.getParameter(this.COLOR_CLEAR_VALUE);
    this.clearColor(1, 0, 1, 1);
    clear.call(this, mask);
    this.clearColor(r, g, b, a);
  };
}

/** Runs in the analysis page: the statistics of one screenshot's room pixels. */
async function measure({ png, margin, poolStops, darkest }) {
  const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob(), { colorSpaceConversion: "none" });
  const { width, height } = bitmap;
  const context = new OffscreenCanvas(width, height).getContext("2d", { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0);
  const rgba = context.getImageData(0, 0, width, height).data;
  const toLinear = Array.from({ length: 256 }, (_, v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  /** CIE L*, 0 to 100, of a relative luminance. */
  const lightness = (y) => (y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (24389 / 27) * y);
  const background = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    background[i] = rgba[i * 4] === 255 && rgba[i * 4 + 1] === 0 && rgba[i * 4 + 2] === 255 ? 1 : 0;
  }
  // Grows the background by the margin, a row pass then a column pass, so the blended edge drops out.
  const grown = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let d = -margin; d <= margin; d++) {
        const nx = x + d;
        if (nx >= 0 && nx < width && background[y * width + nx]) {
          grown[y * width + x] = 1;
          break;
        }
      }
    }
  }
  const outside = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let d = -margin; d <= margin; d++) {
        const ny = y + d;
        if (ny >= 0 && ny < height && grown[ny * width + x]) {
          outside[y * width + x] = 1;
          break;
        }
      }
    }
  }
  const values = [];
  let sumY = 0;
  let sumL = 0;
  for (let i = 0; i < width * height; i++) {
    if (outside[i]) continue;
    const y = 0.2126 * toLinear[rgba[i * 4]] + 0.7152 * toLinear[rgba[i * 4 + 1]] + 0.0722 * toLinear[rgba[i * 4 + 2]];
    values.push(y);
    sumY += y;
    sumL += lightness(y);
  }
  if (values.length === 0) throw new Error("The screenshot shows no room: every pixel is background");
  const sorted = Float64Array.from(values).sort();
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  const median = at(0.5);
  const p10 = at(0.1);
  const p90 = at(0.9);
  const range = p90 / Math.max(p10, darkest);
  const poolFloor = median * 2 ** poolStops;
  let pooled = 0;
  for (const y of sorted) if (y > poolFloor) pooled++;
  return {
    pixels: sorted.length,
    coverage: sorted.length / (width * height),
    meanY: sumY / sorted.length,
    medianY: median,
    p10Y: p10,
    p90Y: p90,
    meanL: sumL / sorted.length,
    medianL: lightness(median),
    p10L: lightness(p10),
    p90L: lightness(p90),
    range,
    rangeStops: Math.log2(range),
    pools: pooled / sorted.length,
  };
}

const browser = await chromium.launch({ headless: true, args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"] });
const analysis = await browser.newPage();
await analysis.setContent("<!doctype html><title>room-light</title>");

async function openBench(room) {
  const page = await browser.newPage({ viewport: VIEWPORT });
  const failed = new Promise((_, reject) => page.on("pageerror", (error) => reject(new Error(`The bench threw while showing "${room}": ${error.stack ?? error.message}`))));
  // Raced against every shot below, which is where an error fails the run; this only keeps a rejection with no shot running from going unhandled.
  failed.catch(() => undefined);
  await page.addInitScript(keyBackground);
  await page.goto(`${BASE}?bench=${encodeURIComponent(room)}${QUERY ? `&${QUERY}` : ""}`, { waitUntil: "load" });
  // Only the 3D view counts: every bit of page chrome over it is hidden.
  await page.addStyleTag({ content: "*{visibility:hidden!important}canvas{visibility:visible!important}nextjs-portal{display:none!important}" });
  await page.waitForFunction(() => "__betrayalBench" in window, null, { timeout: 60000 });
  await page.evaluate(
    ({ explorer, frozenAt }) => {
      const bench = window.__betrayalBench;
      if (explorer) bench.setExplorer(explorer);
      bench.freezeClock(frozenAt);
      bench.setResolution(null);
    },
    { explorer: EXPLORER, frozenAt: FREEZE_AT },
  );
  return { page, failed };
}

/** One view of the room, fully lit and rendered, as a PNG in base64. */
async function shoot(page, view) {
  await page.evaluate((v) => {
    const bench = window.__betrayalBench;
    bench.setView(v);
    bench.setZoom(1);
    bench.setSubject("room");
  }, view);
  // isReady is the room fully lit (every bake pass landed, the bounce included) and the camera settled.
  await page.waitForFunction(() => window.__betrayalBench.isReady(), null, { timeout: 300000 });
  const frame = await page.evaluate(() => window.__betrayalBench.frameCount());
  await page.waitForFunction((n) => window.__betrayalBench.frameCount() >= n + 2, frame, { timeout: 10000 });
  const canvas = await page.$("canvas");
  if (!canvas) throw new Error("The bench has no canvas");
  return (await canvas.screenshot()).toString("base64");
}

const mean = (list, key) => list.reduce((sum, item) => sum + item[key], 0) / list.length;
const STATS = ["meanY", "medianY", "p10Y", "p90Y", "meanL", "medianL", "p10L", "p90L", "range", "rangeStops", "pools", "coverage"];

const intents = ledgerIntents();
const probe = await openBench("drawing-room");
const benchRooms = await probe.page.evaluate(() => window.__betrayalBench.rooms());
await probe.page.close();
const rooms = ONLY ?? benchRooms;
for (const room of rooms) if (!benchRooms.includes(room)) throw new Error(`The bench has no room "${room}"; it has: ${benchRooms.join(", ")}`);

const results = [];
for (const room of rooms) {
  const { page, failed } = await openBench(room);
  const views = [];
  for (const view of VIEWS) {
    const png = await Promise.race([shoot(page, view), failed]);
    if (KEEP_SHOTS) {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- dev-only tool writing its own output folder
      mkdirSync(join(OUT, "shots"), { recursive: true });
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- dev-only tool writing its own output folder
      writeFileSync(join(OUT, "shots", `${room}-${view}.png`), Buffer.from(png, "base64"));
    }
    views.push({ view, ...(await analysis.evaluate(measure, { png, margin: MASK_MARGIN, poolStops: POOL_STOPS, darkest: DARKEST_STEP })) });
  }
  await page.close();
  const ledger = intents.get(room);
  const average = Object.fromEntries(STATS.map((key) => [key, mean(views, key)]));
  results.push({ room, name: ledger?.name ?? room, intent: ledger?.intent ?? null, proposed: ledger?.proposed ?? false, ...average, views });
  console.log(`${room.padEnd(22)} L* median ${average.medianL.toFixed(1).padStart(5)}  p10–p90 ${average.p10L.toFixed(1)}–${average.p90L.toFixed(1)}  ${average.rangeStops.toFixed(2)} stops`);
}
await browser.close();

/** Tukey's fences over the median lightness of the rooms meant to be normal. */
function normalBand(list) {
  const medians = list.filter((r) => r.intent === "normal").map((r) => r.medianL).sort((a, b) => a - b);
  if (medians.length < 4) return null;
  const quartile = (q) => {
    const pos = (medians.length - 1) * q;
    const low = Math.floor(pos);
    return medians[low] + (medians[Math.ceil(pos)] - medians[low]) * (pos - low);
  };
  const [q1, q3] = [quartile(0.25), quartile(0.75)];
  return { low: Math.max(0, q1 - 1.5 * (q3 - q1)), high: q3 + 1.5 * (q3 - q1), q1, q3, rooms: medians.length };
}
const band = normalBand(results);
for (const result of results) {
  result.flag = null;
  if (!band || !result.intent) continue;
  const { medianL } = result;
  if (result.intent === "normal" && medianL < band.low) result.flag = "darker than the normal band";
  if (result.intent === "normal" && medianL > band.high) result.flag = "brighter than the normal band";
  if (result.intent === "dark" && medianL >= band.q1) result.flag = "meant dark, but not darker than most normal rooms";
  if (result.intent === "bright" && medianL <= band.q3) result.flag = "meant bright, but not brighter than most normal rooms";
}
results.sort((a, b) => b.medianL - a.medianL);

const report = {
  note: NOTE,
  url: BASE,
  query: QUERY ?? null,
  explorer: EXPLORER ?? "the bench's first",
  frozenAt: FREEZE_AT,
  viewport: VIEWPORT,
  views: VIEWS,
  method: {
    luminance: "relative luminance Y from the screenshot's sRGB, Rec. 709 weights, linear light",
    lightness: "CIE L*",
    percentiles: "nearest rank",
    range: "p90 / p10 of Y; a black p10 counts as one sRGB step",
    pools: `share of pixels more than ${POOL_STOPS} stops above the view's median`,
    mask: `the background and ${MASK_MARGIN} px round it left out`,
    averaging: "each figure is the mean of the views' figures",
    band: "Tukey's fences over the median L* of the rooms the ledger calls normal",
  },
  band,
  rooms: results,
};
const jsonPath = join(OUT, "room-light.json");
// eslint-disable-next-line security/detect-non-literal-fs-filename -- dev-only tool writing its own output folder
writeFileSync(jsonPath, JSON.stringify(report, null, 2) + "\n");
console.log("wrote", jsonPath);

const htmlPath = join(OUT, "room-light.html");
// eslint-disable-next-line security/detect-non-literal-fs-filename -- dev-only tool writing its own output folder
writeFileSync(htmlPath, chartPage(report));
console.log("wrote", htmlPath);

const viewer = await chromium.launch({ headless: true });
const sheet = await viewer.newPage({ viewport: { width: 1100, height: 400 }, colorScheme: "light" });
await sheet.goto(`file:///${htmlPath.replace(/\\/g, "/")}`);
const pngPath = join(OUT, "room-light.png");
await sheet.locator("figure").screenshot({ path: pngPath });
await viewer.close();
console.log("wrote", pngPath);

/** The ranked chart: each room's median lightness, its p10–p90 span, the normal band behind them, and a table. */
function chartPage({ note, band: normal, rooms: list, query }) {
  const escape = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const ROW = 22;
  const LABEL = 170;
  const PLOT = 640;
  const TOP = 28;
  const height = TOP + list.length * ROW + 8;
  const top = Math.min(100, Math.ceil(Math.max(...list.map((r) => r.p90L)) / 10) * 10);
  const x = (l) => LABEL + (l / top) * PLOT;
  const intentClass = (r) => (r.intent ? `i-${r.intent}` : "i-none");
  const ticks = Array.from({ length: top / 10 + 1 }, (_, i) => i * 10);
  const tip = (r) =>
    `${r.name}: ${r.intent ?? "no intent"}${r.proposed ? " (proposed)" : ""}. Median L* ${r.medianL.toFixed(1)}, mean L* ${r.meanL.toFixed(1)}, p10–p90 ${r.p10L.toFixed(1)}–${r.p90L.toFixed(1)}, ${r.range.toFixed(1)}× (${r.rangeStops.toFixed(2)} stops), pools ${(r.pools * 100).toFixed(1)}%.${r.flag ? ` Flag: ${r.flag}.` : ""}`;
  const rows = list
    .map((r, i) => {
      const cy = TOP + i * ROW + ROW / 2;
      return `<g class="row ${intentClass(r)}" tabindex="0"><title>${escape(tip(r))}</title>
<rect class="hit" x="0" y="${cy - ROW / 2}" width="${LABEL + PLOT + 120}" height="${ROW}"/>
<text class="name" x="${LABEL - 10}" y="${cy + 4}" text-anchor="end">${escape(r.name)}</text>
<line class="span" x1="${x(r.p10L)}" x2="${x(r.p90L)}" y1="${cy}" y2="${cy}"/>
<circle class="dot" cx="${x(r.medianL)}" cy="${cy}" r="5"/>
<text class="value" x="${LABEL + PLOT + 12}" y="${cy + 4}">${r.medianL.toFixed(1)}${r.flag ? " ◆" : ""}</text></g>`;
    })
    .join("\n");
  const bandRect = normal
    ? `<rect class="band" x="${x(normal.low)}" y="${TOP - 6}" width="${x(Math.min(top, normal.high)) - x(normal.low)}" height="${list.length * ROW + 6}"/>
<text class="axis" x="${(x(normal.low) + x(Math.min(top, normal.high))) / 2}" y="${TOP - 10}" text-anchor="middle">normal band</text>`
    : "";
  const axis = ticks
    .map((t) => `<line class="grid" x1="${x(t)}" x2="${x(t)}" y1="${TOP - 4}" y2="${height - 8}"/><text class="axis" x="${x(t)}" y="${height + 8}" text-anchor="middle">${t}</text>`)
    .join("");
  const table = list
    .map(
      (r) =>
        `<tr><td>${escape(r.name)}</td><td>${r.intent ?? "–"}${r.proposed ? " (proposed)" : ""}</td><td>${r.medianL.toFixed(1)}</td><td>${r.meanL.toFixed(1)}</td><td>${r.p10L.toFixed(1)}–${r.p90L.toFixed(1)}</td><td>${r.medianY.toFixed(4)}</td><td>${r.range.toFixed(1)}×</td><td>${r.rangeStops.toFixed(2)}</td><td>${(r.pools * 100).toFixed(1)}%</td><td>${escape(r.flag ?? "")}</td></tr>`,
    )
    .join("\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Room Brightness</title>
<style>
:root{--surface:#fcfcfb;--ink:#0b0b0b;--ink-2:#52514e;--muted:#8a8984;--grid:#e6e5e0;--band:#ecebe6;--dark:#2a78d6;--normal:#1baf7a;--bright:#eb6834;--none:#8a8984}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--surface:#1a1a19;--ink:#f0efec;--ink-2:#c3c2b7;--muted:#8d8c86;--grid:#2c2c2a;--band:#292927;--dark:#3987e5;--normal:#199e70;--bright:#d95926;--none:#8d8c86}}
:root[data-theme="dark"]{--surface:#1a1a19;--ink:#f0efec;--ink-2:#c3c2b7;--muted:#8d8c86;--grid:#2c2c2a;--band:#292927;--dark:#3987e5;--normal:#199e70;--bright:#d95926;--none:#8d8c86}
body{margin:0;padding:24px 16px;background:var(--surface);color:var(--ink);font:14px/1.45 system-ui,sans-serif}
main{max-width:1000px;margin:0 auto}
h1{font-size:20px;margin:0 0 4px}p{margin:0 0 8px;color:var(--ink-2)}
figure{margin:16px 0;padding:12px;background:var(--surface)}
.legend{display:flex;flex-wrap:wrap;gap:16px;margin:0 0 8px;color:var(--ink-2);font-size:13px}
.legend span::before{content:"";display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;background:var(--c)}
.legend .swatch-band::before{--c:var(--band);border-radius:2px;box-shadow:inset 0 0 0 1px var(--muted)}
svg{width:100%;height:auto;overflow:visible}
.grid{stroke:var(--grid);stroke-width:1}.band{fill:var(--band)}
.axis{fill:var(--muted);font-size:11px}.name{fill:var(--ink);font-size:12px}.value{fill:var(--ink-2);font-size:12px;font-variant-numeric:tabular-nums}
.hit{fill:transparent}.row:hover .hit,.row:focus .hit{fill:var(--grid)}
.span{stroke:var(--c);stroke-width:2;stroke-linecap:round;opacity:.55}.dot{fill:var(--c);stroke:var(--surface);stroke-width:2}
.i-dark{--c:var(--dark)}.i-normal{--c:var(--normal)}.i-bright{--c:var(--bright)}.i-none{--c:var(--none)}
.scroll{overflow-x:auto}table{border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums;min-width:760px}
th,td{text-align:left;padding:4px 10px 4px 0;border-bottom:1px solid var(--grid)}th{color:var(--ink-2);font-weight:600}
</style></head><body><main>
<h1>Room brightness</h1>
<p>Each room's median lightness (CIE L*, 0 black to 100 white) over its own pixels, with the line from its dark spots (10th percentile) to its bright spots (90th), averaged over the bench's four views, frozen clock, fully lit${query ? `, with <code>${escape(query)}</code>` : ", default flags"}. ◆ marks a room outside what its intent asks. Hover a row for every figure.</p>
${note ? `<p><strong>${escape(note)}</strong></p>` : ""}
<figure>
<div class="legend"><span class="i-dark">meant dark</span><span class="i-normal">meant normal</span><span class="i-bright">meant bright</span><span class="i-none">no intent in the ledger</span>${normal ? `<span class="swatch-band">normal band, L* ${normal.low.toFixed(1)}–${normal.high.toFixed(1)}</span>` : ""}</div>
<svg viewBox="0 0 ${LABEL + PLOT + 80} ${height + 24}" role="img" aria-label="Rooms ranked by median lightness">
${bandRect}${axis}
<text class="axis" x="${LABEL + PLOT / 2}" y="${height + 22}" text-anchor="middle">median L*, with p10–p90</text>
${rows}
</svg>
</figure>
<h2 style="font-size:16px">Every room</h2>
<div class="scroll"><table><thead><tr><th>Room</th><th>Intent</th><th>Median L*</th><th>Mean L*</th><th>p10–p90 L*</th><th>Median Y</th><th>p90/p10</th><th>Stops</th><th>Pools</th><th>Flag</th></tr></thead>
<tbody>${table}</tbody></table></div>
</main></body></html>
`;
}
