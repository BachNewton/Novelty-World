/*
 * What the sky reads that isn't the calendar's: the rain and whether the sun
 * is out of the cloud (for the rainbow), set each frame from the engine's
 * weather (`components/valley/world-weather.tsx`) unless `?rain=` holds the
 * rain, and wishes to see a rare sight on
 * demand rather than on its seeded nights. One plain object for the page,
 * started from the address (`?rain=<0-1>`, `?aurora=on|off`) and set live from the ~ panel's Sky section and by
 * the screenshot tools (`window.__hearthwoodSky`).
 */

/** Whether a rare sight follows the calendar's seeded nights, or is held on or off. */
export type Sighting = "seeded" | "on" | "off";

export interface SkyInputs {
  /** How hard it is raining where the camera is, 0 to 1. */
  rain: number;
  /** How much of the sun's disc is clear of cloud, 0 to 1: a rainbow needs the sun out. */
  sunOut: number;
  aurora: Sighting;
}

declare global {
  interface Window {
    /** The sky's inputs, for the screenshot tools. */
    __hearthwoodSky?: SkyInputs;
  }
}

function sighting(param: string | null, name: string): Sighting {
  if (param === null) return "seeded";
  if (param === "on" || param === "off" || param === "seeded") return param;
  throw new Error(`?${name} must be on, off or seeded, not ${param}`);
}

/** The inputs an address asks for. */
export function readSkyInputs(search: string): SkyInputs {
  const params = new URLSearchParams(search);
  const rain = Number(params.get("rain") ?? 0);
  if (!(rain >= 0 && rain <= 1)) throw new Error(`?rain must be between 0 and 1, not ${params.get("rain") ?? ""}`);
  return { rain, sunOut: 1, aurora: sighting(params.get("aurora"), "aurora") };
}

export const SKY_INPUTS: SkyInputs = typeof window === "undefined" ? readSkyInputs("") : readSkyInputs(window.location.search);

/** A seeded night's strength, or the held one: a sight held on shows at its fullest. */
export function sighted(held: Sighting, seeded: number): number {
  if (held === "on") return 1;
  if (held === "off") return 0;
  return seeded;
}
