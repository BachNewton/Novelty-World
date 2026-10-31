// The gallery's places: each style on real buildings `bake.py` assigned it, from the kerb of their own street, at a car's
// height, plus a chase view down a street per kind of place, which is where cost and variety are judged.
/* eslint-disable security/detect-non-literal-fs-filename -- a localhost tool reading the folder it was told to */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const EYE_M = 1.6;
const BACK_M = 9;
const STYLE_NAMES = { 4: "villa", 5: "brick", 6: "block", 7: "glass", 8: "hall", 9: "barn" };
const PER_STYLE = 3;

function street(name, east, north, bearingDeg, extra = {}) {
  const bearing = (bearingDeg * Math.PI) / 180;
  return { name, at: { east, north, height: extra.eye ?? 2.6, yaw: -bearing, pitch: extra.pitch ?? 0.02 }, ...extra };
}

const STREETS = [
  street("street-sodragatan", 107880, 6683073, 92, { measure: true }),
  street("street-mariegatan", 107300, 6682905, 82),
  street("street-norra-espl", 107930, 6683258, 268),
  street("street-torggatan", 108020, 6683620, 196, { measure: true }),
  street("street-alandsvagen", 107797, 6684160, 172),
  street("town-far", 107600, 6682300, 12, { eye: 14, pitch: -0.03, measure: true }),
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
  const { east, north, bearing, roadM } = JSON.parse(readFileSync(new URL("./fuel-stations.json", import.meta.url), "utf8"))[index];
  const turn = (bearing * Math.PI) / 180;
  // Across the road from the forecourt, looking back at it a little along the road.
  const [rightEast, rightNorth] = [Math.cos(turn), -Math.sin(turn)];
  const [fromEast, fromNorth] = [east + rightEast * (roadM + 9) + Math.sin(turn) * 16, north + rightNorth * (roadM + 9) + Math.cos(turn) * 16];
  const look = Math.atan2(east - fromEast, north - fromNorth);
  return { name: `fuel-${index}`, stage: { fuel: index }, at: { east: fromEast, north: fromNorth, height: 1.8, yaw: -look, pitch: 0.07 } };
}

const FUEL_LOOKS = [fuelLook(2), fuelLook(10), fuelLook(13)];

function facing(building) {
  const [kerbEast, kerbNorth] = building.kerb;
  const [dx, dy] = [building.east - kerbEast, building.north - kerbNorth];
  const size = Math.hypot(dx, dy);
  const bearing = Math.atan2(dx, dy);
  return { east: kerbEast - (dx / size) * BACK_M, north: kerbNorth - (dy / size) * BACK_M, height: EYE_M, yaw: -bearing, pitch: 0.12 };
}

export function looksFrom(baked) {
  const buildings = ["L2334E", "L2334F"].flatMap((tile) => JSON.parse(readFileSync(join(baked, tile, "assigned.json"), "utf8")));
  const looks = [];
  for (const [style, name] of Object.entries(STYLE_NAMES)) {
    const found = buildings.filter((building) => building.style === Number(style) && building.kerb).sort((a, b) => b.area * (b.eaves + 3) - a.area * (a.eaves + 3));
    const step = Math.max(1, Math.floor(found.length / (PER_STYLE + 1)));
    for (let at = 0; at < PER_STYLE && at * step + step < found.length; at++) {
      const building = found[at * step + step];
      looks.push({ name: `${name}-${at + 1}`, at: facing(building), door: style === "9" ? undefined : { style: Number(style), index: at * 7 + 3 } });
    }
  }
  const town = facing(buildings.find((building) => building.kerb));
  for (const index of [0, 2, 4, 6]) looks.push({ name: `front-shop-${index}`, at: town, door: { front: 1, index } });
  for (const index of [0, 1]) looks.push({ name: `front-supermarket-${index}`, at: town, door: { front: 2, index } });
  return [...looks, ...STREETS, ...CHURCH_LOOKS, ...FUEL_LOOKS];
}
