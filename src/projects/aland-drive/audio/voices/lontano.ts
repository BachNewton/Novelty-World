import { vee } from "../firing";
import type { Voice } from "../vehicles";

/**
 * A 1960s V12 under a long bonnet, breathing through three twin-choke carburettors: richer, softer and more mechanical
 * than Altura's race-bred wail. Its pulses are longer and rounder through period headers, the twelve cylinders never
 * quite in balance, so the note is alive and a little rough at a cruise; the valve gear and chains chatter, the
 * carburettors' intakes howl through the thin bulkhead under load, and the exhaust swells to an open, brassy cry near
 * the top. An old straight-cut box whines faintly, and a lift spits a few soft pops from the carburettors.
 */
export const lontano: Voice = {
  seed: 1962,
  combustion: {
    firing: vee(12),
    lope: 0.05,
    jitter: 0.1,
    banks: { gain: 0.92, ring: 1.08, delayMs: 0.42 },
    pulseMs: 1.15,
    headerHz: 680,
    roughness: 0.32,
    knock: 0,
    knockHz: 2400,
    chatter: 0.27,
    fan: null,
    pipeHz: 150,
    pipeRing: 0.42,
    exhaustHz: [950, 3200, 2300],
    silencerHz: 370,
    silencerDb: 6,
    rasp: 2.2,
    intakeHz: 290,
    intakeQ: 2.2,
    intake: 1,
    limiterHz: 7,
  },
  electric: null,
  turbo: null,
  supercharger: null,
  overrun: { crackle: 1, antiLag: 0 },
  gearWhine: { teeth: 19, level: 0.022 },
  cabin: 0.18,
  level: 0.33,
  idleLevel: 0.37,
};
