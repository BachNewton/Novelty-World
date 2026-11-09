import { create } from "zustand";
import { getProjectStorage } from "@/shared/lib/storage";
import { TRAFFIC_VOICED } from "../audio/traffic";

/*
 * What the traffic costs, kept in this browser like the graphics' settings: numbers the traffic's step and the sound's
 * frame read, so a weaker machine can turn them down. How many cars, cyclists and walkers the roads and paths hold, and
 * how far round the player the bubble keeps them, are shares of Åland's own and of the full reach; how many traffic cars
 * are voiced is a count. None of them changes how anything drives: a car at a quarter's density drives as it would at
 * the full, there are just fewer of them.
 */

export const TRAFFIC_DENSITIES = [0.25, 0.5, 0.75, 1] as const;
export const TRAFFIC_REACHES = [0.5, 0.75, 1] as const;
export const TRAFFIC_VOICE_COUNTS = [0, 1, 2, 3, 4] as const;

export interface TrafficSettings {
  density: (typeof TRAFFIC_DENSITIES)[number];
  reach: (typeof TRAFFIC_REACHES)[number];
  voiced: (typeof TRAFFIC_VOICE_COUNTS)[number];
}

export const DEFAULT_TRAFFIC: TrafficSettings = { density: 1, reach: 1, voiced: TRAFFIC_VOICED as TrafficSettings["voiced"] };

const PROJECT = "aland-drive";
const KEY = "traffic";

const oneOf = <T extends number>(values: readonly T[], value: unknown, otherwise: T): T => (values.includes(value as T) ? (value as T) : otherwise);

function load(): TrafficSettings {
  const saved = getProjectStorage(PROJECT).get<unknown>(KEY);
  if (typeof saved !== "object" || saved === null) return DEFAULT_TRAFFIC;
  const { density, reach, voiced } = saved as Record<string, unknown>;
  return {
    density: oneOf(TRAFFIC_DENSITIES, density, DEFAULT_TRAFFIC.density),
    reach: oneOf(TRAFFIC_REACHES, reach, DEFAULT_TRAFFIC.reach),
    voiced: oneOf(TRAFFIC_VOICE_COUNTS, voiced, DEFAULT_TRAFFIC.voiced),
  };
}

function save(settings: TrafficSettings): void {
  // Storage can refuse a write (a private window, a full quota, blocked site data). The setting still holds for this
  // visit; it just isn't remembered.
  try {
    getProjectStorage(PROJECT).set(KEY, settings);
  } catch {
    return;
  }
}

const stepped = <T extends number>(values: readonly T[], at: T, steps: number): T => values[Math.min(Math.max(values.indexOf(at) + steps, 0), values.length - 1)];

interface TrafficStore {
  settings: TrafficSettings;
  /** Moves one setting by whole steps, held to its ends. */
  step: (setting: keyof TrafficSettings, steps: number) => void;
}

const VALUES = { density: TRAFFIC_DENSITIES, reach: TRAFFIC_REACHES, voiced: TRAFFIC_VOICE_COUNTS } as const;

export const useTrafficSettings = create<TrafficStore>()((set) => ({
  settings: typeof window === "undefined" ? DEFAULT_TRAFFIC : load(),
  step: (setting, steps) =>
    set(({ settings }) => {
      const next = { ...settings, [setting]: stepped<number>(VALUES[setting], settings[setting], steps) };
      save(next);
      return { settings: next };
    }),
}));
