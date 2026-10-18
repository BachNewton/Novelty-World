import type { DeerCoat } from "./deer";

/* What the roe deer's coat shader is given: its colour tokens and numbers. */

const TOKEN = (name: string) => `--color-hearthwood-deer-${name}`;

export interface DeerCoatLook {
  colours: { red: string; sandy: string; winter: string; white: string; dark: string; antler: string; eye: string; glint: string; innerEar: string };
  red: number;
  marks: readonly [number, number, number];
}

export function deerCoatLook(coat: DeerCoat): DeerCoatLook {
  return {
    colours: { red: TOKEN("red"), sandy: TOKEN("sandy"), winter: TOKEN("winter"), white: TOKEN("white"), dark: TOKEN("dark"), antler: TOKEN("antler"), eye: TOKEN("eye"), glint: TOKEN("glint"), innerEar: TOKEN("inner-ear") },
    red: coat.red,
    marks: coat.marks,
  };
}
