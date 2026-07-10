import { DAYLIGHT_EFFICACY, WATTS_PER_UNIT } from "./lighting";
import { luminance, type Rgb } from "./sky-model";

/**
 * IALA navigation marks and their lights — the specification, as pure data and pure functions.
 *
 * ## Why this belongs in a *lighting* project
 *
 * Everything in this renderer so far has exactly one light source. The brief was explicit that
 * nothing may assume that, and a lit navigation buoy is the honest test: a **second emitter**, of a
 * known luminous intensity, at night, metres from the camera, under the same exposure as the sun.
 * If the model is right, a 25 cd lantern at 40 m reads the way a real one does; if the exposure is
 * secretly keyed to the sun, it will not.
 *
 * ## Region A, which is the opposite of what most people remember
 *
 * Finland is **IALA Region A**: entering from seaward, **PORT is RED and STARBOARD is GREEN**. The
 * mnemonic "red right returning" is Region B (the Americas, Japan, Korea) and is *wrong here*.
 *
 * ## Photometry: nominal range is a real, defined number
 *
 * A chart prints a light's **nominal range** in nautical miles. That is its luminous range when the
 * meteorological visibility is exactly 10 NM, i.e. atmospheric transmissivity `T = 0.74` per NM. It
 * inverts through **Allard's Law** to a luminous intensity in candela:
 *
 *     E = I · T^d / d²        →        I = E_t · d² · T^(−d)
 *
 * with the night threshold illuminance at the eye `E_t = 2×10⁻⁷ lux`, agreed at Paris in 1933 and
 * still what every List of Lights is computed against. In nautical miles that collapses to
 * `I = 0.686 · d² · 0.74^(−d)`, which is the form used below. Sanity check that IALA itself quotes:
 * 500 cd ≈ 8 NM. This function returns 488 cd at 8 NM.
 *
 * ## Blondel–Rey is deliberately NOT applied
 *
 * A 0.25 s flash *looks* dimmer than the same lamp burning steady, because the eye integrates over
 * ~0.2 s. That is a property of the observer, not of the lamp. We render the lamp's actual
 * instantaneous intensity and let the person looking at the screen do their own integrating. Baking
 * an effective-intensity factor into the emitter would count the eye twice.
 *
 * Sources: IALA R1001 (Maritime Buoyage System), E-110 Ed. 4 (Rhythmic Characters of Lights),
 * E-200-1 (Marine Signal Lights — Colours), E-200-2 / IALA Dictionary (Allard's Law, nominal range).
 * Traficom + Finnish Wikipedia for the Region-A confirmation and the spar-buoy (`viitta`) tradition.
 */

// --- Photometry --------------------------------------------------------------

/** Threshold illuminance at the eye at night, lux. ITCLA Paris 1933; used by every List of Lights. */
export const NIGHT_THRESHOLD_LUX = 2e-7;

/** Atmospheric transmissivity per nautical mile at the 10 NM meteorological visibility that DEFINES
 *  nominal range. `T^10 = 0.05`, the 5 % contrast threshold. */
export const NOMINAL_RANGE_TRANSMISSIVITY = 0.74;

/**
 * Luminous intensity, in candela, that a light needs to have the given **nominal range** in nautical
 * miles. Allard's Law inverted at the night threshold. `I = 0.686 · d² · 0.74^(−d)`.
 */
export const candelaForNominalRange = (nauticalMiles: number): number => {
  const d = Math.max(nauticalMiles, 0);
  // 0.686 = E_t · (1 NM in metres)² = 2e-7 · 1852², to within the rounding the standard itself uses.
  return 0.686 * d * d * Math.pow(NOMINAL_RANGE_TRANSMISSIVITY, -d);
};

/**
 * Candela → the renderer's `PointLight.intensity`.
 *
 * three multiplies `color × intensity` and divides by `d²` (decay 2), so a point light's intensity is
 * an **irradiance × m²**. Our irradiance unit is kW/m² (`WATTS_PER_UNIT`), and luminous flux converts
 * to radiant flux through the efficacy of daylight. So `I_renderer = cd / (efficacy · 1000)`.
 *
 * Check: 100 cd at 5 m gives `100/25 = 4 lx`. Here: `100/(110·1000) = 9.09e-4`, over `25` = `3.64e-5`
 * renderer units, which is `3.64e-5 · 1000 · 110 = 4.0 lx`. The units close.
 */
export const candelaToRendererIntensity = (candela: number): number =>
  candela / (DAYLIGHT_EFFICACY * WATTS_PER_UNIT);

