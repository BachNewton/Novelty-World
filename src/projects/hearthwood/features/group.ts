/*
 * What a feature is, and the groups the features panel shows them in. Each
 * group keeps its own list in a file of its own beside this one, so the
 * features of one group are added without touching another's.
 */

export const FEATURE_GROUPS = [
  { id: "water", name: "Water" },
  { id: "sky-and-light", name: "Sky and light" },
  { id: "shadows-and-foliage", name: "Shadows and foliage" },
  { id: "atmosphere-and-weather", name: "Atmosphere and weather" },
  { id: "seasons", name: "Seasons" },
] as const;

export type FeatureGroup = (typeof FEATURE_GROUPS)[number]["id"];

/** One part of the look that can be switched off: `id` is camelCase, and names it in the URL and in the ~ panel. */
export interface FeatureInfo<Id extends string = string> {
  id: Id;
  name: string;
  group: FeatureGroup;
  /** What it does, shown when hovering its switch. */
  description: string;
}

/** A group's features, each stamped with the group. */
export function featureGroup<const Id extends string = never>(group: FeatureGroup, features: readonly Omit<FeatureInfo<Id>, "group">[]): readonly FeatureInfo<Id>[] {
  return features.map((feature) => ({ ...feature, group }));
}
