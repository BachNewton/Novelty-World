// Temporary: the paint system in the real game, through its menu. Deleted once the paint work is reviewed.
//   node paint-look.tmp.mjs <out-folder> <game url with ?tiles=...>

/* eslint-disable security/detect-non-literal-fs-filename -- a localhost tool writing to the folder it was told to */

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { openGame, settleFrames } from "./game-page.mjs";

const [out, base] = process.argv.slice(2);
await mkdir(out, { recursive: true });

const NIGHT = { date: { year: 2026, month: 6, day: 21 }, hour: 0.5, held: true };
const DAY = { date: { year: 2026, month: 6, day: 21 }, hour: 14, held: true };

async function chase(page, along) {
  await page.evaluate((at) => {
    const probe = window.__alandDrive;
    probe.hold(true);
    probe.setCamera("chase");
    probe.startRoute(0, 40, at);
    probe.advance(600);
  }, along);
  await settleFrames(page, 4);
}

async function run(car, shots) {
  const { page, step, close, reported } = await openGame(`${base}&car=${car}`, { width: 1600, height: 900 });
  await step("shooting", async () => {
    await page.evaluate((day) => window.__alandDrive.setDay(day), DAY);
    await chase(page, 220);
    for (const shot of shots) {
      if (shot.night !== undefined) await page.evaluate((day) => window.__alandDrive.setDay(day), shot.night ? NIGHT : DAY);
      if (shot.paint !== undefined) {
        await page.keyboard.press("Escape");
        await page.getByRole("button", { name: "Paint", exact: true }).click();
        await page.getByRole("radio", { name: shot.paint }).click();
        await settleFrames(page, 3);
        if (shot.menu) await page.screenshot({ path: join(out, `${car}-${shot.name}-menu.png`) });
        await page.getByRole("button", { name: "Back" }).click();
        await page.getByRole("button", { name: "Resume" }).click();
      }
      await settleFrames(page, 3);
      await page.screenshot({ path: join(out, `${car}-${shot.name}.png`) });
      console.log(`${car} ${shot.name}`);
    }
  });
  const problems = reported();
  if (problems) console.log(problems);
  await close();
}

await run("skerry-gt", [
  { name: "default" },
  { name: "metallic", paint: /Racing green metallic/, menu: true },
  { name: "silver", paint: /Silver metallic/ },
  { name: "matte", paint: /Graphite matte/ },
  { name: "pearl", paint: /Ivory pearl/ },
  { name: "pearl-night", night: true },
  { name: "metallic-night", paint: /Midnight metallic/ },
]);
await run("grus", [{ name: "livery", paint: /Ultramarine metallic/, menu: true }, { name: "livery-night", night: true }]);
