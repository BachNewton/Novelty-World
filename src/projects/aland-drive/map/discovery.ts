import { PLACES, type Place } from "./places";
import type { RoadGraph } from "./road-graph";

/*
 * Which places the player has found. A place is found once the car comes as close
 * as the roads let it, plus a little: its reach is the distance to its nearest road
 * and a margin, so a church beside the road is found at its gate and a hillfort
 * from the end of its track, and neither from the main road going past. What's
 * found is kept between drives by whatever store it's handed. A world of only a
 * few tiles, as tools and tests drive, has only the places its roads reach.
 */

/** Past the nearest road, how much further a place can be and still be found from it. */
const MARGIN_M = 50;
const LEAST_REACH_M = 60;
/** Every place on the island is closer than this to a road. */
const ROAD_WITHIN_M = 1000;

export interface FoundStore {
  load: () => readonly string[] | null;
  save: (ids: readonly string[]) => void;
}

export class Discovery {
  readonly places: readonly Place[];
  private readonly reaches: readonly number[];
  private readonly found: Set<string>;
  /** Moves on whenever what's found changes. */
  revision = 0;

  constructor(graph: RoadGraph, private readonly store: FoundStore, places: readonly Place[] = PLACES) {
    const reached = places.flatMap((place) => {
      const road = graph.nearest(place.x, place.z, ROAD_WITHIN_M);
      return road ? [{ place, reach: Math.max(LEAST_REACH_M, road.distance + MARGIN_M) }] : [];
    });
    this.places = reached.map(({ place }) => place);
    this.reaches = reached.map(({ reach }) => reach);
    // Kept even when this world lacks the place, so a tool's small world never forgets what a drive found.
    const known = new Set(places.map((place) => place.id));
    this.found = new Set((store.load() ?? []).filter((id) => known.has(id)));
  }

  isFound(place: Place): boolean {
    return this.found.has(place.id);
  }

  /** Of the places in this world. */
  get foundCount(): number {
    return this.places.filter((place) => this.found.has(place.id)).length;
  }

  /** The car is here: any place it has just reached, each once ever. */
  update(x: number, z: number): Place[] {
    const reached = this.places.filter((place, index) => !this.found.has(place.id) && Math.hypot(place.x - x, place.z - z) <= this.reaches[index]);
    if (reached.length === 0) return reached;
    for (const place of reached) this.found.add(place.id);
    this.revision++;
    this.store.save([...this.found]);
    return reached;
  }
}
