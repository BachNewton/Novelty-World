import type { CarSpec } from "../build";
import { paint } from "../paints";
import { driven, sketched } from "../recipe";

/** An old estate's cockpit: chrome-ringed ivory dials and a row of small ones, a wood strip, a thin-rimmed wheel, no screen. */
export const salta: CarSpec = {
  ...sketched({
    driven: driven("salta"),
    paint: "car-paint-sky",
    paints: [
      paint("car-paint-sky"),
      paint("car-paint-cream"),
      paint("car-paint-saddle"),
      paint("car-paint-avocado"),
      paint("car-paint-mint"),
      paint("car-paint-oxblood"),
    ],
    size: [4.75, 1.72, 1.44], tyre: 0.185, sill: 0.2, hood: 0.88, screen: [-0.95, -0.25, 2.0], tail: "upright", nose: "grille", rake: 0.3, roofBars: true, spokes: 8, rim: 0.6, belt: 0.04, seat: "seatTan",
  }),
  interior: { gauges: "classic", wheel: "classic", screen: false, colours: { glow: "car-cabin-glow-amber" } },
};
