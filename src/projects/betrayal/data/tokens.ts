import type { SetId, TokenKind, TokenShape } from "../types";

function kinds(
  shape: TokenShape,
  set: SetId,
  numbered: boolean,
  prefix: string,
  entries: [string, number][],
): TokenKind[] {
  return entries.map(([name, count]) => ({
    id: `${prefix}${name
      .toLowerCase()
      .replace(/'/g, "")
      .replace(/[^a-z0-9]+/g, "-")}`,
    name,
    shape,
    set,
    count,
    numbered,
  }));
}

/** Every token kind and its physical count, as recorded in content/tokens.md.
 *  Widow's Walk's replacement-sheet tokens (the Ghost, the Speed Rolls) count as Widow's Walk. */
export const TOKENS: TokenKind[] = [
  ...kinds("large-circle", "base", false, "monster-", [
    ["Banshee", 1],
    ["Crimson Jack", 1],
    ["Demon Lord", 1],
    ["Dracula", 1],
    ["Dragon", 1],
    ["Frankenstein's Monster", 1],
    ["Mummy", 1],
    ["Ouroboros Head", 2],
    ["Spider", 1],
    ["Witch", 1],
    ["Zombie Lord", 1],
  ]),
  ...kinds("large-circle", "widows-walk", false, "monster-", [
    ["Cat", 1],
    ["Doctor", 1],
    ["Head", 1],
    ["Pirate Queen", 1],
    ["Ghost", 1],
  ]),
  ...kinds("small-circle", "base", true, "monster-", [
    ["Red", 24],
    ["Orange", 24],
    ["Green", 16],
    ["Blue", 9],
    ["Yellow", 6],
    ["Purple", 6],
    ["Magenta", 6],
  ]),
  ...kinds("small-circle", "widows-walk", false, "explorer-", [
    ["White", 6],
    ["Red", 6],
    ["Yellow", 6],
    ["Green", 6],
    ["Blue", 6],
    ["Purple", 6],
  ]),
  ...kinds("square", "base", false, "", [
    ["Below Collapsed Room", 1],
    ["Blessing", 1],
    ["Closet", 1],
    ["Drip", 1],
    ["Safe", 1],
    ["Secret Passage", 2],
    ["Secret Stairs", 2],
    ["Skeletons", 1],
    ["Slide", 1],
    ["Smoke", 1],
    ["Vault Empty", 1],
    ["Wall Switch", 1],
  ]),
  ...kinds("square", "widows-walk", true, "", [
    ["Obstacle", 24],
    ["Plant", 6],
    ["Lock", 4],
  ]),
  ...kinds("square", "widows-walk", false, "", [
    ["Burial Mound", 1],
    ["Fountain", 1],
  ]),
  ...kinds("pentagon", "base", true, "", [["Item", 10]]),
  ...kinds("pentagon", "base", false, "", [["Item Pile", 4]]),
  ...kinds("triangle", "base", false, "", [
    ["Knowledge Roll", 6],
    ["Might Roll", 6],
    ["Sanity Roll", 6],
  ]),
  ...kinds("triangle", "widows-walk", false, "", [["Speed Roll", 3]]),
];
