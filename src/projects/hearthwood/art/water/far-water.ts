import type { AtmosphereUniforms } from "../atmosphere";
import type { Palette } from "../palette";
import type { SkyUniforms } from "../sky/sky";
import { waterMaterial, type WaterMaterial } from "./water";

/*
 * Far water: lakes in the coarse tiles out past where the water is drawn in
 * full, so water reads all the way to the horizon. It is the near water's
 * own material, so the same graph and the same pipeline: out there a pixel
 * spans more surface than any ripple, streak or sparkle, which fade out,
 * leaving the colour by depth and the sky mirrored, flat and still. The
 * world builds far water only while its feature is on.
 */
export function farWaterMaterial(palette: Palette, atmosphere: AtmosphereUniforms, sky: SkyUniforms): WaterMaterial {
  return waterMaterial(palette, atmosphere, sky);
}
