import type { CarSpec } from "../build";
import { paint } from "../paints";
import { driven, roundLamps, sketched } from "../recipe";

/** An old roadster's cockpit: chrome-ringed ivory dials set in a dash in the body's colour, a big thin-rimmed wheel. */
export const vik: CarSpec = {
  ...sketched({
    driven: driven("vik"),
    paint: "car-paint-oxblood",
    paints: [
      paint("car-paint-oxblood"),
      paint("car-paint-racing-green"),
      paint("car-paint-cream"),
      paint("car-paint-powder-blue"),
      paint("car-paint-signal-red"),
      paint("car-paint-black"),
    ],
    size: [3.95, 1.55, 1.12], tyre: 0.165, sill: 0.17, hood: 0.72, screen: [-0.28, -0.12, 0.2], tail: "open", nose: "round", rake: 2, spokes: 12, style: "mesh", rim: 0.7, seat: "seatTan", flare: 0.05, decals: roundLamps(0.46, 0.57, 0.15),
  }),
  interior: { gauges: "classic", wheel: "classic", screen: false, paintedDash: true, colours: { glow: "car-cabin-glow-amber" } },
};
