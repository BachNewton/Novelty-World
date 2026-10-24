import { Color } from "three";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { AtmosphereUniforms } from "../../art/atmosphere";
import type { HareCoatLook } from "../../hares/coat-look";
import { coatInputs, coatMaterial, type CoatPattern, type CoatValues } from "../animals/coat-material";

interface HareCoat extends CoatValues {
  main: Color;
}

const input = coatInputs<HareCoat>();

const HARE_COAT: CoatPattern = {
  name: "hearthwood-hare-coat",
  sheen: 0.3,
  fur: () => input.colour("main"),
  face: () => undefined,
};

export function hareCoatMaterial(look: HareCoatLook, _held: number | undefined, atmosphere: AtmosphereUniforms) {
  return coatMaterial(HARE_COAT, { main: themeColor(look.colours.brown), pupil: new Color(0, 0, 0), glint: new Color(1, 1, 1), blink: 0 }, atmosphere);
}
