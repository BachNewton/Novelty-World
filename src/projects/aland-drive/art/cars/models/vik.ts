import type { CarSpec } from "../build";
import { driven, roundLamps, sketched } from "../recipe";

export const vik: CarSpec = sketched({ driven: driven("vik"), paint: "car-paint-oxblood", size: [3.95, 1.55, 1.12], tyre: 0.165, sill: 0.17, hood: 0.72, screen: [-0.28, -0.12, 0.2], tail: "open", nose: "round", rake: 2, spokes: 12, style: "mesh", rim: 0.7, seat: "seatTan", flare: 0.05, decals: roundLamps(0.46, 0.57, 0.15) });
