// What a tile landing costs, without a long drive: the camera stays put and the load focus walks a circuit of the world,
// so tiles land and leave over and over on the real clock. Prints the longest frames and how many ran over 50 ms.
//
// Prereq: a page server, and a tile server. Usage (ALAND_DRIVE_URL as in look.mjs):
//   node src/projects/aland-drive/tools/landings.mjs [--size=3440x1440] [--laps=2]

import { chromium } from "playwright";

const option = (name, otherwise) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? otherwise;
const [WIDTH, HEIGHT] = option("size", "3440x1440").split("x").map(Number);
const URL = process.env.ALAND_DRIVE_URL ?? "http://localhost:3001/games/3d-games/aland-drive";

const browser = await chromium.launch({
  channel: "chromium",
  headless: true,
  args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--enable-gpu"],
});
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
await page.goto(URL, { waitUntil: "load" });
await page.waitForFunction(() => window.__alandDrive !== undefined, null, { timeout: 180000 });

const result = await page.evaluate(
  async ({ laps }) => {
    const probe = window.__alandDrive;
    probe.hold(true);
    const frame = () => new Promise(requestAnimationFrame);
    // Corners of the nine tiles' 18 km square, in the scene: each stop wants tiles the last one dropped.
    const stops = [[-15000, -9000], [-3000, -9000], [-3000, 3000], [-15000, 3000]];
    const landings = [];
    for (let lap = 0; lap < laps; lap++) {
      for (const [x, z] of stops) {
        const before = probe.stream().loads;
        probe.loadAround({ x, z });
        await frame();
        await frame();
        let last = performance.now();
        const intervals = [];
        while (probe.stream().loading > 0) {
          await frame();
          const now = performance.now();
          intervals.push(now - last);
          last = now;
        }
        for (let settle = 0; settle < 30; settle++) {
          await frame();
          const now = performance.now();
          intervals.push(now - last);
          last = now;
        }
        landings.push({ landed: probe.stream().loads - before, seconds: Math.round(intervals.reduce((sum, ms) => sum + ms, 0) / 100) / 10, worst: Math.round(Math.max(...intervals)), over50: intervals.filter((ms) => ms > 50).length, frames: intervals.length });
      }
    }
    return landings;
  },
  { laps: Number(option("laps", "2")) },
);
console.log(JSON.stringify(result));
console.log(`worst ${Math.max(...result.map((landing) => landing.worst))} ms; frames over 50 ms: ${result.reduce((sum, landing) => sum + landing.over50, 0)}`);
await browser.close();
