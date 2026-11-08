import type { CarSpec } from "../build";
import { driven, sketched } from "../recipe";

export const bris: CarSpec = sketched({ driven: driven("bris"), paint: "car-paint-white", size: [4.3, 1.8, 1.3], tyre: 0.225, sill: 0.18, hood: 0.84, screen: [-0.6, -0.1, 0.3], tail: "open", nose: "paint", rake: 1.3, rim: 0.74, seat: "seatTan", rearSeats: true });
