import { Color } from "three";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { AtmosphereUniforms } from "../../art/atmosphere";
import type { DeerCoatLook } from "../../deer/coat-look";
import { coatInputs, coatMaterial, type CoatPattern, type CoatValues } from "../animals/coat-material";

interface DeerCoat extends CoatValues {
  main: Color;
}

const input = coatInputs<DeerCoat>();

const DEER_COAT: CoatPattern = {
  name: "hearthwood-deer-coat",
  sheen: 0.22,
  fur: () => input.colour("main"),
  face: () => undefined,
};

export function deerCoatMaterial(look: DeerCoatLook, _held: number | undefined, atmosphere: AtmosphereUniforms) {
  return coatMaterial(DEER_COAT, { main: themeColor(look.colours.red), pupil: new Color(0, 0, 0), glint: new Color(1, 1, 1), blink: 0 }, atmosphere);
}
