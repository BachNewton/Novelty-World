import { getProjectStorage } from "@/shared/lib/storage";
import type { ScreenAttack } from "./logic";

const KEY = "inputs";

/** Everything the player has entered: the attack and the what-ifs. */
export type Inputs = ScreenAttack;

export const DEFAULT_INPUTS: Inputs = {
  minDamage: 4,
  maxDamage: 11,
  slots: 3,
  slotPercent: 80,
  focus: 0,
  critChance: 5,
  critDamage: 0,
  armor: 0,
  ignoresArmor: false,
  shocked: false,
  poisoned: false,
  frozen: false,
};

const NUMBERS = ["minDamage", "maxDamage", "slots", "slotPercent", "focus", "critChance", "critDamage", "armor"];
const SWITCHES = ["ignoresArmor", "shocked", "poisoned", "frozen"];

function isInputs(value: unknown): value is Inputs {
  if (typeof value !== "object" || value === null) return false;
  const saved = value as Record<string, unknown>;
  return (
    NUMBERS.every((key) => Number.isInteger(saved[key])) && SWITCHES.every((key) => typeof saved[key] === "boolean")
  );
}

/** The inputs from the player's last visit, or the defaults if there are none
 *  (or they were saved in a shape this version doesn't know). */
export function loadInputs(): Inputs {
  const saved = getProjectStorage("for-the-stats-2").get<unknown>(KEY);
  return isInputs(saved) ? saved : DEFAULT_INPUTS;
}

export function saveInputs(inputs: Inputs): void {
  // Storage can refuse a write (a private window, a full quota, blocked site
  // data). The input still holds for this visit; it just isn't remembered.
  try {
    getProjectStorage("for-the-stats-2").set(KEY, inputs);
  } catch {
    return;
  }
}
