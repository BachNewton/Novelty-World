import type { Grid } from "./grid";
import { distanceField } from "./fields";
import { buildLand, landShape } from "./land";
import { canopyShade, scatterLife, woodland, type Plant } from "./life";
import { gradientNoise, type Noise2 } from "./noise";
import { placeCamp, placePlaces, type Camp, type Place } from "./places";
import { findCrossings, layTrails, wearTrails, type Crossing, type Trail } from "./trails";
import { carveLake, placeLake, runStream, type Lake, type Stream } from "./water";

/*
 * A whole valley from its seed: the land, its water, camp and the places,
 * the trails between them and everything growing. The same seed always
 * makes the same valley.
 */

export interface Valley {
  seed: string;
  heights: Grid;
  lake: Lake;
  stream: Stream;
  camp: Camp;
  places: Place[];
  trails: Trail[];
  crossings: Crossing[];
  plants: Plant[];
  /** How thick the woods are at each vertex, 0 to 1. */
  woodland: Grid;
  /** How far each vertex is from the stream and from a trail, in metres, capped. */
  streamDistance: Grid;
  trailDistance: Grid;
  /** How much the trees shade the ground at each vertex. */
  shade: Grid;
  /** The wobble of the altitude bands, shared by everything that reads them. */
  bandNoise: Noise2;
}

const STREAM_REACH = 32;
const TRAIL_REACH = 8;

export function generateValley(seed: string): Valley {
  const shape = landShape(seed);
  const heights = buildLand(seed, shape);
  const lake = placeLake(seed);
  carveLake(heights, lake);
  const stream = runStream(heights, lake, seed);
  const streamDistance = distanceField(heights, [stream.points], STREAM_REACH);
  const surroundings = { heights, lake, stream, streamDistance };
  const camp = placeCamp(seed, surroundings);
  const places = placePlaces(seed, surroundings, camp);
  const trails = layTrails(heights, streamDistance, camp, places);
  wearTrails(heights, streamDistance, trails);
  const trailDistance = distanceField(heights, trails.map((t) => t.points), TRAIL_REACH);
  const crossings = findCrossings(streamDistance, trails);
  const life = { heights, lake, streamDistance, trailDistance, camp, places };
  const density = woodland(seed, life);
  const plants = scatterLife(seed, life, density);
  return {
    seed,
    heights,
    lake,
    stream,
    camp,
    places,
    trails,
    crossings,
    plants,
    woodland: density,
    streamDistance,
    trailDistance,
    shade: canopyShade(heights, plants),
    bandNoise: gradientNoise(`${seed}/bands`),
  };
}
