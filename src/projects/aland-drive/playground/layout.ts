import type { ShowcaseSpot } from "../render/showcase";

/*
 * The playground: a world of its own, one made-up tile on the world's origin, flat, for
 * trying how the car drives without hunting the island for the right road.
 * Everything a driver needs to compare is side by side: a long straight on each
 * road surface for top speed and braking, one circuit laid twice, in asphalt and
 * in gravel, a skidpad of each, a slab of bare rock, open grass all round, and
 * forest at the edges to give speed something to pass. `tools/playground.ts`
 * builds its tile from this, and the game opens it with `?playground`. It sits on
 * the origin because positions are 32-bit floats on the GPU and in the physics:
 * there a car is within a quarter of a millimetre of where it should be, where
 * 120 km out it was 4 mm, about a pixel on the car.
 *
 * Places are scene metres: x east, z south. A line is listed north up, as east
 * and north from the playground's middle.
 */

export const PLAYGROUND_TILE = { name: "PLAYGROUND", west: 0, north: 6000 } as const;
export const PLAYGROUND_TILE_M = 6000;
/** The middle of the tile, in the scene. */
const MIDDLE_X = PLAYGROUND_TILE.west + PLAYGROUND_TILE_M / 2;
const MIDDLE_Z = -(PLAYGROUND_TILE.north - PLAYGROUND_TILE_M / 2);

export interface PlaygroundRoad {
  name: string;
  /** OSM's class, which sets how it's drawn. */
  kind: "primary" | "unclassified";
  sealed: boolean;
  /** The carriageway's half width, and the shoulder beyond it to the grass. */
  halfWidthM: number;
  shoulderM: number;
  closed: boolean;
  /** East and north from the playground's middle, through which the road runs; a closed road's are a loop, rounded through. */
  through: readonly (readonly [number, number])[];
}

/** One circuit with every kind of bend: a long straight, a hairpin, fast sweepers, esses and medium corners. */
const CIRCUIT: readonly (readonly [number, number])[] = [
  [-400, 0], [300, 0], [420, 40], [460, 140], [400, 230], [250, 260], [150, 330], [180, 430], [300, 480], [350, 580],
  [250, 650], [50, 640], [-80, 560], [-60, 450], [-150, 380], [-300, 420], [-420, 380], [-470, 250], [-480, 100],
];

const moved = (points: readonly (readonly [number, number])[], east: number, north: number) => points.map(([x, y]) => [x + east, y + north] as const);

const circle = (east: number, north: number, radius: number) =>
  Array.from({ length: 12 }, (_, at) => [east + radius * Math.cos((at / 12) * 2 * Math.PI), north + radius * Math.sin((at / 12) * 2 * Math.PI)] as const);

const ASPHALT = { kind: "primary", sealed: true, halfWidthM: 3.5, shoulderM: 1.5 } as const;
const GRAVEL = { kind: "unclassified", sealed: false, halfWidthM: 3, shoulderM: 1.2 } as const;

/** The first is where the drive starts. */
export const PLAYGROUND_ROADS: readonly PlaygroundRoad[] = [
  { name: "Asphalt straight", ...ASPHALT, closed: false, through: [[-1500, -600], [1500, -600]] },
  { name: "Gravel straight", ...GRAVEL, closed: false, through: [[-1500, -700], [1500, -700]] },
  { name: "Asphalt circuit", ...ASPHALT, closed: true, through: moved(CIRCUIT, -900, 300) },
  { name: "Gravel circuit", ...GRAVEL, closed: true, through: moved(CIRCUIT, 600, 300) },
  { name: "Asphalt skidpad", ...ASPHALT, closed: true, through: circle(-700, -1100, 60) },
  { name: "Gravel skidpad", ...GRAVEL, closed: true, through: circle(-400, -1100, 60) },
];

/** Bare rock, as the map's bedrock would be: east, north, east, north of its corners from the middle. */
export const PLAYGROUND_ROCK: readonly (readonly [number, number, number, number])[] = [[300, -1300, 800, -900]];

/** Forest stands everywhere this far from the middle, and nowhere nearer. */
export const PLAYGROUND_FOREST_FROM_M = 1900;

const spot = (id: string, name: string, east: number, north: number, headingDeg: number, offRoad = false): ShowcaseSpot => ({ id, name, x: MIDDLE_X + east, z: MIDDLE_Z - north, headingDeg, offRoad });

/** Where the dev menu jumps to in the playground. */
export const PLAYGROUND_SPOTS: readonly ShowcaseSpot[] = [
  spot("asphalt-straight", "Asphalt straight", -1400, -600, 90),
  spot("gravel-straight", "Gravel straight", -1400, -700, 90),
  spot("asphalt-circuit", "Asphalt circuit", -1100, 300, 90),
  spot("gravel-circuit", "Gravel circuit", 400, 300, 90),
  spot("asphalt-skidpad", "Asphalt skidpad", -700, -1040, 90),
  spot("gravel-skidpad", "Gravel skidpad", -400, -1040, 90),
  spot("rock", "Rock slab", 320, -1100, 90, true),
  spot("grass", "Grass field", 0, -300, 90, true),
];

/** Scene x and z of a place given east and north of the middle. */
export const playgroundScene = (east: number, north: number) => ({ x: MIDDLE_X + east, z: MIDDLE_Z - north });
