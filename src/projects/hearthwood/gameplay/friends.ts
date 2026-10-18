import type { Companion } from "./companions";

/*
 * What befriending remembers: the companions (who each is, by its stray's id
 * and seed, its species, the name Elliott gave it, and whether it follows or
 * waits at camp), and how warm each stray Elliott has met is to them, so a
 * cat half won over stays half won over, for as long as the visit lasts.
 */

export interface Friends {
  companions: Companion[];
  /** Each stray met but not yet won, by its id, with its warmth. */
  warmth: Record<string, number>;
}

export function noFriends(): Friends {
  return { companions: [], warmth: {} };
}
