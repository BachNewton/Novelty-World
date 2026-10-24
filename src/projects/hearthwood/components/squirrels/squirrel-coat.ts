import { Color } from "three";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { AtmosphereUniforms } from "../../art/atmosphere";
import type { SquirrelCoatLook } from "../../squirrels/coat-look";
import { coatInputs, coatMaterial, type CoatPattern, type CoatValues } from "../animals/coat-material";

interface SquirrelCoat extends CoatValues {
  main: Color;
}

const input = coatInputs<SquirrelCoat>();

const SQUIRREL_COAT: CoatPattern = {
  name: "hearthwood-squirrel-coat",
  sheen: 0.3,
  fur: () => input.colour("main"),
  face: () => undefined,
};

export function squirrelCoatMaterial(look: SquirrelCoatLook, _held: number | undefined, atmosphere: AtmosphereUniforms) {
  return coatMaterial(SQUIRREL_COAT, { main: themeColor(look.colours.red), pupil: new Color(0, 0, 0), glint: new Color(1, 1, 1), blink: 0 }, atmosphere);
}
