import { MINI_CHARACTERS_PATH } from "./characters";

/**
 * Every weapon in Kenney's Mini Characters pack, by its file's name, with the point
 * in its own model that the hand closes round. The sword's and the shooter's models
 * have it at their origin; the bow's and the spear's origin is their bottom end.
 */
const WEAPON_GRIPS = {
  sword: [0, 0, 0],
  spear: [0, 0.2, 0],
  bow: [0, 0.24, 0.19],
  arrow: [0, 0, 0],
  shooter: [0, 0, 0],
} as const satisfies Record<string, readonly [number, number, number]>;

export interface Weapon {
  id: string;
  name: string;
  url: string;
  grip: readonly [number, number, number];
}

export type Hand = "right" | "left";

export const HANDS: readonly Hand[] = ["right", "left"];

export const WEAPONS: readonly Weapon[] = Object.entries(WEAPON_GRIPS).map(([id, grip]) => ({
  id,
  name: id.charAt(0).toUpperCase() + id.slice(1),
  url: `${MINI_CHARACTERS_PATH}/weapon-${id}.glb`,
  grip,
}));

export function weaponOrThrow(id: string): Weapon {
  const weapon = WEAPONS.find((w) => w.id === id);
  if (weapon === undefined) throw new Error(`adventure: no weapon ${id}`);
  return weapon;
}
