import { serveGames } from "@/shared/lib/bot-lab/serve";
import { initPhysics } from "../sim/drive";
import { readRoads, type Roads } from "../tools/road-places";
import { loadRace, vetRun, type LoadedRace, type VetResult, type VetSpec } from "./vet";

/*
 * The worker side of the vetting tool's pool (`tools/race-vet.ts`): each run is
 * a pure function of its spec, so any worker may play any run. A worker keeps
 * the road map and the last race it read, since reading a race's tiles costs
 * more than a run does and the tool hands a worker one race's runs together.
 */

let roads: { folder: string; roads: Roads } | null = null;
let loaded: { folder: string; id: string; race: LoadedRace } | null = null;

await initPhysics();

serveGames((spec: VetSpec): VetResult => {
  if (roads?.folder !== spec.folder) roads = { folder: spec.folder, roads: readRoads(spec.folder) };
  if (loaded?.folder !== spec.folder || loaded.id !== spec.race) loaded = { folder: spec.folder, id: spec.race, race: loadRace(spec.folder, spec.race, roads.roads) };
  return vetRun(spec, loaded.race);
});
