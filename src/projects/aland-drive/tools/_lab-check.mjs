import { chromium } from "playwright";

const OUT = process.argv[2];
const TILES = process.argv[3];
const browser = await chromium.launch({ channel: "chromium", headless: true, args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--enable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const problems = [];
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") problems.push(`${m.type()}: ${m.text()}`); });
page.on("pageerror", (e) => problems.push(`thrown: ${e.stack ?? e.message}`));
await page.goto(`http://localhost:3001/games/3d-games/aland-drive?forest-lab&tiles=local:${TILES}`, { waitUntil: "load" });
await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
try {
  await page.waitForFunction(() => window.__forestLab !== undefined, null, { timeout: 200000 });
  await page.waitForFunction(() => { const s = window.__forestLab.state(); return s.frames > 30 && s.loading === 0; }, null, { timeout: 200000 });
} catch (error) {
  console.log("FAILED", error.message, [...new Set(problems)].slice(0, 15).join("\n"), (await page.locator("body").innerText()).slice(0, 500));
  await browser.close();
  process.exit(1);
}
const settle = () => page.evaluate(async () => { const lab = window.__forestLab; const t = lab.state().frames + 12; while (lab.state().frames < t) await new Promise(requestAnimationFrame); });
const shot = async (name) => { await settle(); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log(name, JSON.stringify(await page.evaluate(() => window.__forestLab.state()))); };
await shot("start");
await page.evaluate(() => window.__forestLab.setView("models"));
await shot("models");
await page.evaluate(() => { window.__forestLab.setView("game"); window.__forestLab.nextWorstTree(); });
await shot("worst-tree");
const sizes = [20, 200, 330, 450, 700];
for (const metres of sizes) {
  await page.evaluate((m) => window.__forestLab.pin(m), metres);
  await shot(`pinned-${metres}`);
}
await page.evaluate(() => window.__forestLab.setView("slide"));
await shot("slide");
await page.evaluate(() => { window.__forestLab.setView("game"); window.__forestLab.blendGround(true); window.__forestLab.pin(700); });
await shot("blended-700");
await page.evaluate(() => window.__forestLab.pin(20));
await shot("blended-20");
console.log("problems:", [...new Set(problems)].slice(0, 15).join("\n"));
await browser.close();
