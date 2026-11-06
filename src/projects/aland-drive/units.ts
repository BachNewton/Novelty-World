import { create } from "zustand";
import { getProjectStorage } from "@/shared/lib/storage";

/*
 * The units the player reads the game in, kept in this browser: metric (km/h, metres and kilometres, °C, a 24-hour
 * clock) or imperial (mph, feet and miles, °F, a 12-hour clock). Only what the player reads changes; the simulation,
 * the tools and the dev pages stay in metres and degrees Celsius.
 */

export const UNIT_SYSTEMS = ["metric", "imperial"] as const;
export type Units = (typeof UNIT_SYSTEMS)[number];

const storage = getProjectStorage("aland-drive");
const KEY = "units";

const isUnits = (value: unknown): value is Units => typeof value === "string" && (UNIT_SYSTEMS as readonly string[]).includes(value);

function savedUnits(): Units {
  if (typeof window === "undefined") return "metric";
  const saved = storage.get<unknown>(KEY);
  return isUnits(saved) ? saved : "metric";
}

export const useUnits = create<{ units: Units; setUnits: (units: Units) => void }>()((set) => ({
  units: savedUnits(),
  setUnits: (units) => {
    storage.set(KEY, units);
    set({ units });
  },
}));

const METRES_A_MILE = 1609.344;
const FEET_A_METRE = 3.28084;
const MPH_A_KMH = 1 / 1.609344;

/** A speed as the dial shows it, a whole number in the player's units. */
export const speedNumber = (kmh: number, units: Units) => Math.round(units === "metric" ? kmh : kmh * MPH_A_KMH);

export const speedUnit = (units: Units) => (units === "metric" ? "km/h" : "mph");

/** A speed with its unit, rounded down so a shown speed never flatters: "112 km/h". */
export const speedText = (kmh: number, units: Units) => `${Math.floor(units === "metric" ? kmh : kmh * MPH_A_KMH)} ${speedUnit(units)}`;

/** A distance still to go: a driver reads tens of metres or feet near, and tenths of a kilometre or mile far. */
export function distanceText(metres: number, units: Units): string {
  if (units === "metric") return metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres / 10) * 10} m`;
  const miles = metres / METRES_A_MILE;
  return miles >= 0.1 ? `${miles.toFixed(1)} mi` : `${Math.round((metres * FEET_A_METRE) / 50) * 50} ft`;
}

/** The air's temperature in whole degrees with a true minus: "−7°". */
export function temperatureText(celsius: number, units: Units): string {
  const degrees = Math.round(units === "metric" ? celsius : celsius * 1.8 + 32);
  return `${degrees < 0 ? "−" : ""}${Math.abs(degrees)}°`;
}

/** The hour as the player's clock shows it: "14:05" on a 24-hour clock, "2:05 PM" on a 12-hour one. */
export function clockText(hour: number, units: Units): string {
  const minutes = Math.floor(hour * 60) % (24 * 60);
  const [h, m] = [Math.floor(minutes / 60), String(minutes % 60).padStart(2, "0")];
  if (units === "metric") return `${String(h).padStart(2, "0")}:${m}`;
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? "AM" : "PM"}`;
}
