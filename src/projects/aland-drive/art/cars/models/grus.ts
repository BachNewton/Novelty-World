import type { CarSpec } from "../build";
import { driven, hoodStripe, sketched, stripe } from "../recipe";

export const grus: CarSpec = sketched({ driven: driven("grus"), paint: "car-paint-white", size: [4.2, 1.88, 1.34], tyre: 0.245, sill: 0.2, hood: 0.8, screen: [-0.78, -0.08, 0.8], tail: "fast", nose: "paint", rake: 1.6, flare: 0.06, rim: 0.7, spokes: 6, rearSeats: false, decals: [hoodStripe(0.14, 0.18, -1.45, 1.35), stripe(0.14, 0, 0.5, 3)], wing: { z: 1.85, h: 1.2, halfWidth: 0.78, chord: 0.14, rise: 0.045 } });
