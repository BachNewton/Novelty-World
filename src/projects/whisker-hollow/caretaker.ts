import type { Look } from "./types";

/** The colours a caretaker can pick for each part, in the order the look picker shows them. */
export const LOOK_COLOURS: { readonly [Part in keyof Look]: readonly string[] } = {
  shirt: ["rose", "sage", "sky", "mustard", "lavender"],
  hair: ["chestnut", "black", "ginger", "honey", "silver"],
  skin: ["fair", "peach", "tan", "brown", "deep"],
};

export const LOOK_PARTS = ["shirt", "hair", "skin"] as const satisfies readonly (keyof Look)[];

export const DEFAULT_LOOK: Look = { shirt: "rose", hair: "chestnut", skin: "peach" };

/** The design token a part's colour is drawn from. */
export function lookToken(part: keyof Look, colour: string): string {
  return `--color-wh-${part}-${colour}`;
}
