// What the people cost at the showcase's views: draw calls and triangles with them and without, and how many the loaded
// tiles hold. Counts decide; the screenshots are only to see that nothing went wrong.
//
// Prereq: a dev server. Usage: node src/projects/aland-drive/tools/people-count.mjs [--folder=<tiles>] [--tiles-port=<port>] [--size=3440x1440] [--keys=1,2,9] [--shots=<folder>]
// --tiles-port uses a tile server already running instead of serving the folder. ALAND_DRIVE_URL overrides the page's address.

import { chromium } from "playwright";
import { serveTiles } from "./serve-tiles.mjs";

const option = (name, otherwise) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? otherwise;
const FOLDER = option("folder", "src/projects/aland-drive/.data/tiles");
const TILES_PORT = option("tiles-port", "");
const [WIDTH, HEIGHT] = option("size", "3440x1440").split("x").map(Number);
const KEYS = option("keys", "1,2,3,4,5,6,7,8,9,0").split(",");
const SHOTS = option("shots", "");
const PAGE = process.env.ALAND_DRIVE_URL ?? "http://localhost:3001/games/3d-games/aland-drive";
const SETTLE_FRAMES = 30;

const served = TILES_PORT ? null : await serveTiles(FOLDER);
const browser = await chromium.launch({ channel: "chromium", headless: true, args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--enable-gpu"] });
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
const problems = [];
page.on("console", (message) => {
  if (message.type() === "error" || message.type() === "warning") problems.push(`${message.type()}: ${message.text()}`);
});
page.on("pageerror", (error) => problems.push(`thrown: ${error.stack ?? error.message}`));
await page.goto(`${PAGE}?tiles=local:${TILES_PORT || served.port}`, { waitUntil: "load" });
await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
await page.waitForFunction(() => window.__alandDrive !== undefined || document.body.innerText.includes("rror"), null, { timeout: 180000 }).catch(() => problems.push("no game in time"));
if (!(await page.evaluate(() => window.__alandDrive !== undefined))) {
  console.log((await page.locator("body").innerText()).slice(0, 2000));
  console.log([...new Set(problems)].slice(0, 12).join("\n"));
  await browser.close();
  served?.server.close();
  process.exit(1);
}

const settle = () =>
  page.evaluate(async (frames) => {
    const probe = window.__alandDrive;
    for (const until = probe.frames() + frames; probe.frames() < until; ) await new Promise(requestAnimationFrame);
    while (probe.stream().loading > 0) await new Promise(requestAnimationFrame);
    for (const until = probe.frames() + frames; probe.frames() < until; ) {
      probe.counts();
      await new Promise(requestAnimationFrame);
    }
    return { ...probe.counts(), people: probe.peopleCounts() };
  }, SETTLE_FRAMES);

for (const key of KEYS) {
  await page.evaluate((id) => window.__alandDrive.jumpTo(id), key);
  const counts = await settle();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/view-${key}.png` });
  await page.evaluate(() => window.__alandDrive.showPeople(false));
  const plain = await settle();
  await page.evaluate(() => window.__alandDrive.showPeople(true));
  console.log(`view ${key}: ${counts.drawCalls} draws, ${counts.triangles} triangles; without people ${plain.drawCalls} draws, ${plain.triangles} triangles; loaded ${counts.people.figures} people, ${counts.people.triangles} triangles`);
}
console.log([...new Set(problems)].slice(0, 12).join("\n") || "no errors or warnings");
await browser.close();
served?.server.close();
