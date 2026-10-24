import { Color } from "three";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { AtmosphereUniforms } from "../../art/atmosphere";
import type { CoatLook } from "../../cats/coat-look";
import { coatInputs, coatMaterial, type CoatPattern, type CoatValues } from "../animals/coat-material";

interface CatCoat extends CoatValues {
  main: Color;
}

const input = coatInputs<CatCoat>();

const CAT_COAT: CoatPattern = {
  name: "hearthwood-cat-coat",
  sheen: 0.3,
  fur: () => input.colour("main"),
  face: () => undefined,
};

export function catCoatMaterial(look: CoatLook, atmosphere: AtmosphereUniforms) {
  return coatMaterial(CAT_COAT, { main: themeColor(look.colours.eumelanin), pupil: new Color(0, 0, 0), glint: new Color(1, 1, 1), blink: 0 }, atmosphere);
}
