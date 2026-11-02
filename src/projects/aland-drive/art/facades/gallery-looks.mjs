// The gallery's places: each style at the doors of real buildings that have it, plus a view down a street per kind of
// place, where variety is judged, and the models on their own stages.
import { readFileSync } from "node:fs";

const STYLE_NAMES = { 4: "villa", 5: "brick", 6: "block", 7: "glass", 8: "hall", 9: "barn" };
const PER_STYLE = 3;

function street(name, east, north, bearingDeg, extra = {}) {
  const bearing = (bearingDeg * Math.PI) / 180;
  return { name, at: { east, north, height: extra.eye ?? 2.6, yaw: -bearing, pitch: extra.pitch ?? 0.02 }, ...extra };
}

const STREETS = [
  street("street-sodragatan", 107880, 6683073, 92),
  street("street-mariegatan", 107300, 6682905, 82),
  street("street-norra-espl", 107930, 6683258, 268),
  street("street-torggatan", 108020, 6683620, 196),
  street("street-alandsvagen", 107797, 6684160, 172),
  street("town-far", 107600, 6682300, 12, { eye: 14, pitch: -0.03 }),
];

/** A church from its south-west at a walker's distance, and from further off on its far model. */
function churchLook(id, east, north, version = "near", away = 42) {
  const bearing = (35 * Math.PI) / 180;
  return { name: `church-${id}${version === "far" ? "-far" : ""}`, stage: { church: id, version }, at: { east: east - Math.sin(bearing) * away, north: north - Math.cos(bearing) * away, height: 2.2, yaw: -bearing, pitch: 0.22 } };
}

const CHURCH_LOOKS = [
  churchLook("jomala", 109018.2, 6689583.6),
  churchLook("finstrom", 109343.5, 6701725.2),
  churchLook("hammarland", 98538.6, 6697765.5),
  churchLook("saltvik", 116140, 6702315.2, "near", 56),
  churchLook("sund", 119263.1, 6699079.8, "near", 52),
  churchLook("geta", 106151.9, 6714564.9),
  churchLook("eckero", 91105, 6697476.9),
  churchLook("lemland", 115569.6, 6679885.6),
  churchLook("foglo", 133951, 6671080),
  churchLook("vardo", 133453.4, 6696809),
  churchLook("sund", 119263.1, 6699079.8, "far", 300),
];

function fuelLook(index) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- this folder's own data file, by a URL fixed here
  const { east, north, bearing, roadM } = JSON.parse(readFileSync(new URL("./fuel-stations.json", import.meta.url), "utf8"))[index];
  const turn = (bearing * Math.PI) / 180;
  // Across the road from the forecourt, looking back at it a little along the road.
  const [rightEast, rightNorth] = [Math.cos(turn), -Math.sin(turn)];
  const [fromEast, fromNorth] = [east + rightEast * (roadM + 9) + Math.sin(turn) * 16, north + rightNorth * (roadM + 9) + Math.cos(turn) * 16];
  const look = Math.atan2(east - fromEast, north - fromNorth);
  return { name: `fuel-${index}`, stage: { fuel: index }, at: { east: fromEast, north: fromNorth, height: 1.8, yaw: -look, pitch: 0.07 } };
}

const FUEL_LOOKS = [fuelLook(2), fuelLook(10), fuelLook(13)];

/** Somewhere in town to load the tiles round before a door is looked for. */
const TOWN = { east: 107800, north: 6683300, height: 1.6, yaw: 0, pitch: 0.12 };

export function looksFrom() {
  const looks = [];
  for (const [style, name] of Object.entries(STYLE_NAMES)) {
    for (let at = 0; at < PER_STYLE; at++) looks.push({ name: `${name}-${at + 1}`, at: TOWN, door: { style: Number(style), index: at * 7 + 3 } });
  }
  for (const index of [0, 2, 4, 6]) looks.push({ name: `front-shop-${index}`, at: TOWN, door: { front: 1, index } });
  for (const index of [0, 1]) looks.push({ name: `front-supermarket-${index}`, at: TOWN, door: { front: 2, index } });
  return [...looks, ...STREETS, ...CHURCH_LOOKS, ...FUEL_LOOKS];
}
