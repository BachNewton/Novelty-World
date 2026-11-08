// What a cold game page compiles: every WebGPU shader module and pipeline it builds, from the device's own calls, up to
// the drive settled on the e2e fixture tile. Counts, not times: the same on every run whatever the machine's load.
// Prints the render and compute pipelines, the modules, the WGSL in the unique modules and summed over the pipelines
// that use each (each pipeline compiles its own), the biggest modules with how many pipelines use them, and every
// module that reads a node variable where the branch that set it may not have run (`unset-reads.mjs`).
//
// Prereq: a dev server. Usage:
//   node src/projects/aland-drive/tools/shader-count.mjs [--dump=<folder>] [--cockpit]
// ALAND_DRIVE_URL overrides the page's address; --dump writes every module's WGSL there, named by its number.
// --cockpit then takes the driver's seat and back, and prints any pipeline that compiled, which should be none.

/* eslint-disable security/detect-non-literal-fs-filename -- a localhost tool writing to the folder it was told to */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openGame } from "./game-page.mjs";
import { serveTiles } from "./serve-tiles.mjs";
import { watchDevice } from "./device-watch.mjs";
import { describeUnsetReads } from "./unset-reads.mjs";

const option = (name) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const DUMP = option("dump");
const COCKPIT = process.argv.includes("--cockpit");
const BASE = process.env.ALAND_DRIVE_URL ?? "http://localhost:3001/games/3d-games/aland-drive";
const SETTLE_FRAMES = 30;

const { server, port } = await serveTiles("src/projects/aland-drive/fixture");
const url = new URL(BASE);
url.searchParams.set("tiles", `local:${port}`);
const { page, step, reported, close } = await openGame(url.toString(), { width: 1280, height: 720, init: watchDevice, cleanup: () => server.close() });

const record = await step("settling", () =>
  page.evaluate(async (settle) => {
    const probe = window.__alandDrive;
    while (probe.stream().loading > 0) await new Promise(requestAnimationFrame);
    const target = probe.frames() + settle;
    while (probe.frames() < target) await new Promise(requestAnimationFrame);
    return window.__shaderCount;
  }, SETTLE_FRAMES),
);

if (COCKPIT) {
  const before = record.pipelines.length;
  const after = await step("the driver's seat", () =>
    page.evaluate(async (settle) => {
      const probe = window.__alandDrive;
      for (const view of ["cockpit", "chase"]) {
        probe.setCamera(view);
        const target = probe.frames() + settle;
        while (probe.frames() < target) await new Promise(requestAnimationFrame);
      }
      return window.__shaderCount.pipelines.map((pipeline) => pipeline.label);
    }, SETTLE_FRAMES),
  );
  console.log(`pipelines compiled taking the driver's seat and back: ${after.length - before}${after.length > before ? ` (${after.slice(before).join(", ")})` : ""}
`);
}

const { modules, pipelines } = record;
const uses = modules.map(() => 0);
for (const pipeline of pipelines) for (const id of pipeline.modules) uses[id]++;
const chars = (ids) => ids.reduce((sum, id) => sum + modules[id].length, 0);
const unique = [...new Set(modules)].reduce((sum, code) => sum + code.length, 0);
const summed = pipelines.reduce((sum, pipeline) => sum + chars(pipeline.modules), 0);
const count = (kind) => pipelines.filter((pipeline) => pipeline.kind === kind).length;
const k = (n) => `${(n / 1000).toFixed(1)} k`;

console.log(`render pipelines   ${count("render")}`);
console.log(`compute pipelines  ${count("compute")}`);
console.log(`shader modules     ${modules.length}`);
console.log(`WGSL, unique       ${k(unique)} chars`);
console.log(`WGSL, per pipeline ${k(summed)} chars`);
console.log("\nbiggest modules: chars, pipelines using it, compiled in all");
modules
  .map((code, id) => ({ id, size: code.length, uses: uses[id] }))
  .sort((a, b) => b.size * Math.max(b.uses, 1) - a.size * Math.max(a.uses, 1))
  .slice(0, 15)
  .forEach(({ id, size, uses: used }) => console.log(`  #${String(id).padEnd(4)} ${k(size).padStart(8)}  x${used}  ${k(size * used).padStart(9)}`));

// Pipelines grouped by what their vertex shader reads, the attributes' names: a family of lists drawn alike.
const inputsOf = (code) => [...(/fn main\(([\s\S]*?)\)\s*->/.exec(code)?.[1] ?? "").matchAll(/@location\(\s*\d+\s*\)\s*(\w+)/g)].map((match) => match[1]).sort().join(", ") || "(none)";
const families = new Map();
for (const pipeline of pipelines) {
  if (pipeline.kind !== "render") continue;
  const name = inputsOf(modules[pipeline.modules[0]]);
  const family = families.get(name) ?? { count: 0, chars: 0 };
  family.count++;
  family.chars += chars(pipeline.modules);
  families.set(name, family);
}
console.log("\nrender pipelines by vertex inputs: pipelines, compiled in all");
[...families].sort((a, b) => b[1].chars - a[1].chars).forEach(([name, { count: many, chars: all }]) => console.log(`  ${String(many).padStart(3)}  ${k(all).padStart(9)}  ${name}`));

// A node two branches share is written in the first and read, silently zero, in the second (`unset-reads.mjs`).
const unset = modules.map((code, id) => ({ id, lines: describeUnsetReads(code) })).filter(({ lines }) => lines.length > 0);
const labelsOf = (id) => pipelines.filter((pipeline) => pipeline.modules.includes(id)).map((pipeline) => pipeline.label.replace(/^(render|compute)Pipeline_/, "").replace(/_\d+$/, ""));
console.log(`\nmodules reading a node variable where its branch may not have run: ${unset.length}`);
for (const { id, lines } of unset) {
  console.log(`  #${id} (${labelsOf(id).join(", ") || "no pipeline"})`);
  for (const line of lines) console.log(`    ${line}`);
}

if (DUMP) {
  mkdirSync(DUMP, { recursive: true });
  modules.forEach((code, id) => writeFileSync(join(DUMP, `${id}.wgsl`), code));
  writeFileSync(join(DUMP, "pipelines.json"), JSON.stringify(pipelines, null, 1));
}
const problems = reported();
if (problems) console.log(`\nThe page reported:\n${problems}`);
await close();
