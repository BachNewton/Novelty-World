import { Color } from "three";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { AtmosphereUniforms } from "../../art/atmosphere";
import type { HedgehogCoatLook } from "../../hedgehogs/coat-look";
import { coatInputs, coatMaterial, type CoatPattern, type CoatValues } from "../animals/coat-material";

interface HedgehogCoat extends CoatValues {
  main: Color;
}

const input = coatInputs<HedgehogCoat>();

const HEDGEHOG_COAT: CoatPattern = {
  name: "hearthwood-hedgehog-coat",
  sheen: 0.18,
  fur: () => input.colour("main"),
  face: () => undefined,
};

export function hedgehogCoatMaterial(look: HedgehogCoatLook, atmosphere: AtmosphereUniforms) {
  return coatMaterial(HEDGEHOG_COAT, { main: themeColor(look.colours.band), pupil: new Color(0, 0, 0), glint: new Color(1, 1, 1), blink: 0 }, atmosphere);
}
