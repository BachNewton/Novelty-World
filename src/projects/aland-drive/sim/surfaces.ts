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
 *
 * On top of that, each car has a class: what it was built for, its tyres and
 * its suspension, as Test Drive Unlimited 2 sorts its cars. A class changes how
 * a surface treats the car, so the order of the cars changes with the ground:
 * a sports car wins on asphalt and struggles on gravel, where a rally car or a
 * four-by-four wins. Every class is the car as tuned on dry asphalt, because a
 * car's own numbers already say how it does there. A class is one field of a
 * car, so a tuning shop could later move a car between them.
 */

export const SURFACES = ["asphalt", "gravel", "grass", "rock"] as const;
export type Surface = (typeof SURFACES)[number];

export const CONDITIONS = ["dry", "wet", "snow", "ice"] as const;
/** The state of every surface at once: what the weather and the season will set. */
export type Condition = (typeof CONDITIONS)[number];

export const CAR_CLASSES = ["sports", "road", "rally", "offroad"] as const;
/** What a car was built for: low and stiff on sticky tyres, an ordinary car, a car for gravel stages, or one for no road at all. */
export type CarClass = (typeof CAR_CLASSES)[number];

export const isCondition = (name: string): name is Condition => (CONDITIONS as readonly string[]).includes(name);

/** The condition a link holds (`?condition=wet`) in place of the weather's, or null when it asks for none. */
export function conditionAsked(search: string): Condition | null {
  const asked = new URLSearchParams(search).get("condition");
  if (asked === null) return null;
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

/** How a class fares on a surface, against an ordinary car: times the surface's grip, its hold-on past the peak, and its rolling. */
interface ClassOnSurface {
  grip: number;
  holdOn: number;
  rolling: number;
}

const AS_TUNED: ClassOnSurface = { grip: 1, holdOn: 1, rolling: 1 };

/**
 * Each class on each surface, and in each condition times the surface's grip. A sports car's wide, soft tyres
 * snatch and then let go on gravel, and its low nose ploughs grass; a rally car's tyres and long travel keep a
 * gravel slide going; a four-by-four's tall, knobbly tyres barely notice grass, and bite into snow.
 */
const CLASS_GRIP: Readonly<Record<CarClass, { surfaces: Readonly<Record<Surface, ClassOnSurface>>; conditions: Readonly<Record<Condition, number>> }>> = {
  sports: {
    surfaces: { asphalt: AS_TUNED, rock: { grip: 0.9, holdOn: 0.7, rolling: 1.5 }, gravel: { grip: 0.65, holdOn: 0.5, rolling: 1.5 }, grass: { grip: 0.62, holdOn: 0.5, rolling: 2.5 } },
    conditions: { dry: 1, wet: 0.95, snow: 0.75, ice: 0.85 },
  },
  road: {
    surfaces: { asphalt: AS_TUNED, rock: AS_TUNED, gravel: AS_TUNED, grass: { grip: 0.85, holdOn: 1, rolling: 1 } },
    conditions: { dry: 1, wet: 1, snow: 1, ice: 1 },
  },
  rally: {
    surfaces: { asphalt: AS_TUNED, rock: { grip: 1.05, holdOn: 1.2, rolling: 0.8 }, gravel: { grip: 1.17, holdOn: 1.4, rolling: 0.7 }, grass: { grip: 1, holdOn: 1.2, rolling: 0.8 } },
    conditions: { dry: 1, wet: 1, snow: 1.2, ice: 1.1 },
  },
  offroad: {
    surfaces: { asphalt: AS_TUNED, rock: { grip: 1.1, holdOn: 1.2, rolling: 0.6 }, gravel: { grip: 1.5, holdOn: 1.3, rolling: 0.5 }, grass: { grip: 1.6, holdOn: 1.3, rolling: 0.4 } },
    conditions: { dry: 1, wet: 1, snow: 1.25, ice: 1.1 },
  },
};

function classGrip(carClass: CarClass, condition: Condition, surface: Surface): SurfaceGrip {
  const ground = SURFACE_GRIP[condition][surface];
  const { surfaces, conditions } = CLASS_GRIP[carClass];
  const on = surfaces[surface];
  return {
    grip: ground.grip * on.grip * conditions[condition],
    peakSlip: ground.peakSlip,
    holdOn: Math.min(1, ground.holdOn * on.holdOn),
    rolling: ground.rolling * on.rolling,
    rollingPerMS: ground.rollingPerMS * on.rolling,
  };
}

const each = <Key extends string, Value>(keys: readonly Key[], value: (key: Key) => Value) => Object.fromEntries(keys.map((key) => [key, value(key)])) as Record<Key, Value>;

/** What a tyre of each class has on each surface in each condition, worked out once: the car reads it every step for every wheel. */
export const GROUND_GRIP: Readonly<Record<CarClass, Readonly<Record<Condition, Readonly<Record<Surface, SurfaceGrip>>>>>> = each(CAR_CLASSES, (carClass) =>
  each(CONDITIONS, (condition) => each(SURFACES, (surface) => classGrip(carClass, condition, surface))),
);

/** What the steering and the yaw assist read: the grip and peak slip under the grounded wheels, on average. */
export interface Footing {
  grip: number;
  peakSlip: number;
}

export const FIRM_FOOTING: Footing = { grip: 1, peakSlip: 1 };
