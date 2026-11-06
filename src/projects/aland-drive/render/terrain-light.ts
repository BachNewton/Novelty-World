/*
 * How the land takes a sun that moves, while its 2 m shading was baked under one fixed sun (sun, cast shadow and open
 * sky in one channel). Three ways, to compare on screen before one is kept:
 *
 * - `baked`: the bake as it is, its contrast easing out as the sun goes down (`art/night`'s own).
 * - `flat`: the bake, dimmed or brightened by how much light flat ground gets from the sun now against the baked sun.
 * - `relit`: the same per slope, by the mesh's own normal, so a hillside turns to or from the sun as it goes round.
 */

export const TERRAIN_LIGHTS = ["baked", "flat", "relit"] as const;
export type TerrainLight = (typeof TERRAIN_LIGHTS)[number];

export function terrainLightAsked(search: string): TerrainLight {
  const asked = new URLSearchParams(search).get("terrain-light") ?? "relit";
  const found = TERRAIN_LIGHTS.find((light) => light === asked);
  if (found === undefined) throw new Error(`?terrain-light= takes ${TERRAIN_LIGHTS.join(", ")}, not ${asked}`);
  return found;
}
