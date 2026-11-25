/** Where the Mini Characters pack is served: each character's GLB, with the colour map they share in `Textures/` beside them. */
const CHARACTERS_PATH = "/adventure/characters";

/** Every character in Kenney's Mini Characters pack, by its file's name. */
const CHARACTER_IDS = [
  "female-a",
  "female-b",
  "female-c",
  "female-d",
  "female-e",
  "female-f",
  "male-a",
  "male-b",
  "male-c",
  "male-d",
  "male-e",
  "male-f",
  "male-g",
  "alien",
  "knight",
  "raider",
  "robot",
  "soldier",
  "worker",
  "zombie",
] as const;

export interface Character {
  id: string;
  name: string;
  url: string;
}

function nameOf(id: string): string {
  return id
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export const CHARACTERS: readonly Character[] = CHARACTER_IDS.map((id) => ({
  id,
  name: nameOf(id),
  url: `${CHARACTERS_PATH}/character-${id}.glb`,
}));

export function characterOrThrow(id: string): Character {
  const character = CHARACTERS.find((c) => c.id === id);
  if (character === undefined) throw new Error(`adventure: no character ${id}`);
  return character;
}
