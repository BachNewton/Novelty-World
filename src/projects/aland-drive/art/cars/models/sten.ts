import type { CarSpec } from "../build";
import { paint } from "../paints";
import { driven, sketched, stripe } from "../recipe";

export const sten: CarSpec = sketched({
  driven: driven("sten"),
  paint: "car-paint-orange",
  paints: [
    paint("car-paint-orange"),
    paint("car-paint-white", "solid", { stripe: "car-paint-signal-red" }),
    paint("car-paint-lime", "solid", { stripe: "car-paint-black" }),
    paint("car-paint-black", "solid", { stripe: "car-paint-orange" }),
    paint("car-paint-ultramarine", "metallic", { stripe: "car-paint-white" }),
    paint("car-paint-silver", "metallic", { stripe: "car-paint-black" }),
  ],
  size: [3.95, 1.78, 1.42], tyre: 0.215, sill: 0.2, hood: 0.86, screen: [-0.92, -0.2, 1.42], tail: "upright", nose: "grille", rake: 0.6, flare: 0.045, spokes: 6, decals: [stripe(0.09, 0, 0.56, 3)], blocks: [{ at: [0, 1.44, -0.05], size: [0.34, 0.04, 0.24], surface: "trim", fine: true }, { at: [0.3, 0.62, -1.99], size: [0.17, 0.17, 0.08], surface: "lensHead", mirror: true }],
});
