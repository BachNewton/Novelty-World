import type { CarSpec } from "../build";
import { paint } from "../paints";
import { driven, sketched } from "../recipe";

export const strom: CarSpec = sketched({
  driven: driven("strom"),
  paint: "car-paint-mint",
  paints: [
    paint("car-paint-mint"),
    paint("car-paint-ivory", "pearl", { flip: "car-paint-ivory-flip" }),
    paint("car-paint-glacier", "metallic"),
    paint("car-paint-copper", "metallic"),
    paint("car-paint-ultramarine", "metallic"),
    paint("car-paint-graphite", "matte"),
  ],
  size: [4.5, 1.9, 1.62], tyre: 0.235, sill: 0.26, hood: 0.98, screen: [-1.2, -0.3, 1.5], tail: "fast", nose: "smooth", rake: 1.4, rim: 0.74, spokes: 7, style: "aero", belt: 0.14,
});
