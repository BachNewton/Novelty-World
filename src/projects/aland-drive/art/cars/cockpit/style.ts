import { CARS as TUNINGS } from "../../../sim/cars";
import type { CarSpec } from "../build";

/*
 * What a car's cockpit is like, beyond the cabin's own numbers: its instruments,
 * its wheel, its lever, its seats and its colours. Every car gets one from what
 * it is (its class, whether it is electric, whether it is open), so a car with no
 * `interior` of its own still has a good cockpit, and a car that says otherwise
 * changes only what it names.
 */

/**
 * "analogue": two big dials, speed and revs, with a gear window between. "digital": one screen, the speed in figures
 * and the revs (or an electric car's power) as an arc of segments. "classic": two chrome-ringed dials and a row of
 * small ones, fuel, water and oil. "race": one big rev counter with shift lights, the speed and gear in figures.
 */
export type GaugeKind = "analogue" | "digital" | "classic" | "race";
/** "round": three spokes. "flat": flat-bottomed and sporty. "rally": dished, with a marker at the top. "classic": large, thin-rimmed, four slim spokes. "yoke": open at the top. */
export type WheelKind = "round" | "flat" | "rally" | "classic" | "yoke";
/** "lever": a gear stick. "sequential": a tall lever pushed and pulled, beside a rally handbrake. "selector": an electric car's dial. */
export type ShifterKind = "lever" | "sequential" | "selector";
/** "comfort": broad and soft. "sport": bolstered. "bucket": a shell with the headrest in it. */
export type SeatKind = "comfort" | "sport" | "bucket";

export interface InteriorStyle {
  gauges: GaugeKind;
  wheel: WheelKind;
  shifter: ShifterKind;
  seats: SeatKind;
  /** A screen in the middle of the dash, with the clock and the temperature outside. */
  screen: boolean;
  /** A roll cage, with bare painted metal for door cards. */
  cage: boolean;
  /** A band of the car's own paint across the dash, as older cars had. */
  paintedDash: boolean;
  /** Cabin colours: tokens without the `--color-aland-drive-` prefix. */
  colours: {
    dash: string;
    /** Door cards' upper part, the console's sides. */
    trim: string;
    /** Door cards' inserts. */
    insert: string;
    headliner: string;
    /** Rings round the dials, the vents' and handles' edges. */
    accent: string;
    /** What the dials, figures and switches light in after dark. */
    glow: string;
  };
  /** How many turns the wheel takes from straight ahead to full lock. */
  turnsToLock: number;
  /** Metres the driver's eye moves from where the cabin seats it: right, up, back. */
  eye: readonly [x: number, y: number, z: number];
  /**
   * How far up the wheel, as a share of its radius from the hub, the eye's line to the instruments passes. Higher puts
   * the cluster's readouts in the wheel's opening over the hub and column, for a car whose dash stands close behind
   * its wheel.
   */
  clusterSight: number;
}

export type InteriorChoice = Partial<Omit<InteriorStyle, "colours">> & { colours?: Partial<InteriorStyle["colours"]> };

const MODERN = { dash: "car-cabin-dash", trim: "car-cabin-trim", insert: "car-cabin-insert", headliner: "car-cabin-headliner", accent: "car-cabin-metal", glow: "car-cabin-glow-white" };

/** The cockpit a car has: what it is, then what it chose. */
export function interiorOf(spec: Pick<CarSpec, "id" | "interior" | "body">): InteriorStyle {
  const tuning = spec.id === undefined ? null : TUNINGS[spec.id];
  const electric = tuning?.gearbox.idleRpm === 0;
  const rally = tuning?.class === "rally";
  const sports = tuning?.class === "sports";
  const base: InteriorStyle = {
    gauges: electric ? "digital" : rally ? "race" : "analogue",
    wheel: rally ? "rally" : sports || electric ? "flat" : "round",
    shifter: electric ? "selector" : rally ? "sequential" : "lever",
    seats: rally ? "bucket" : sports ? "sport" : "comfort",
    screen: !rally,
    cage: rally,
    paintedDash: false,
    colours: { ...MODERN, glow: electric ? "car-cabin-glow-ice" : rally ? "car-cabin-glow-red" : sports ? "car-cabin-glow-amber" : MODERN.glow },
    turnsToLock: rally ? 1 : sports ? 1.3 : 1.5,
    eye: [0, 0, 0],
    clusterSight: 0.45,
  };
  const chosen = spec.interior ?? {};
  return { ...base, ...chosen, colours: { ...base.colours, ...chosen.colours } };
}
