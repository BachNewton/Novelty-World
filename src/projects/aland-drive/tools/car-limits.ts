// Every car's limits on every ground, each surface in each condition on the tyres measured there, measured in the simulation alone on a flat test
// pad of that surface (`sim/measure-limits.ts`), written into the table the racers read, a file per car (`sim/limits/<id>.json`), and
// printed. One core, no browser, no tiles: each car is a few seconds' work on each ground.
//
//   npx tsx src/projects/aland-drive/tools/car-limits.ts [--car=<id>]
//
// Run it after any change to a car's tuning, to the surfaces' grip or to how a car drives: a test fails until the
// table matches the tuning. `--car` measures that car alone and writes only its file. A new car is measured before
// its line goes into `sim/car-limits.ts`, since that line reads the file this writes.

import { writeFileSync } from "node:fs";
import { groundOf, MEASURED_TYRES, tuningPrint, type CarLimits, type Ground } from "../sim/car-limits";
import { CAR_IDS, CARS, isCarId, type CarId } from "../sim/cars";
import { initPhysics } from "../sim/drive";
import { measureCar } from "../sim/measure-limits";
import { CONDITIONS, SURFACES } from "../sim/surfaces";
import { testPad } from "../sim/test-pad";

const fileOf = (id: CarId) => `src/projects/aland-drive/sim/limits/${id}.json`;
const option = (name: string, otherwise: string) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? otherwise;
const ONLY = option("car", "");
if (ONLY !== "" && !isCarId(ONLY)) throw new Error(`no car ${ONLY}: the cars are ${CAR_IDS.join(", ")}`);

await initPhysics();
const pads = SURFACES.map((surface) => ({ surface, pad: testPad(surface) }));
const measured = new Map<CarId, Partial<Record<Ground, CarLimits>>>();
for (const id of CAR_IDS.filter((id) => ONLY === "" || id === ONLY)) {
  const grounds: Partial<Record<Ground, CarLimits>> = {};
  for (const condition of CONDITIONS) {
    for (const tyres of MEASURED_TYRES[condition]) {
      for (const { surface, pad } of pads) grounds[groundOf(condition, surface, tyres)] = measureCar(id, pad, condition, tyres);
    }
  }
  // A row a line: thirty-two grounds are too long a file to read laid out in full.
  const rows = Object.entries(grounds).map(([ground, limits]) => `    ${JSON.stringify(ground)}: ${JSON.stringify(limits)}`);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the path is this folder's own, named by a car id the registry already holds
  writeFileSync(fileOf(id), `{\n  "tuning": ${JSON.stringify(tuningPrint(CARS[id]))},\n  "grounds": {\n${rows.join(",\n")}\n  }\n}\n`);
  measured.set(id, grounds);
  console.log(`measured ${id}`);
}

const cornerAt = (limits: CarLimits, kmh: number) => limits.corner.find((at) => at.kmh === kmh)?.g.toFixed(2) ?? "-";
const sprint = (limits: CarLimits, kmh: number) => limits.sprintS.find((at) => at.kmh === kmh)?.s.toFixed(1) ?? "-";
const head = ["car", "ground", "corner g 60", "corner g 140", "stop 100 m", "0-100 s", "0-160 s", "400 m s", "top km/h"];
const rows = [...measured].flatMap(([id, grounds]) =>
  Object.entries(grounds).map(([ground, limits]: [string, CarLimits]) => [id, ground, cornerAt(limits, 60), cornerAt(limits, 140), limits.stopFrom100M.toFixed(1), sprint(limits, 100), sprint(limits, 160), limits.quarterS.toFixed(1), limits.reachedKmh.toFixed(0)]),
);
const widths = head.map((title, column) => Math.max(title.length, ...rows.map((row) => row[column].length)));
for (const row of [head, ...rows]) console.log(row.map((cell, column) => cell.padStart(widths[column])).join("  "));
