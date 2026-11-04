/*
 * What a tyre is on, and how that changes its grip: a table of surface by
 * condition. Each entry reshapes the car's own tyre curve rather than replacing
 * it, so every car keeps its character on every surface: a grippy car is still
 * the grippiest on gravel, a tail-happy one still lets go first on ice.
 *
 * The numbers keep the real order of surfaces (asphalt over rock over gravel
 * over grass, dry over wet over snow over ice) but squeeze the gaps, as the
 * open-world driving games do: real gravel has about two thirds of asphalt's
 * grip and ice a tenth, and here they have three quarters and a quarter, so
 * off the tarmac is slower and looser but still drivable at speed.
 *
 * Asphalt when dry is the car exactly as it is tuned: a grip of 1, no change to
 * the curve and nothing more to roll against, so it drives as it did before
 * surfaces existed, to the last bit.
 */

export const SURFACES = ["asphalt", "gravel", "grass", "rock"] as const;
export type Surface = (typeof SURFACES)[number];

export const CONDITIONS = ["dry", "wet", "snow", "ice"] as const;
/** The state of every surface at once: what the weather and the season will set. */
export type Condition = (typeof CONDITIONS)[number];

export const isCondition = (name: string): name is Condition => (CONDITIONS as readonly string[]).includes(name);

/** The condition a link asks for (`?condition=wet`), until weather sets it: dry when it asks for none. */
export function conditionAsked(search: string): Condition {
  const asked = new URLSearchParams(search).get("condition");
  if (asked === null) return "dry";
  if (!isCondition(asked)) throw new Error(`?condition= takes ${CONDITIONS.join(", ")}, not ${asked}`);
  return asked;
}

export interface SurfaceGrip {
  /** Times the car's own peak grip, front and rear alike. */
  grip: number;
  /** Times the slip angle grip peaks at: loose ground grips best at a wider angle, so it lets go later and more gently. */
  peakSlip: number;
  /** How much of the grip a tyre loses past its peak is kept: 0 is the car's own let-go, 1 holds the peak however far it slides. A loose surface keeps pushing in a slide, which is what makes it predictable. */
  holdOn: number;
  /** Rolling against the ground, as a share of the load on the tyre: soft ground holds the car back. */
  rolling: number;
  /** More rolling with every metre a second, as a share of the load: soft ground slows a fast car most. */
  rollingPerMS: number;
}

const FIRM: SurfaceGrip = { grip: 1, peakSlip: 1, holdOn: 0, rolling: 0, rollingPerMS: 0 };

export const SURFACE_GRIP: Readonly<Record<Condition, Readonly<Record<Surface, SurfaceGrip>>>> = {
  dry: {
    asphalt: FIRM,
    rock: { grip: 0.88, peakSlip: 1.1, holdOn: 0.15, rolling: 0.006, rollingPerMS: 0 },
    gravel: { grip: 0.74, peakSlip: 1.5, holdOn: 0.55, rolling: 0.012, rollingPerMS: 0.0004 },
    grass: { grip: 0.62, peakSlip: 1.4, holdOn: 0.45, rolling: 0.03, rollingPerMS: 0.0012 },
  },
  wet: {
    asphalt: { grip: 0.8, peakSlip: 0.95, holdOn: 0.05, rolling: 0, rollingPerMS: 0 },
    // Wet granite under lichen is slicker than the gravel beside it.
    rock: { grip: 0.6, peakSlip: 1.1, holdOn: 0.15, rolling: 0.006, rollingPerMS: 0 },
    gravel: { grip: 0.68, peakSlip: 1.5, holdOn: 0.55, rolling: 0.014, rollingPerMS: 0.0005 },
    grass: { grip: 0.48, peakSlip: 1.4, holdOn: 0.45, rolling: 0.04, rollingPerMS: 0.0016 },
  },
  snow: {
    asphalt: { grip: 0.45, peakSlip: 1.6, holdOn: 0.6, rolling: 0.01, rollingPerMS: 0.0005 },
    rock: { grip: 0.42, peakSlip: 1.6, holdOn: 0.6, rolling: 0.012, rollingPerMS: 0.0006 },
    gravel: { grip: 0.46, peakSlip: 1.6, holdOn: 0.6, rolling: 0.014, rollingPerMS: 0.0007 },
    grass: { grip: 0.42, peakSlip: 1.6, holdOn: 0.6, rolling: 0.03, rollingPerMS: 0.0015 },
  },
  ice: {
    asphalt: { grip: 0.24, peakSlip: 0.8, holdOn: 0.35, rolling: 0, rollingPerMS: 0 },
    rock: { grip: 0.24, peakSlip: 0.8, holdOn: 0.35, rolling: 0, rollingPerMS: 0 },
    gravel: { grip: 0.3, peakSlip: 1, holdOn: 0.4, rolling: 0.004, rollingPerMS: 0 },
    grass: { grip: 0.3, peakSlip: 1, holdOn: 0.4, rolling: 0.015, rollingPerMS: 0.0005 },
  },
};

/** What the steering and the yaw assist read: the grip and peak slip under the grounded wheels, on average. */
export interface Footing {
  grip: number;
  peakSlip: number;
}

export const FIRM_FOOTING: Footing = { grip: 1, peakSlip: 1 };
