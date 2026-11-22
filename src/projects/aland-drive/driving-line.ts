import { create } from "zustand";
import { getProjectStorage } from "@/shared/lib/storage";

/*
 * The driving line a player is shown on the road in a race, kept in this browser, as in Forza Horizon: none, only
 * where to slow, or the whole line. It is the racers' own line, coloured by the player's speed against what their
 * own car can carry there (`render/driving-line.ts`).
 */

export const DRIVING_LINES = ["off", "braking", "full"] as const;
export type DrivingLine = (typeof DRIVING_LINES)[number];

const storage = getProjectStorage("aland-drive");
const KEY = "driving-line";

const isDrivingLine = (value: unknown): value is DrivingLine => typeof value === "string" && (DRIVING_LINES as readonly string[]).includes(value);

/** The driving line a link asks for, for the drive: `?line=full`. */
export function lineAsked(search: string): DrivingLine | null {
  const asked = new URLSearchParams(search).get("line");
  if (asked === null) return null;
  if (!isDrivingLine(asked)) throw new Error(`?line= takes ${DRIVING_LINES.join(", ")}, not ${asked}`);
  return asked;
}

/** A player who has never chosen is shown where to brake, as Forza Horizon starts them. */
function savedLine(): DrivingLine {
  if (typeof window === "undefined") return "braking";
  const saved = storage.get<unknown>(KEY);
  return isDrivingLine(saved) ? saved : "braking";
}

export const useDrivingLine = create<{ line: DrivingLine; setLine: (line: DrivingLine) => void }>()((set) => ({
  line: savedLine(),
  setLine: (line) => {
    storage.set(KEY, line);
    set({ line });
  },
}));
