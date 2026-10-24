import { Color } from "three";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { AtmosphereUniforms } from "../../art/atmosphere";
import type { DogCoatLook } from "../../dogs/coat-look";
import { coatInputs, coatMaterial, type CoatPattern, type CoatValues } from "../animals/coat-material";

interface DogCoat extends CoatValues {
  main: Color;
}

const input = coatInputs<DogCoat>();

const DOG_COAT: CoatPattern = {
  name: "hearthwood-dog-coat",
  sheen: 0.3,
  fur: () => input.colour("main"),
  face: () => undefined,
};

export function dogCoatMaterial(look: DogCoatLook, atmosphere: AtmosphereUniforms) {
  return coatMaterial(DOG_COAT, { main: themeColor(look.colours.phaeomelanin), pupil: new Color(0, 0, 0), glint: new Color(1, 1, 1), blink: 0 }, atmosphere);
}