/**
 * Illuminance in lux that a light of `candela` puts on the eye at `metres`, through clear air at the
 * nominal-range transmissivity. Allard's Law, forward. Used by the tests, and by anyone asking
 * "should I be able to see that buoy from here".
 */
export const allardIlluminanceLux = (candela: number, metres: number): number => {
  const nauticalMiles = metres / 1852;
  return (candela * Math.pow(NOMINAL_RANGE_TRANSMISSIVITY, nauticalMiles)) / (metres * metres);
};

/**
 * A lantern is switched by a photocell, not by a clock: it lights when the ambient illuminance falls
 * below a threshold, so it is dark all day and lit through dusk regardless of latitude or season —
 * which matters at 60°N, where "night" is a wildly different time of day in June and December.
 *
 * ~50 lx is the commonly cited switch-on point for marine lanterns. It is a manufacturer setting, not
 * a standard, so it is a constant here and not a law.
 */
export const PHOTOCELL_SWITCH_ON_LUX = 50;

// --- Colour ------------------------------------------------------------------

/**
 * IALA E-200-1 specifies signal colours as CIE 1931 chromaticity boundaries, not as RGB. These are
 * linear-sRGB renderings of a representative in-gamut point from each region. Two are worth saying
 * out loud because they are counter-intuitive and everybody gets them wrong:
 *
 *  - **Signal green is a blue-green / emerald** (dominant λ ≈ 500–515 nm). E-200-1 explicitly
 *    excludes yellow-greens. Do not tint it toward lime.
 *  - **Signal yellow is an amber** (≈ 585 nm), noticeably oranger than a lemon yellow.
 *
 * Blue appears on exactly one mark in the whole system — the emergency wreck buoy.
 */
export const SIGNAL_COLORS = {
  red: [1, 0.0, 0.0],
  green: [0.0, 1, 0.31],
  yellow: [1, 0.28, 0.0],
  /** Traditional warm (incandescent) white. E-200-1 admits cool LED white too; both are legal. */
  white: [1, 0.67, 0.37],
  blue: [0.0, 0.06, 1],
} as const satisfies Record<string, Rgb>;

export type SignalColor = keyof typeof SIGNAL_COLORS;

/**
 * The `PointLight.intensity` that makes a lamp of colour `color` emit `candela` of LUMINOUS intensity.
 *
 * three's `PointLight` multiplies its colour into the light, so a saturated green lamp at intensity
 * `I` emits only `luminance(green)·I`. Dividing it out here means `candela` means candela whatever the
 * colour is — which is the whole point of a photometric quantity. (Scaling the *colour* up instead is
 * not an option: `THREE.Color` clamps to [0,1].)
 */
export const signalLightIntensity = (candela: number, color: SignalColor): number =>
  candelaToRendererIntensity(candela) / Math.max(luminance(SIGNAL_COLORS[color]), 1e-6);

// --- Rhythm ------------------------------------------------------------------

/** One pulse: `on` seconds lit, then `off` seconds dark. */
export interface Pulse {
  on: number;
  off: number;
  /** Only the emergency wreck buoy alternates colour within a period. */
  color?: SignalColor;
}

export interface Rhythm {
  /** Chart abbreviation, e.g. `VQ(9) 10s`. */
  abbr: string;
  /** Seconds. The whole pattern repeats on this. */
  period: number;
  pulses: Pulse[];
}

/** E-110's canonical rates. `Q` is the 50–79 fpm band and `VQ` the 80–159 band; the standard's own
 *  worked examples use 60 and 120, and so does Northern Europe. */
const Q_FLASH = 0.5; // 60 flashes/min
const VQ_FLASH = 0.25; // 120 flashes/min
/** E-110: a long flash is "≥ 2 s". The examples use exactly 2. */
const LONG_FLASH = 2;

/**
 * Build a group of `count` quick flashes at the front of a `period`, optionally followed by a long
 * flash, with one long eclipse filling the rest. This is exactly how E-110 constructs the cardinals —
 * writing the four of them out by hand would be four chances to typo a cardinal mark.
 */
const quickGroup = (
  abbr: string,
  count: number,
  flash: number,
  period: number,
  longFlash: boolean,
): Rhythm => {
  const pulses: Pulse[] = [];
  for (let i = 0; i < count; i++) pulses.push({ on: flash, off: flash });
  const used = count * 2 * flash;
  if (longFlash) {
    pulses.push({ on: LONG_FLASH, off: period - used - LONG_FLASH });
  } else {
    // Stretch the last eclipse to fill the period.
    pulses[pulses.length - 1] = { on: flash, off: period - used + flash };
  }
  return { abbr, period, pulses };
};

