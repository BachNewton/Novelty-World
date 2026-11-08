import type { CarSpec } from "../build";
import { paint } from "../paints";
import { driven, roundLamps, sketched } from "../recipe";

export const berg: CarSpec = sketched({
  driven: driven("berg"),
  paint: "car-paint-cream",
  paints: [
    paint("car-paint-cream"),
    paint("car-paint-olive", "matte"),
    paint("car-paint-sand", "matte"),
    paint("car-paint-brick"),
    paint("car-paint-sky"),
    paint("car-paint-grey"),
  ],
  size: [4.4, 1.84, 1.92], tyre: 0.26, sill: 0.42, hood: 1.24, screen: [-1.0, -0.62, 1.98], tail: "box", nose: "round", rake: 0.2, spokes: 5, rim: 0.56, belt: 0.02, decals: roundLamps(0.56, 0.98, 0.2), roofBars: true, blocks: [{ at: [0, 1.15, 2.3], size: [0.72, 0.72, 0.2], surface: "tyre" }],
});
