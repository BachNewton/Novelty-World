import { V6_PARAMS, type Params as V6Params } from "../rule-v6/params";
import type { BorderMode } from "./border";

// v6.1 plays v6's settings whole, with more of its own (`ideas/rule-bot-v6.1.md`): how the border
// loss gathers the opponents' blows, how armies enter a seat's power, and whether the border
// weight eases as the board's armies outgrow its income. With `border` at "sum", `power` at
// "face" and `attrition` at 0 it plays exactly v6's moves.

export const POWER_MODES = ["face", "armies"] as const;

/** `face`: v6's, every army at full value for ever. `armies`: a seat's armies count fully up to
 *  `armyRounds` rounds of its income and at `armyBeyond` each past that. */
export type PowerMode = (typeof POWER_MODES)[number];

export function powerMode(name: string): PowerMode {
  const mode = POWER_MODES.find((m) => m === name);
  if (mode === undefined) throw new Error(`a power mode is one of ${POWER_MODES.join(", ")}, not "${name}"`);
  return mode;
}

export interface Params extends V6Params {
  border: BorderMode;
  power: PowerMode;
  /** With `power` "armies": the rounds of its board income a seat's armies count fully up to. */
  armyRounds: number;
  /** With `power` "armies": what each army past `armyRounds` rounds of income counts for. */
  armyBeyond: number;
  /** The border weight is scaled by min(1, attrition × the board's income ÷ its armies), so it
   *  is v6's while the board holds up to `attrition` rounds of income; 0 leaves it v6's always. */
  attrition: number;
}

/** v6.1: v6 with the border loss of the single worst opponent. Provisional: the screen in
 *  `ideas/rule-bot-v6.1.md` picks the candidate `V6_1_PARAMS` is set to. */
export const V6_1_PARAMS: Params = { ...V6_PARAMS, border: "max", power: "face", armyRounds: 6, armyBeyond: 0.25, attrition: 0 };

/** Whether `p` plays v6's own value: no v6.1 setting moved. */
export function playsV6Value(p: Params): boolean {
  return p.border === "sum" && p.power === "face" && p.attrition === 0;
}

/** Checks the v6.1 settings a label may move, loudly. */
export function checkSettings(p: Params): Params {
  if (!(p.armyRounds >= 0)) throw new Error(`rule-v6.1's armyRounds is 0 or more, not ${p.armyRounds.toString()}`);
  if (!(p.armyBeyond >= 0 && p.armyBeyond <= 1)) throw new Error(`rule-v6.1's armyBeyond is between 0 and 1, not ${p.armyBeyond.toString()}`);
  if (!(p.attrition >= 0)) throw new Error(`rule-v6.1's attrition is 0 or more, not ${p.attrition.toString()}`);
  return p;
}
