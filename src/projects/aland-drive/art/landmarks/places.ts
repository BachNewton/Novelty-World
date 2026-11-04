import type { LandmarkMesh, Vec2 } from "./kit";

/*
 * The sites the 3D data has nothing for because nothing there is a building: lookout towers, statues, ruins, graves,
 * old forts. Each is built on the ground round its origin, as a church's yard wall is, so its far version and its near
 * version stand where the land does; and each says what the car can't pass, where that isn't its plan.
 */

export type HeightAt = (east: number, north: number) => number;

/** What a site takes the place of: NLS solids by name, or every solid inside its plan. A generated shape under it always goes. */
export type Replaces = { solids: string[] } | "inside" | null;

export interface GroundSite {
  id: string;
  name: string;
  /** The model's origin, ETRS-TM35FIN metres. */
  east: number;
  north: number;
  replaces: Replaces;
  /**
   * What the car can't pass, where that isn't the plan: outlines in metres east and north of the origin, and none for a
   * site the car drives over, such as a grave mound.
   */
  walls?: Vec2[][];
  build(ground: Ground): { near: LandmarkMesh; far: LandmarkMesh };
}

/** The ground's height at a point east and north of a site's origin, above the ground at the origin. */
export type Ground = (east: number, north: number) => number;

export function groundOf(heightAt: HeightAt, east: number, north: number): Ground {
  const base = heightAt(east, north);
  return (dEast, dNorth) => heightAt(east + dEast, north + dNorth) - base;
}

/** A rectangle round a point, turned by a compass bearing, as an outline east and north of a site's origin. */
export function rectangle(east: number, north: number, halfAlong: number, halfAcross: number, bearingDeg = 0): Vec2[] {
  const bearing = (bearingDeg * Math.PI) / 180;
  const along: Vec2 = [Math.sin(bearing), Math.cos(bearing)];
  const across: Vec2 = [Math.cos(bearing), -Math.sin(bearing)];
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([a, b]): Vec2 => [east + along[0] * a * halfAlong + across[0] * b * halfAcross, north + along[1] * a * halfAlong + across[1] * b * halfAcross]);
}
