import type { CarSpec } from "../build";
import { driven, sketched, stripe } from "../recipe";

export const ankar: CarSpec = sketched({ driven: driven("ankar"), paint: "car-paint-black", size: [5.1, 1.92, 1.46], tyre: 0.245, sill: 0.19, hood: 0.92, screen: [-0.95, -0.2, 1.0], tail: "notch", nose: "grille", rake: 0.4, spokes: 10, rim: 0.74, seat: "seatTan", decals: [stripe(0.012, 0, 0.8, 4.2)] });
