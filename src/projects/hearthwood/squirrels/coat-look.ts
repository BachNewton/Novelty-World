import type { SquirrelCoat } from "./squirrel";

/*
 * What the squirrel's coat shader is given: its colour tokens and numbers.
 */

const TOKEN = (name: string) => `--color-hearthwood-squirrel-${name}`;

export interface SquirrelCoatLook {
  colours: { red: string; dark: string; winter: string; belly: string; eye: string; glint: string; nose: string; innerEar: string };
  darkness: number;
  tufts: number;
  marks: readonly [number, number, number];
}

export function squirrelCoatLook(coat: SquirrelCoat): SquirrelCoatLook {
  return {
    colours: { red: TOKEN("red"), dark: TOKEN("dark"), winter: TOKEN("winter"), belly: TOKEN("belly"), eye: TOKEN("eye"), glint: TOKEN("glint"), nose: TOKEN("nose"), innerEar: TOKEN("inner-ear") },
    darkness: coat.darkness,
    tufts: coat.tufts,
    marks: coat.marks,
  };
}
