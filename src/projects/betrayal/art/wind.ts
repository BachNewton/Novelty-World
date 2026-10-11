import * as THREE from "three";
import { createRng } from "@/shared/lib/seeded-random";
import { ROOMS } from "../data/rooms";

/*
 * The air a room's cloth hangs in. Indoors it is still; in an open-air room
 * a gentle breeze blows from one way, rising and falling in gusts. Like
 * everything else that moves, it is a function of the stage's clock alone:
 * its gusts come from smooth noise seeded by the room, never Math.random, so
 * a frozen screenshot always shows the same gust. A haunt or card that
 * whips up the air (the Shrieking Wind) adds its own gust over the room's.
 */

/** The wind's velocity, in metres a second, at a moment on the stage's clock, written into `out`. */
export type Wind = (seconds: number, out: THREE.Vector3) => THREE.Vector3;

export const STILL: Wind = (_, out) => out.set(0, 0, 0);

/** The open-air rooms whose cloth a breeze stirs. The Conservatory and the Solarium are outside on their tiles, but under glass. */
const BREEZY = new Set(["gardens", "graveyard", "patio", "tower", "balcony", "roof-landing", "widows-walk", "tree-house"]);

/** A gentle breeze: its usual speed, and how much stronger its gusts blow, in metres a second. */
const BREEZE = { speed: 1.4, gusts: 3.5 };

/** A smooth wave from -1 to 1 through seeded values a `period` apart: the same at any frame rate and when frozen. */
function smoothNoise(seed: string, period: number): (seconds: number) => number {
  const valueAt = (i: number) => createRng(`${seed}:${i}`).next() * 2 - 1;
  return (seconds) => {
    const at = seconds / period;
    const i = Math.floor(at);
    const on = THREE.MathUtils.smootherstep(at - i, 0, 1);
    return valueAt(i) + (valueAt(i + 1) - valueAt(i)) * on;
  };
}

/** A breeze from one way, `seed` picking which, that rises and falls and now and then gusts, swinging a little about its way. */
export function breeze(seed: string, { speed, gusts } = BREEZE): Wind {
  const way = createRng(`${seed}:way`).next() * Math.PI * 2;
  const [swell, gust, swing] = [smoothNoise(`${seed}:swell`, 2.3), smoothNoise(`${seed}:gust`, 0.9), smoothNoise(`${seed}:swing`, 3.1)];
  return (seconds, out) => {
    const strength = speed * (1 + 0.35 * swell(seconds)) + gusts * Math.max(0, gust(seconds)) ** 2;
    const heading = way + 0.35 * swing(seconds);
    // A breeze blows mostly along the ground, lifting a little as it gusts.
    return out.set(Math.sin(heading), 0.15 * Math.max(0, gust(seconds)), Math.cos(heading)).multiplyScalar(strength);
  };
}

/** A room's own air: a breeze outdoors, still inside. */
export function roomWind(roomId: string): Wind {
  if (!ROOMS.some((room) => room.id === roomId)) throw new Error(`No room tile with id "${roomId}"`);
  return BREEZY.has(roomId) ? breeze(roomId) : STILL;
}

/** The room's wind with a gust over it (the hook for a haunt's or card's wind): `gust` adds its velocity to the room's. */
export function withGust(wind: Wind, gust: Wind): Wind {
  const extra = new THREE.Vector3();
  return (seconds, out) => wind(seconds, out).add(gust(seconds, extra));
}

/** Says what air a figure (or anything holding figures) stands in; its cloth finds it by `windOf`. */
export function blowsOn<T extends THREE.Object3D>(object: T, wind: Wind): T {
  object.userData.wind = wind;
  return object;
}

/** The wind the nearest holder of `object` says it stands in, or still air. */
export function windOf(object: THREE.Object3D): Wind {
  for (let at: THREE.Object3D | null = object; at; at = at.parent) {
    const { wind } = at.userData as { wind?: Wind };
    if (wind) return wind;
  }
  return STILL;
}
