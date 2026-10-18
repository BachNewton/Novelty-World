import { ATMOSPHERE_AND_WEATHER_FEATURES } from "./features/atmosphere-and-weather";
import type { FeatureInfo } from "./features/group";
import { SEASONS_FEATURES } from "./features/seasons";
import { SHADOWS_AND_FOLIAGE_FEATURES } from "./features/shadows-and-foliage";
import { SKY_AND_LIGHT_FEATURES } from "./features/sky-and-light";
import { WATER_FEATURES } from "./features/water";

/*
 * Whether each part of the look is drawn: one switch per feature, on unless
 * switched off. Quality (`quality.ts`) is how much of a thing is drawn;
 * features are whether it is drawn at all, and a feature that is off costs
 * nothing: its shader code is compiled out by its define, and its passes are
 * neither run nor allocated (see `art/shading.ts` and `art/passes.ts`).
 *
 * Each group lists its own features in `features/<group>.ts`. Nothing is
 * kept between visits: every visit starts with every feature on, and
 * `?features=` sets them for that visit: a comma list of `-id` (off), `+id` or `id` (on), `none` and
 * `all`, applied in order, so `?features=none,+sway` shows only the sway.
 */

export { FEATURE_GROUPS, type FeatureGroup, type FeatureInfo } from "./features/group";

export const FEATURES = [...WATER_FEATURES, ...SKY_AND_LIGHT_FEATURES, ...SHADOWS_AND_FOLIAGE_FEATURES, ...ATMOSPHERE_AND_WEATHER_FEATURES, ...SEASONS_FEATURES];

export type FeatureId = (typeof FEATURES)[number]["id"];

export type FeatureToggles = Readonly<Record<FeatureId, boolean>>;

const ID = /^[a-z][a-zA-Z0-9]*$/;

/** The define a feature's shader code is compiled under: `godRays` is `HW_GOD_RAYS`. */
export function featureDefine(id: string): string {
  if (!ID.test(id)) throw new Error(`A feature's id is camelCase, not "${id}"`);
  return `HW_${id.replace(/[A-Z0-9]+/g, (part) => `_${part}`).toUpperCase()}`;
}

/** Every feature on. */
export function allOn(features: readonly FeatureInfo[] = FEATURES): FeatureToggles {
  return Object.fromEntries(features.map((f) => [f.id, true])) as FeatureToggles;
}

/** `?features=` applied over `base`. An id no feature has is a mistake in the address, and throws. */
export function applyFeatureParam(param: string | null, base: FeatureToggles): FeatureToggles {
  const toggles: Record<string, boolean> = { ...base };
  if (param === null) return toggles as FeatureToggles;
  for (const raw of param.split(",")) {
    const item = raw.trim();
    if (item === "") continue;
    if (item === "all" || item === "none") {
      for (const id of Object.keys(toggles)) toggles[id] = item === "all";
      continue;
    }
    const on = !item.startsWith("-");
    const id = item.replace(/^[-+]/, "");
    if (!(id in toggles)) throw new Error(`?features names "${id}", which is not a feature: ${Object.keys(toggles).join(", ")}`);
    toggles[id] = on;
  }
  return toggles as FeatureToggles;
}

/** The live switches: read them, flip them, and hear when they change. */
export class FeatureSwitches {
  private current: FeatureToggles;
  private readonly listeners = new Set<() => void>();

  constructor(toggles: FeatureToggles) {
    this.current = toggles;
  }

  isOn(id: FeatureId): boolean {
    return this.current[id];
  }

  /** The switches now: a new object after every change, so it can be compared by identity. */
  toggles(): FeatureToggles {
    return this.current;
  }

  set(id: FeatureId, on: boolean): void {
    if (this.current[id] === on) return;
    this.current = { ...this.current, [id]: on };
    for (const listener of this.listeners) listener();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

let live: FeatureSwitches | null = null;

/** This page's switches: every feature on, with `?features=` over them. */
export function liveFeatures(): FeatureSwitches {
  live ??= new FeatureSwitches(applyFeatureParam(new URLSearchParams(window.location.search).get("features"), allOn()));
  return live;
}
