/** Where the Cube Pets pack is served: its animals' GLBs, with the colour map they all share in `Textures/` beside them. */
export const CUBE_PETS_PATH = "/adventure/cube-pets";

/**
 * The one scale the whole pack is drawn at. As made, its animals stand 1.4 to
 * 2 tall (most about 1.6), twice a character's height; at this they stand
 * about half a character's.
 */
export const ANIMAL_SCALE = 0.25;

/** Every animal in Kenney's Cube Pets pack, by its file's name. */
const ANIMAL_IDS = [
  "beaver",
  "bee",
  "bunny",
  "cat",
  "caterpillar",
  "chick",
  "cow",
  "crab",
  "deer",
  "dog",
  "elephant",
  "fish",
  "fox",
  "giraffe",
  "hog",
  "koala",
  "lion",
  "monkey",
  "panda",
  "parrot",
  "penguin",
  "pig",
  "polar",
  "tiger",
] as const;

export type AnimalId = (typeof ANIMAL_IDS)[number];

export interface Animal {
  id: AnimalId;
  name: string;
  url: string;
}

export const ANIMALS: readonly Animal[] = ANIMAL_IDS.map((id) => ({
  id,
  name: id === "polar" ? "Polar Bear" : id.charAt(0).toUpperCase() + id.slice(1),
  url: `${CUBE_PETS_PATH}/animal-${id}.glb`,
}));

export function animalOrThrow(id: AnimalId): Animal {
  const animal = ANIMALS.find((a) => a.id === id);
  if (animal === undefined) throw new Error(`adventure: no animal ${id}`);
  return animal;
}
