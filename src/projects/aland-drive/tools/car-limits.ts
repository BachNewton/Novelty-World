// Every car's limits, measured in the simulation alone on a flat test pad (`sim/measure-limits.ts`), written into the table
// the racers read (`sim/car-limits.json`), and printed. One core, no browser, no tiles: each car is a few seconds' work.
//
//   npx tsx src/projects/aland-drive/tools/car-limits.ts [--car=<id>]
//
// Run it after any change to a car's tuning or to how a car drives: a test fails until the table matches the tuning.

import { writeFileSync } from "node:fs";
import { CAR_LIMITS, tuningPrint, type CarLimits } from "../sim/car-limits";
import { CAR_IDS, CARS, isCarId, type CarId } from "../sim/cars";
import { initPhysics } from "../sim/drive";
import { measureCar } from "../sim/measure-limits";
import { testPad } from "../sim/test-pad";

const TABLE = "src/projects/aland-drive/sim/car-limits.json";
const option = (name: string, otherwise: string) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? otherwise;
const ONLY = option("car", "");
if (ONLY !== "" && !isCarId(ONLY)) throw new Error(`no car ${ONLY}: the cars are ${CAR_IDS.join(", ")}`);

await initPhysics();
const pad = testPad();
const table: Record<string, CarLimits & { tuning: string }> = { ...CAR_LIMITS };
for (const id of CAR_IDS) {
  if (ONLY !== "" && id !== ONLY) continue;
  table[id] = { tuning: tuningPrint(CARS[id]), ...measureCar(id, pad) };
  console.log(`measured ${id}`);
}
writeFileSync(TABLE, `${JSON.stringify(table, null, 2)}\n`);

const cornerAt = (limits: CarLimits, kmh: number) => limits.corner.find((at) => at.kmh === kmh)?.g.toFixed(2) ?? "-";
const sprint = (limits: CarLimits, kmh: number) => limits.sprintS.find((at) => at.kmh === kmh)?.s.toFixed(1) ?? "-";
const rows = CAR_IDS.map((id: CarId) => {
  const limits = table[id];
  return [id, cornerAt(limits, 60), cornerAt(limits, 140), limits.stopFrom100M.toFixed(1), sprint(limits, 100), sprint(limits, 160), limits.quarterS.toFixed(1), limits.reachedKmh.toFixed(0)];
});
const head = ["car", "corner g 60", "corner g 140", "stop 100 m", "0-100 s", "0-160 s", "400 m s", "top km/h"];
const widths = head.map((title, column) => Math.max(title.length, ...rows.map((row) => row[column].length)));
for (const row of [head, ...rows]) console.log(row.map((cell, column) => cell.padStart(widths[column])).join("  "));
