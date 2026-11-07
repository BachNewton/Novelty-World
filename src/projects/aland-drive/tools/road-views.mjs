// Shoots the road-surface review set (`road-views.json`): the fixed cameras the owner judges every paving change from,
// at one pinned date and hour so the sun and shadows match from run to run. Each look goes through look.mjs, on a tile
// server of its own.
//
// Prereq: a page server. Usage:
//   node src/projects/aland-drive/tools/road-views.mjs <folder> [--tiles=<tiles folder>] [--only=<name>,<name>]
//     every view into <folder>/<name>.png, from the tiles built (.data/tiles by default)
//   node src/projects/aland-drive/tools/road-views.mjs <folder> --before=<tiles folder> [--tiles=<tiles folder>] [--only=...]
//     each view from both builds, into <folder>/before, <folder>/after, and the two side by side in <folder>/pairs
// ALAND_DRIVE_URL overrides the page's address, as look.mjs takes it, without ?tiles.

// The paths below are a tool's own arguments, on the owner's machine.
/* eslint-disable security/detect-non-literal-fs-filename -- see above */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { serveTiles } from "./serve-tiles.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const option = (name) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const OUT = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
const PAGE = process.env.ALAND_DRIVE_URL ?? "http://localhost:3001/games/3d-games/aland-drive";
const AFTER = option("tiles") ?? join(HERE, "..", ".data", "tiles");
const BEFORE = option("before");
const ONLY = option("only")?.split(",");
const GAP = 8;

if (OUT === undefined) throw new Error("road-views.mjs <folder>: where the shots go");
const { time, views } = JSON.parse(readFileSync(join(HERE, "road-views.json"), "utf8"));
const chosen = ONLY ? views.filter((view) => ONLY.includes(view.name)) : views;
const unknown = ONLY?.filter((name) => !views.some((view) => view.name === name)) ?? [];
if (unknown.length) throw new Error(`no such view: ${unknown.join(", ")}`);

async function shoot(tilesFolder, folder) {
  mkdirSync(folder, { recursive: true });
  const tiles = await serveTiles(tilesFolder);
  try {
    const url = new URL(PAGE);
    url.searchParams.set("tiles", `local:${tiles.port}`);
    url.searchParams.set("date", time.date);
    url.searchParams.set("hour", String(time.hour));
    const looks = chosen.map((view) => `${view.name}:${view.look.join(",")}`);
    // Not a synchronous call: the tile server answers on this process's own event loop.
    const look = spawn(process.execPath, [join(HERE, "look.mjs"), `--shots=${folder}`, ...looks], { stdio: "inherit", env: { ...process.env, ALAND_DRIVE_URL: url.href } });
    const code = await new Promise((done) => look.on("exit", done));
    if (code !== 0) throw new Error(`look.mjs stopped with ${code}`);
  } finally {
    tiles.server.close();
  }
}

if (BEFORE === undefined) {
  await shoot(AFTER, OUT);
} else {
  await shoot(BEFORE, join(OUT, "before"));
  await shoot(AFTER, join(OUT, "after"));
  mkdirSync(join(OUT, "pairs"), { recursive: true });
  for (const { name } of chosen) {
    const [before, after] = ["before", "after"].map((side) => join(OUT, side, `${name}.png`));
    const { width, height } = await sharp(before).metadata();
    await sharp({ create: { width: width * 2 + GAP, height, channels: 3, background: { r: 255, g: 255, b: 255 } } })
      .composite([
        { input: before, left: 0, top: 0 },
        { input: after, left: width + GAP, top: 0 },
      ])
      .png()
      .toFile(join(OUT, "pairs", `${name}.png`));
    console.log(join(OUT, "pairs", `${name}.png`), "before | after");
  }
}
