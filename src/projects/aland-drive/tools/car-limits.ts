// Every car's limits on every ground, each surface in each condition on the tyres measured there, measured in the simulation alone on a flat test
// pad of that surface (`sim/measure-limits.ts`), written into the table the racers read (`sim/car-limits.json`), and
// printed. One core, no browser, no tiles: each car is a few seconds' work on each ground.
//
//   npx tsx src/projects/aland-drive/tools/car-limits.ts [--car=<id>]
//
// Run it after any change to a car's tuning, to the surfaces' grip or to how a car drives: a test fails until the
// table matches the tuning.

import { writeFileSync } from "node:fs";
import { CAR_LIMITS, groundOf, MEASURED_TYRES, tuningPrint, type CarLimits, type Ground } from "../sim/car-limits";
import { CAR_IDS, CARS, isCarId, type CarId } from "../sim/cars";
import { initPhysics } from "../sim/drive";
import { measureCar } from "../sim/measure-limits";
import { CONDITIONS, SURFACES } from "../sim/surfaces";
import { testPad } from "../sim/test-pad";

const TABLE = "src/projects/aland-drive/sim/car-limits.json";
const option = (name: string, otherwise: string) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? otherwise;
const ONLY = option("car", "");
if (ONLY !== "" && !isCarId(ONLY)) throw new Error(`no car ${ONLY}: the cars are ${CAR_IDS.join(", ")}`);

await initPhysics();
const pads = SURFACES.map((surface) => ({ surface, pad: testPad(surface) }));
const table: Record<string, { tuning: string; grounds: Partial<Record<Ground, CarLimits>> }> = { ...CAR_LIMITS };
for (const id of CAR_IDS) {
  if (ONLY !== "" && id !== ONLY) continue;
  const grounds: Partial<Record<Ground, CarLimits>> = {};
  for (const condition of CONDITIONS) {
    for (const tyres of MEASURED_TYRES[condition]) {
      for (const { surface, pad } of pads) grounds[groundOf(condition, surface, tyres)] = measureCar(id, pad, condition, tyres);
    }
  }
  table[id] = { tuning: tuningPrint(CARS[id]), grounds };
  console.log(`measured ${id}`);
}
// A row a line: thirty-two grounds for fourteen cars is too long a file to read laid out in full.
const cars = Object.entries(table).map(([id, { tuning, grounds }]) => {
  const rows = Object.entries(grounds).map(([ground, limits]) => `      ${JSON.stringify(ground)}: ${JSON.stringify(limits)}`);
  return `  ${JSON.stringify(id)}: {\n    "tuning": ${JSON.stringify(tuning)},\n    "grounds": {\n${rows.join(",\n")}\n    }\n  }`;
});
writeFileSync(TABLE, `{\n${cars.join(",\n")}\n}\n`);

const cornerAt = (limits: CarLimits, kmh: number) => limits.corner.find((at) => at.kmh === kmh)?.g.toFixed(2) ?? "-";
const sprint = (limits: CarLimits, kmh: number) => limits.sprintS.find((at) => at.kmh === kmh)?.s.toFixed(1) ?? "-";
const head = ["car", "ground", "corner g 60", "corner g 140", "stop 100 m", "0-100 s", "0-160 s", "400 m s", "top km/h"];
const rows = CAR_IDS.flatMap((id: CarId) =>
  Object.entries(table[id].grounds).map(([ground, limits]: [string, CarLimits]) => [id, ground, cornerAt(limits, 60), cornerAt(limits, 140), limits.stopFrom100M.toFixed(1), sprint(limits, 100), sprint(limits, 160), limits.quarterS.toFixed(1), limits.reachedKmh.toFixed(0)]),
);
const widths = head.map((title, column) => Math.max(title.length, ...rows.map((row) => row[column].length)));
for (const row of [head, ...rows]) console.log(row.map((cell, column) => cell.padStart(widths[column])).join("  "));
