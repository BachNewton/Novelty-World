/*
 * Whose eyes the player sees through: the witch's own (first person, the
 * default) or a camera following her (third person). The choice is kept on
 * the device between visits.
 */

export type PointOfView = "first" | "third";

export const FIRST_VIEW: PointOfView = "first";

const STORAGE_KEY = "hearthwood:point-of-view";

export function otherView(view: PointOfView): PointOfView {
  return view === "first" ? "third" : "first";
}

/** A stored choice read back: anything but a view this game knows is the default. */
export function parsePointOfView(stored: string | null): PointOfView {
  return stored === "third" ? "third" : FIRST_VIEW;
}

// Storage can be missing or throw on access (a private window, blocked site
// data), and the choice is only a convenience, so the game plays on without it.
export function savedPointOfView(): PointOfView {
  try {
    return parsePointOfView(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return FIRST_VIEW;
  }
}

export function savePointOfView(view: PointOfView): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, view);
  } catch {
    // Unsaved, the choice lasts this visit.
  }
}
