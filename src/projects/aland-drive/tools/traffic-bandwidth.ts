// What shared traffic sends (`net/shared-traffic.ts`): players standing together at a place on the built tiles, each
// page's bubble, traffic and shared traffic running as the game's do, with the wire between them carrying the JSON a
// real one does, counted. No browser and no relay: it reads the lane maps from disk. Reports each player's bytes a
// second up to the relay and down from it, and the vehicles a second of each kind, after the first fill has settled.
//
//   npx tsx src/projects/aland-drive/tools/traffic-bandwidth.ts --tiles=L2334E,L2334F --at=-1996,6504 [--players=2]
//     [--apart=30] [--seconds=60] [--folder=<tiles>]
//
// The relay's own framing round each message (its envelope naming the sender and the room) isn't counted: it is the
// same few dozen bytes for a message of one vehicle or a hundred, and a player sends at most 30 a second.

import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createTrafficPages, TRAFFIC_HZ } from "../net/traffic-pages";
import { PARKED_CARS } from "../render/parked-places";
import type { VehicleKind } from "../traffic/lane-driver";
import { decodeLanes, type LanesFile } from "../traffic/lane-map";

const option = (name: string, otherwise: string) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? otherwise;
const FOLDER = option("folder", "src/projects/aland-drive/.data/tiles");
const TILES = option("tiles", "L2334E,L2334F").split(",");
const [AT_X, AT_Z] = option("at", "-1996,6504").split(",").map(Number);
const PLAYERS = Number(option("players", "2"));
const APART_M = Number(option("apart", "30"));
const SECONDS = Number(option("seconds", "60"));
/** The first fill and the handovers it starts are settled by then. */
const SETTLE_S = 20;

// The folder and tiles come from the command line of a local tool.
// eslint-disable-next-line security/detect-non-literal-fs-filename -- see above
const tiles = new Map(TILES.map((name) => [name, decodeLanes(JSON.parse(gunzipSync(readFileSync(`${FOLDER}/${name}/lanes.json.gz`)).toString()) as LanesFile)]));
// The game's reaches: the fleet's, the bikes' and the people's.
const kinds = () => ({ car: { reachM: 900, density: 1 }, bike: { reachM: 400, density: 1 }, walker: { reachM: 200, density: 1 } });
const world = createTrafficPages(tiles, kinds, PARKED_CARS.map(({ half }) => half));
// One after another, as players arrive: the first fills the place round it, and the rest find it filled.
const pages = Array.from({ length: PLAYERS }, (_, index) => {
  const page = world.add(`p${index}`, { x: AT_X + index * APART_M, z: AT_Z });
  world.step();
  return page;
});

for (let step = 0; step < SETTLE_S * TRAFFIC_HZ; step++) world.step();
const before = pages.map(({ sent }) => ({ ...sent, vehicles: { ...sent.vehicles } }));
for (let step = 0; step < SECONDS * TRAFFIC_HZ; step++) world.step();

const kb = (bytes: number) => `${(bytes / SECONDS / 1000).toFixed(1)} kB/s`;
const held = (index: number) => {
  const all = [...pages[index].traffic.all()];
  const of = (kind: VehicleKind) => all.filter((vehicle) => vehicle.kind === kind).length;
  return `${all.length} held (${of("car")} cars, ${of("bike")} cyclists, ${of("walker")} walkers), ${all.filter((vehicle) => pages[index].shared.runsHere(vehicle)).length} run here`;
};
console.log(`${PLAYERS} players ${APART_M} m apart at ${AT_X}, ${AT_Z} on ${TILES.join(", ")}, ${SECONDS} s after ${SETTLE_S} s to settle:`);
let total = 0;
pages.forEach((page, index) => {
  const bytes = page.sent.bytes - before[index].bytes;
  total += bytes;
  const rate = (kind: VehicleKind) => ((page.sent.vehicles[kind] - before[index].vehicles[kind]) / SECONDS).toFixed(1);
  console.log(`  ${page.id}: up ${kb(bytes)} in ${((page.sent.messages - before[index].messages) / SECONDS).toFixed(1)} messages/s; vehicles/s sent: ${rate("car")} cars, ${rate("bike")} cyclists, ${rate("walker")} walkers; ${held(index)}`);
});
pages.forEach((page) => {
  const down = pages.reduce((sum, other, at) => (other === page ? sum : sum + other.sent.bytes - before[at].bytes), 0);
  console.log(`  ${page.id}: down ${kb(down)}`);
});
console.log(`  everyone's uploads together: ${kb(total)}`);
