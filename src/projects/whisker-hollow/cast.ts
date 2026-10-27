import { MODEL_HEIGHTS } from "./models/heights";
import { POLY_MODELS } from "./models/poly-models";

/**
 * A species in the hunt: a pair of animals with a home of their own. Most
 * pairs are two of one model; where Poly by Google made the same animal twice,
 * the two files are the pair.
 */
export interface Species {
  /** The pair's first model's id. */
  id: string;
  /** What the album and the prompts call it. */
  name: string;
  /** The model each animal of the pair is drawn with. */
  models: readonly [string, string];
}

export function heightOf(modelId: string): number {
  if (!(modelId in MODEL_HEIGHTS)) throw new Error(`whisker hollow: no height for model ${modelId}`);
  return MODEL_HEIGHTS[modelId];
}

export const CAST: readonly Species[] = POLY_MODELS.filter(
  (m) => m.kind === "animal" && m.duplicateOf === null,
).map((m) => {
  const twin = POLY_MODELS.find((other) => other.duplicateOf === m.id);
  return { id: m.id, name: m.title, models: [m.id, twin?.id ?? m.id] };
});

export function speciesOrThrow(id: string): Species {
  const species = CAST.find((s) => s.id === id);
  if (species === undefined) throw new Error(`whisker hollow: no species ${id}`);
  return species;
}
