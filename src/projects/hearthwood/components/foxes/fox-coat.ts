import { Color } from "three";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { AtmosphereUniforms } from "../../art/atmosphere";
import type { FoxCoatLook } from "../../foxes/coat-look";
import { coatInputs, coatMaterial, type CoatPattern, type CoatValues } from "../animals/coat-material";

interface FoxCoat extends CoatValues {
  main: Color;
}

const input = coatInputs<FoxCoat>();

const FOX_COAT: CoatPattern = {
  name: "hearthwood-fox-coat",
  sheen: 0.3,
  fur: () => input.colour("main"),
  face: () => undefined,
};

export function foxCoatMaterial(look: FoxCoatLook, atmosphere: AtmosphereUniforms) {
  return coatMaterial(FOX_COAT, { main: themeColor(look.colours.red), pupil: new Color(0, 0, 0), glint: new Color(1, 1, 1), blink: 0 }, atmosphere);
}
