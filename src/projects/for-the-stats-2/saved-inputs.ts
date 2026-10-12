import { getProjectStorage } from "@/shared/lib/storage";
import { MAX_SLOT_PERCENT, MAX_SLOTS, type ScreenAttack } from "./logic";

const KEY = "inputs";

/** Everything the player has entered: the attack, the what-ifs and whether
 *  the table shows a Splash's neighbours. */
export interface Inputs extends ScreenAttack {
  splash: boolean;
}

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
  splash: false,
};

const MAX_DAMAGE = 999;

type NumberKey = { [K in keyof Inputs]: Inputs[K] extends number ? K : never }[keyof Inputs];

/** The range each number can take. Focus can't exceed the slots, nor the min
 *  the max, which the screen also keeps to. */
export const LIMITS: Record<NumberKey, { min: number; max: number }> = {
  minDamage: { min: 0, max: MAX_DAMAGE },
  maxDamage: { min: 0, max: MAX_DAMAGE },
  slots: { min: 1, max: MAX_SLOTS },
  slotPercent: { min: 0, max: MAX_SLOT_PERCENT },
  focus: { min: 0, max: MAX_SLOTS },
  critChance: { min: 0, max: 100 },
  critDamage: { min: 0, max: MAX_DAMAGE },
  armor: { min: 0, max: MAX_DAMAGE },
};

/** The inputs from the player's last visit. Anything missing or out of range
 *  (saved by an older version, or edited by hand) takes its default. */
export function loadInputs(): Inputs {
  const saved = getProjectStorage("for-the-stats-2").get<unknown>(KEY);
  const fields = typeof saved === "object" && saved !== null ? (saved as Record<string, unknown>) : {};
  const inputs = { ...DEFAULT_INPUTS };
  for (const key of Object.keys(LIMITS) as NumberKey[]) {
    const value = fields[key];
    const { min, max } = LIMITS[key];
    if (typeof value === "number" && Number.isInteger(value) && value >= min && value <= max) inputs[key] = value;
  }
  for (const key of ["ignoresArmor", "shocked", "poisoned", "frozen", "splash"] as const) {
    const value = fields[key];
    if (typeof value === "boolean") inputs[key] = value;
  }
  inputs.focus = Math.min(inputs.focus, inputs.slots);
  inputs.maxDamage = Math.max(inputs.maxDamage, inputs.minDamage);
  return inputs;
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
