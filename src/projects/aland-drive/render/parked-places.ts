/*
 * A tile's parked cars (`pipeline/parking.py` writes them in `parked.json`): where
 * each stands, and which of `art/cars`' world cars it is, picked by its place so it
 * comes back the same. Kept apart from the art, so the tile worker stands walls
 * round each car without it; a test holds the sizes here to the art's.
 */

/** A tile's cars: x, y, z, yaw, `PARKED_FLOATS` to a car, in the scene. */
export type TileParked = Float32Array;
export const PARKED_FLOATS = 4;

export interface ParkedFile {
  cars: number[][];
}

export const decodeParked = (file: ParkedFile | null): TileParked => Float32Array.from(file?.cars.flat() ?? []);

/** The world cars that park, by name, with half their width and length and how often each is seen. A car with a livery is rarer. */
export const PARKED_CARS = [
  { name: "Raggare", half: [0.99, 2.75], share: 0.3 },
  { name: "Myra", half: [0.73, 1.375], share: 0.6 },
  { name: "Brev", half: [0.92, 2.3], share: 0.25 },
  { name: "Åker", half: [0.92, 2.5], share: 0.6 },
  { name: "Droska", half: [0.92, 2.4], share: 0.25 },
  { name: "Vakt", half: [0.93, 2.4], share: 0.1 },
  { name: "Pärla", half: [0.82, 1.775], share: 1 },
  { name: "Nio", half: [0.84, 2], share: 1 },
  { name: "Tusen", half: [0.88, 2.1], share: 1 },
  { name: "Nu", half: [0.9, 2.15], share: 1 },
  { name: "Rad", half: [0.91, 2.35], share: 1 },
  { name: "Stig", half: [0.92, 2.2], share: 1 },
  { name: "Långa", half: [0.92, 2.375], share: 1 },
  { name: "Flock", half: [0.92, 2.325], share: 0.8 },
  { name: "Gammal", half: [0.85, 2.25], share: 0.6 },
  { name: "Bud", half: [0.88, 2.15], share: 0.6 },
  { name: "Verk", half: [0.92, 2.5], share: 0.4 },
  { name: "Puls", half: [0.88, 1.95], share: 0.8 },
] as const;

const TOTAL_SHARE = PARKED_CARS.reduce((sum, { share }) => sum + share, 0);

/** A repeatable share from 0 to 1 for a place. */
const roll = (x: number, z: number, salt: number) => {
  const raw = Math.sin(x * 12.9898 + z * 78.233 + salt * 37.719) * 43758.5453;
  return raw - Math.floor(raw);
};

/** The car that parks at a place: an index into `PARKED_CARS`, and the seed its paint and small differences roll from. */
export function parkedAt(x: number, z: number): { car: number; seed: number } {
  let left = roll(x, z, 1) * TOTAL_SHARE;
  const car = PARKED_CARS.findIndex(({ share }) => (left -= share) < 0);
  return { car: car < 0 ? PARKED_CARS.length - 1 : car, seed: Math.floor(roll(x, z, 2) * 1e6) };
}

/** Every car's outline as four walls, laid out as a building's are (x and z at each end): a parked car stops the car. */
export function parkedWalls(cars: TileParked): Float32Array {
  const walls: number[] = [];
  for (let at = 0; at < cars.length; at += PARKED_FLOATS) {
    const [x, , z, yaw] = cars.subarray(at, at + PARKED_FLOATS);
    const [wide, long] = PARKED_CARS[parkedAt(x, z).car].half;
    // The car's own frame turned by its yaw, as the world cars' material turns it.
    const corner = (across: number, along: number): [number, number] => [x + across * Math.cos(yaw) + along * Math.sin(yaw), z + along * Math.cos(yaw) - across * Math.sin(yaw)];
    const corners = [corner(-wide, -long), corner(wide, -long), corner(wide, long), corner(-wide, long)];
    corners.forEach((from, index) => walls.push(...from, ...corners[(index + 1) % 4]));
  }
  return Float32Array.from(walls);
}
