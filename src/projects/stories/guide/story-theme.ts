import type { CSSProperties } from "react";

/** How one story's guide looks: set on the guide's root, so its parts read the --story-* properties. */
export interface StoryTheme {
  /** A font's class, so its CSS variable is defined under the root. */
  className: string;
  vars: Record<`--story-${string}`, string>;
  /** The timeline's ground, by year: a gradient through these. */
  eras: { year: number; color: string }[];
  /** From when the sky has stars. */
  starsFrom: number;
}

export function themeStyle(theme: StoryTheme): CSSProperties {
  return theme.vars as CSSProperties;
}
