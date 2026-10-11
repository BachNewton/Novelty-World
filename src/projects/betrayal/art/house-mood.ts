import * as THREE from "three";
import { HOUSE_LIGHT } from "./lighting";
import { paletteHex, type PaletteKey } from "./palette";
import { pageSearch } from "./page-search";

/*
 * The house's light as a whole, beyond what each room bakes: the fill every
 * surface takes from the sky and the ground, and the fog the far side of
 * the house fades into. Exploring, it is the cold moon blue of the house
 * itself; at the haunt's reveal it turns to the red of danger and the
 * traitor (CLAUDE.md, "Visual style": colour has a meaning), and stays so
 * for the rest of the game. It is live light, never baked: the shift costs
 * a few colours a frame, and no room re-bakes for it.
 */

export type HouseMood = "explore" | "haunt";

interface MoodSpec {
  sky: PaletteKey;
  ground: PaletteKey;
  intensity: number;
  fog: PaletteKey;
}

/** The haunt's light, two looks to compare (`?mood=red`, the default, or
 *  `?mood=cold`): the house turned blood red, or its moon blue pushed deeper
 *  and darker, leaving red to the traitor's ring alone. */
const HAUNT_MOODS = {
  red: { sky: "bloodLight", ground: "bloodDark", intensity: 2.4, fog: "bloodDark" },
  cold: { sky: "moonDark", ground: HOUSE_LIGHT.fill.ground, intensity: 3, fog: "void" },
} satisfies Record<string, MoodSpec>;

function hauntMood(): MoodSpec {
  const value = new URLSearchParams(pageSearch()).get("mood") ?? "red";
  if (value !== "red" && value !== "cold") throw new Error(`mood=${value}: it is red or cold`);
  return HAUNT_MOODS[value];
}

const MOODS: Record<HouseMood, MoodSpec> = {
  explore: { sky: HOUSE_LIGHT.fill.sky, ground: HOUSE_LIGHT.fill.ground, intensity: HOUSE_LIGHT.fill.intensity, fog: HOUSE_LIGHT.fog.colour },
  haunt: hauntMood(),
};

/** How long the light takes to shift at the reveal, in seconds. */
export const MOOD_SHIFT_SECONDS = 2.5;

interface MoodLight {
  sky: THREE.Color;
  ground: THREE.Color;
  intensity: number;
  fog: THREE.Color;
}

function lightOf(mood: HouseMood): MoodLight {
  const spec = MOODS[mood];
  return { sky: new THREE.Color(paletteHex(spec.sky)), ground: new THREE.Color(paletteHex(spec.ground)), intensity: spec.intensity, fog: new THREE.Color(paletteHex(spec.fog)) };
}

function lightNow(fill: THREE.HemisphereLight, fog: THREE.Fog): MoodLight {
  return { sky: fill.color.clone(), ground: fill.groundColor.clone(), intensity: fill.intensity, fog: fog.color.clone() };
}

/** The house's mood, shown on its fill light, fog and background, and shifted
 *  smoothly on the stage's clock. */
export function houseMood(fill: THREE.HemisphereLight, fog: THREE.Fog, background: THREE.Color) {
  let mood: HouseMood = "explore";
  let shift: { from: MoodLight; to: MoodLight; start: number | null } | null = null;

  const show = (light: MoodLight) => {
    fill.color.copy(light.sky);
    fill.groundColor.copy(light.ground);
    fill.intensity = light.intensity;
    fog.color.copy(light.fog);
    background.copy(light.fog);
  };

  return {
    /** Sets the mood: shifting to it over a moment, or at once (a game resumed mid-haunt). */
    set(next: HouseMood, { shifting }: { shifting: boolean }) {
      if (next === mood) return;
      mood = next;
      if (shifting) shift = { from: lightNow(fill, fog), to: lightOf(next), start: null };
      else {
        shift = null;
        show(lightOf(next));
      }
    },
    update(seconds: number) {
      if (!shift) return;
      shift.start ??= seconds;
      const t = Math.min(1, (seconds - shift.start) / MOOD_SHIFT_SECONDS);
      const eased = t * t * (3 - 2 * t);
      const { from, to } = shift;
      show({
        sky: from.sky.clone().lerp(to.sky, eased),
        ground: from.ground.clone().lerp(to.ground, eased),
        intensity: THREE.MathUtils.lerp(from.intensity, to.intensity, eased),
        fog: from.fog.clone().lerp(to.fog, eased),
      });
      if (t >= 1) shift = null;
    },
    mood: () => mood,
  };
}
