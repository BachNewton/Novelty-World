import type { CarSpec } from "../build";
import { driven, sketched } from "../recipe";

export const strom: CarSpec = sketched({ driven: driven("strom"), paint: "car-paint-mint", size: [4.5, 1.9, 1.62], tyre: 0.235, sill: 0.26, hood: 0.98, screen: [-1.2, -0.3, 1.5], tail: "fast", nose: "smooth", rake: 1.4, rim: 0.74, spokes: 3, twin: true, belt: 0.14 });
