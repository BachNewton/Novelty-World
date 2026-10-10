import { RAMPS, type PaletteKey } from "../palette";

/** A skin tone a face can wear: any step of the skin ramp but its shadow. */
export type SkinTone = Exclude<(typeof RAMPS.skin)[number], "skinShadow">;

/** Every explorer's skin, by character id, as the published game portrays them in broad terms. */
export const SKIN_TONES: Readonly<Partial<Record<string, SkinTone>>> = {
  "father-rhinehardt": "skinLight",
  "professor-longfellow": "skinLight",
  "darrin-flash-williams": "skinDeep",
  "ox-bellows": "skinLight",
  "zoe-ingstrom": "skinFair",
  "missy-dubourde": "skinFair",
  "brandon-jaspers": "skinLight",
  "peter-akimoto": "skinTan",
  "vivian-lopez": "skinTan",
  "madame-zostra": "skinBrown",
  "heather-granville": "skinFair",
  "jenny-leclerc": "skinLight",
};

export function skinOf(character: string): SkinTone {
  const tone = SKIN_TONES[character];
  if (tone === undefined) throw new Error(`No skin tone for "${character}"`);
  return tone;
}

/** A skin tone's shade, for stubble or a crease: the next step down the ramp. */
export function skinShade(tone: SkinTone): PaletteKey {
  const ramp: readonly PaletteKey[] = RAMPS.skin;
  return ramp[ramp.indexOf(tone) - 1];
}
