/*
 * Ten places that show the world off, on the number keys, and the view set tools
 * and art checks return to. A spot is only a place near a road and a way to face:
 * the car goes on the nearest road, along it. Places are in the scene (east +x,
 * north -z), headings in degrees clockwise from grid north.
 */

export interface ShowcaseSpot {
  key: string;
  name: string;
  x: number;
  z: number;
  headingDeg: number;
}

export const SHOWCASE: readonly ShowcaseSpot[] = [
  { key: "1", name: "Esplanade, Mariehamn", x: -2400, z: 6800, headingDeg: 180 },
  { key: "2", name: "Västerhamn", x: -3013, z: 6877, headingDeg: 270 },
  { key: "3", name: "Farms of Eckerö", x: -18502, z: -7976, headingDeg: 90 },
  { key: "4", name: "Deep forest", x: -4935, z: -3182, headingDeg: 0 },
  { key: "5", name: "Lakeside on Route 1", x: -9614, z: -1009, headingDeg: 90 },
  { key: "6", name: "Färjsund bridge", x: 3600, z: -8305, headingDeg: 135 },
  { key: "7", name: "Långnäs", x: 17943, z: 6997, headingDeg: 90 },
  { key: "8", name: "Getabergen", x: -3757, z: -25867, headingDeg: 300 },
  { key: "9", name: "Kastelholm", x: 7147, z: -7133, headingDeg: 90 },
  { key: "0", name: "Bomarsund", x: 15247, z: -4270, headingDeg: 90 },
];
