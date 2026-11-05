import type { Place } from "./game";

/*
 * The junctions worth returning to after a change to the road surface: the
 * hardest of each kind on the island. Places are in the scene (east +x, north
 * -z); `from` is where a driver comes from, as a place about 50 m back.
 */

export type JunctionKind = "roundabout" | "merge" | "side road";

export interface JunctionSpot {
  name: string;
  kind: JunctionKind;
  x: number;
  z: number;
  from: { x: number; z: number };
}

export const JUNCTION_SPOTS: readonly JunctionSpot[] = [
  { name: "Nya Godbyvägen north", kind: "roundabout", x: -2085, z: 3327, from: { x: -2062, z: 3265 } },
  { name: "Hammarlandsvägen", kind: "roundabout", x: -3426, z: 4920, from: { x: -3380, z: 4950 } },
  { name: "Bolstavägen", kind: "roundabout", x: -1683, z: 3831, from: { x: -1740, z: 3845 } },
  { name: "Rökerirondellen", kind: "roundabout", x: -1921, z: 4857, from: { x: -1990, z: 4880 } },
  { name: "Eckerövägen", kind: "roundabout", x: -21896, z: -9571, from: { x: -21848, z: -9568 } },
  { name: "Kvarnbo", kind: "roundabout", x: 6709, z: -12285, from: { x: 6720, z: -12335 } },
  { name: "Getavägen", kind: "roundabout", x: 2099, z: -7657, from: { x: 2125, z: -7705 } },
  { name: "Nya Godbyvägen merge", kind: "merge", x: 2280, z: -7525, from: { x: 2225, z: -7490 } },
  { name: "Lemlandsvägen merge", kind: "merge", x: 231, z: 5330, from: { x: 170, z: 5310 } },
  { name: "Sundsvägen merge", kind: "merge", x: 5353, z: -9080, from: { x: 5300, z: -9060 } },
  { name: "Sjukhusvägen merge", kind: "merge", x: -2041, z: 4882, from: { x: -2095, z: 4890 } },
  { name: "Staggered side roads", kind: "side road", x: 12128, z: -5878, from: { x: 12095, z: -5888 } },
];

const WORLD_EAST = 110_000;
const WORLD_NORTH = 6_690_000;
const ABOVE_M = 110;
const DRIVER_M = 2.5;
const DRIVER_PITCH = -0.1;

export const placeOf = (x: number, z: number) => ({ east: x + WORLD_EAST, north: -z + WORLD_NORTH });

export const fromAbove = ({ x, z }: JunctionSpot): Place => ({ ...placeOf(x, z), height: ABOVE_M, yaw: 0, pitch: -Math.PI / 2 });

/** Where the car goes to drive it: on the road it's approached by, facing the junction. */
export const startOfApproach = ({ name, x, z, from }: JunctionSpot) => ({ name, x: from.x, z: from.z, headingDeg: (Math.atan2(x - from.x, from.z - z) * 180) / Math.PI });

/** At a driver's eye, looking at the junction. */
export function onApproach({ x, z, from }: JunctionSpot): Place {
  return { ...placeOf(from.x, from.z), height: DRIVER_M, yaw: Math.atan2(from.x - x, from.z - z), pitch: DRIVER_PITCH };
}
