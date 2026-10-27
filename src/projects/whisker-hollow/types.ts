export interface Point {
  x: number;
  z: number;
}

/** Where an animal is: waiting where it was lost or left, in a player's arms, or at its pair's home. */
export type Whereabouts = { kind: "lost"; at: Point } | { kind: "carried"; by: string } | { kind: "home" };

export interface Animal {
  /** The pair, and which of it: `<pair>/a` or `<pair>/b`. */
  id: string;
  species: string;
  where: Whereabouts;
}

export interface Naming {
  name: string;
  /** The display name of whoever gave it. */
  by: string;
}

/** A pair both home: who brought the second, and the name the players gave them. */
export interface Pair {
  species: string;
  broughtBy: string;
  naming: Naming | null;
}

/** The saved world: every animal, and every pair reunited so far. */
export interface World {
  animals: Animal[];
  pairs: Pair[];
}

/** What a player's caretaker looks like: a colour from each of `CARETAKER_COLOURS`' choices. */
export interface Look {
  shirt: string;
  hair: string;
  skin: string;
}

/** A player as everyone sees them. Not saved: it lives only while they are here. */
export interface Avatar {
  x: number;
  z: number;
  /** Radians about the vertical, 0 facing +z. */
  heading: number;
  moving: boolean;
  look: Look;
}
