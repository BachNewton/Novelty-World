import { getProjectStorage } from "@/shared/lib/storage";

/*
 * Which view the player drives in, the chase camera or the driver's seat, kept
 * in this browser so the game opens in the one they last chose.
 */

export type DrivingView = "chase" | "cockpit";

const PROJECT = "aland-drive";
const KEY = "driving-view";

export function keptDrivingView(): DrivingView {
  if (typeof window === "undefined") return "chase";
  return getProjectStorage(PROJECT).get<unknown>(KEY) === "cockpit" ? "cockpit" : "chase";
}

export function keepDrivingView(view: DrivingView): void {
  // Storage can refuse a write (a private window, a full quota, blocked site data): the view still holds for this visit.
  try {
    getProjectStorage(PROJECT).set(KEY, view);
  } catch {
    return;
  }
}
