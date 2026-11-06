import { LIGHTHOUSE_LAMP_M, LIGHTHOUSE_LANTERN_M, LIGHTHOUSE_TOP_M } from "../art/identity/index";
import { LIGHTS_ON_MARKS, REGISTER_MARKS } from "./lights-on-marks";

/*
 * Every lighthouse not drawn as a landmark of its own is the one generic tower (`art/identity`), scaled to the real
 * one: as tall as the register says it stands, or, where it says nothing, with its lamp at its light's height; one
 * with neither keeps the model's own height. Its light shines from that tower's lamp.
 */

const place = (x: number, z: number) => `${x},${z}`;
const lightHeights = new Map(LIGHTS_ON_MARKS.flatMap(({ x, z, heightM }) => (heightM === null ? [] : [[place(x, z), heightM] as const])));

/** How much the generic tower is scaled for a lighthouse at this place, with the register's height (0 where it gives none). */
export function lighthouseScale(registerHeightM: number, x: number, z: number): number {
  if (registerHeightM > 0) return registerHeightM / LIGHTHOUSE_TOP_M;
  const lightM = lightHeights.get(place(x, z));
  return lightM === undefined ? 1 : lightM / LIGHTHOUSE_LAMP_M;
}

/** A margin past the lantern's roof, so its light is never inside it from any side. */
const LANTERN_CLEAR_M = 0.3;

/** Each register lighthouse's place, by `x,z`: its lamp's height above its foot, and how far its lantern reaches round it. */
export const LIGHTHOUSE_LAMPS = new Map(
  REGISTER_MARKS.filter(([model]) => model === "lighthouse").map(([, x, z, , , heightM = 0]) => {
    const scale = lighthouseScale(heightM, x, z);
    return [place(x, z), { upM: LIGHTHOUSE_LAMP_M * scale, outM: LIGHTHOUSE_LANTERN_M * scale + LANTERN_CLEAR_M }] as const;
  }),
);

export const lampAt = (x: number, z: number) => LIGHTHOUSE_LAMPS.get(place(x, z));
