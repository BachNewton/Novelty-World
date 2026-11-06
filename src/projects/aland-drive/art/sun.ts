import { Vector3, type Node, type UniformNode } from "three/webgpu";
import { uniform, vec3 } from "three/tsl";

/*
 * The sun every material is lit by. A gallery hands a kit a fixed place in the sky; the game hands it the live sun,
 * one uniform that the hour moves. Either way a material reads it as one vector towards the sun, whose length is how
 * strong the sun is: 1 by a clear day, less under cloud, falling to nothing as it sets, so a material's `dot(normal, toSun)` is the direct light
 * at any hour and no material needs to know there is an hour at all.
 */

/** A fixed place in the sky: clockwise from grid north, and up from the horizon. */
export interface SunPlace {
  azimuthDeg: number;
  elevationDeg: number;
}

/** The game's sun, moved by the hour. */
export interface LiveSun {
  /** Towards the sun in the scene's frame, as long as the sun is strong. */
  toSun: UniformNode<"vec3", Vector3>;
}

export type Sun = SunPlace | LiveSun;

const isLive = (sun: Sun): sun is LiveSun => "toSun" in sun;

/** A unit vector towards a place in the sky, in the scene's frame: east +x, up +y, north -z. */
export function towardsPlace({ azimuthDeg, elevationDeg }: SunPlace, into = new Vector3()) {
  const [azimuth, elevation] = [(azimuthDeg * Math.PI) / 180, (elevationDeg * Math.PI) / 180];
  return into.set(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), -Math.cos(azimuth) * Math.cos(elevation));
}

/** The way to the sun, for a shader, as long as the sun is strong. */
export function towardsSun(sun: Sun): Node<"vec3"> {
  if (isLive(sun)) return sun.toSun;
  const { x, y, z } = towardsPlace(sun);
  return vec3(x, y, z);
}

/** The sun's place as the CPU sees it now: for what is worked out once rather than per pixel. */
export function placeOfSun(sun: Sun): SunPlace {
  if (!isLive(sun)) return sun;
  const { x, y, z } = sun.toSun.value.clone().normalize();
  return { azimuthDeg: (Math.atan2(x, -z) * 180) / Math.PI, elevationDeg: (Math.asin(y) * 180) / Math.PI };
}

/** The sun's strength by its height: gone once its disc is under the horizon, full a few degrees above it. */
export function sunStrength(elevationDeg: number) {
  const share = Math.min(1, Math.max(0, (elevationDeg + 1) / 7));
  return share * share * (3 - 2 * share);
}

/** A sun for the game, starting at a place, which `setSun` moves; `through` is the share of it the clouds let through. */
export function createLiveSun(place: SunPlace): LiveSun & { setSun: (place: SunPlace, through?: number) => void } {
  const toSun = uniform(new Vector3());
  const setSun = (next: SunPlace, through = 1) => {
    towardsPlace(next, toSun.value).multiplyScalar(sunStrength(next.elevationDeg) * through);
  };
  setSun(place);
  return { toSun, setSun };
}
