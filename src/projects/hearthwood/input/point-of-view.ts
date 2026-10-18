/*
 * Whose eyes the player sees through: the witch's own (first person, the
 * default every visit starts in) or a camera following them (third person).
 */

export type PointOfView = "first" | "third";

export const FIRST_VIEW: PointOfView = "first";

export function otherView(view: PointOfView): PointOfView {
  return view === "first" ? "third" : "first";
}