/**
 * The cardinal rhythms, by the clock face: 3 flashes = 3 o'clock = East, 6 = South, 9 = West, and
 * North is continuous. **South's long flash is not decoration** — it exists so six flashes can never
 * be miscounted as three (East) or nine (West). Getting it wrong would put a boat on the rocks.
 */
export const RHYTHMS = {
  // Cardinals, VQ variants (the Baltic norm).
  cardinalNorth: { abbr: "VQ", period: VQ_FLASH * 2, pulses: [{ on: VQ_FLASH, off: VQ_FLASH }] },
  cardinalEast: quickGroup("VQ(3) 5s", 3, VQ_FLASH, 5, false),
  cardinalSouth: quickGroup("VQ(6)+LFl 10s", 6, VQ_FLASH, 10, true),
  cardinalWest: quickGroup("VQ(9) 10s", 9, VQ_FLASH, 10, false),
  // Cardinals, Q variants, for the authorities that use them.
  cardinalNorthQ: { abbr: "Q", period: Q_FLASH * 2, pulses: [{ on: Q_FLASH, off: Q_FLASH }] },
  cardinalEastQ: quickGroup("Q(3) 10s", 3, Q_FLASH, 10, false),
  cardinalSouthQ: quickGroup("Q(6)+LFl 15s", 6, Q_FLASH, 15, true),
  cardinalWestQ: quickGroup("Q(9) 15s", 9, Q_FLASH, 15, false),
  // Laterals. IALA fixes no on-time for `Fl`, only that it is < 2 s and the dark is ≥ 3x it.
  portFlashing: { abbr: "Fl R 5s", period: 5, pulses: [{ on: 0.5, off: 4.5 }] },
  starboardFlashing: { abbr: "Fl G 5s", period: 5, pulses: [{ on: 0.5, off: 4.5 }] },
  // The (2+1) composite group is RESERVED for preferred-channel marks, which is why no plain lateral
  // may use it.
  preferredChannel: {
    abbr: "Fl(2+1) 10s",
    period: 10,
    pulses: [
      { on: 0.5, off: 0.5 },
      { on: 0.5, off: 3 },
      { on: 0.5, off: 5 },
    ],
  },
  isolatedDanger: {
    abbr: "Fl(2) 5s",
    period: 5,
    pulses: [
      { on: 0.5, off: 0.5 },
      { on: 0.5, off: 3.5 },
    ],
  },
  safeWater: { abbr: "LFl 10s", period: 10, pulses: [{ on: LONG_FLASH, off: 8 }] },
  special: {
    abbr: "Fl(4) Y 10s",
    period: 10,
    pulses: [
      { on: 0.5, off: 0.5 },
      { on: 0.5, off: 0.5 },
      { on: 0.5, off: 0.5 },
      { on: 0.5, off: 6.5 },
    ],
  },
  /** The only blue light in the system, and the only rhythm that changes colour mid-period. */
  emergencyWreck: {
    abbr: "Al.Bu.Y 3s",
    period: 3,
    pulses: [
      { on: 1, off: 0.5, color: "blue" },
      { on: 1, off: 0.5, color: "yellow" },
    ],
  },
} as const satisfies Record<string, Rhythm>;

export type RhythmName = keyof typeof RHYTHMS;

/**
 * Is the lamp lit at `seconds`, and if so in which colour? LED lanterns switch in microseconds, so a
 * square pulse is not an approximation — it is what the lamp does.
 *
 * Returns `undefined` when dark. A colour is only returned for rhythms that alternate.
 */
export const rhythmAt = (rhythm: Rhythm, seconds: number): SignalColor | true | undefined => {
  const t = ((seconds % rhythm.period) + rhythm.period) % rhythm.period;
  let cursor = 0;
  for (const pulse of rhythm.pulses) {
    if (t < cursor + pulse.on) return pulse.color ?? true;
    cursor += pulse.on + pulse.off;
    if (t < cursor) return undefined;
  }
  return undefined;
};

/** Total lit time in one period. The duty cycle a solar lantern's battery has to pay for. */
export const dutyCycle = (rhythm: Rhythm): number =>
  rhythm.pulses.reduce((sum, p) => sum + p.on, 0) / rhythm.period;
