import { NO_HINTS, type PlacementFloor, type PlacementHints, type RoomFloors } from "./placement";
import { BASE_RADIUS, INNER, onSide, TILE } from "./room";

/*
 * Floors for tests of placing and walking: a room's floor open within a box
 * round its middle, with nothing standing on it, on the floor plan's grid.
 */

const CELL = 0.05;

/** A room's floor on the floor plan's grid: open within `halfX` by `halfZ` metres of the middle, blocked beyond. */
export function openFloor(halfX = INNER, halfZ = halfX): PlacementFloor {
  const size = Math.round(TILE / CELL);
  const centre = (cell: number): [number, number] => [-TILE / 2 + ((cell % size) + 0.5) * CELL, -TILE / 2 + (Math.floor(cell / size) + 0.5) * CELL];
  const index = (value: number) => Math.min(size - 1, Math.max(0, Math.floor((value + TILE / 2) / CELL)));
  const clearance = new Float64Array(size * size);
  const reached = new Uint8Array(size * size);
  for (let cell = 0; cell < size * size; cell++) {
    const [x, z] = centre(cell);
    clearance[cell] = Math.max(0, Math.min(halfX - Math.abs(x), halfZ - Math.abs(z)));
    reached[cell] = clearance[cell] >= BASE_RADIUS ? 1 : 0;
  }
  return { size, clearance, reached, centre, cellAt: (x, z) => index(z) * size + index(x) };
}

/** Every room an open floor, its prime place at `prime` (in a barrier room's half, mirrored into it). */
export function openFloors(prime: readonly [x: number, z: number] = [1, 1], hints: Partial<PlacementHints> = {}): RoomFloors {
  const floor = openFloor();
  return (_room, side) => {
    const mirrored: readonly [number, number] = onSide(side, ...prime) ? prime : [-prime[0], -prime[1]];
    return { floor, hints: { ...NO_HINTS, ...hints, prime: mirrored, within: side === null ? null : (x, z) => onSide(side, x, z) } };
  };
}
