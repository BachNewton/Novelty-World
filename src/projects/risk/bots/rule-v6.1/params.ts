import { V6_PARAMS, type Params as V6Params } from "../rule-v6/params";
import type { BorderMode } from "./border";

// v6.1 plays v6's settings whole, with more of its own (`ideas/rule-bot-v6.1.md`): how the border
// loss gathers the opponents' blows, how armies enter a seat's power, and whether the border
// weight eases as the board's armies outgrow its income. With `border` at "sum", `power` at
// "face" and `attrition` at 0 it plays exactly v6's moves, and the table-size gates switch every
// change off where a table is too small for it.

export const POWER_MODES = ["face", "armies"] as const;

/** `face`: v6's, every army at full value for ever. `armies`: a seat's armies count fully up to
 *  `armyRounds` rounds of its income and at `armyBeyond` each past that. */
export type PowerMode = (typeof POWER_MODES)[number];

export function powerMode(name: string): PowerMode {
  const mode = POWER_MODES.find((m) => m === name);
  if (mode === undefined) throw new Error(`a power mode is one of ${POWER_MODES.join(", ")}, not "${name}"`);
  return mode;
}

export const REPRICE_MODES = ["value", "full"] as const;

/** With `power` "armies", where the re-priced armies reach. `value`: the final score only (its
 *  share, total and common-threat terms). `full`: the forecast too, so the opponent model's aim
 *  cases and the planner's threat plans read the common threat found from the re-priced power. */
export type RepriceMode = (typeof REPRICE_MODES)[number];

export function repriceMode(name: string): RepriceMode {
  const mode = REPRICE_MODES.find((m) => m === name);
  if (mode === undefined) throw new Error(`a reprice mode is one of ${REPRICE_MODES.join(", ")}, not "${name}"`);
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
  /** Multiplies the border weight of the preferences in force, at either table's (the native
   *  map's knob, `ideas/rule-bot-v6.1.md`); 1 leaves it v6's. */
  borderScale: number;
  /** With `power` "armies": whether the re-priced armies reach the forecast. */
  reprice: RepriceMode;
  /** With `power` "armies": what each of an opponent's armies past `armyRounds` rounds of its
   *  income counts for; below 0 it is `armyBeyond`, my own armies' price. Above `armyBeyond`, a
   *  rival's stockpile weighs more than my own: hoarding is priced as a threat to the table, not
   *  discounted as idle. */
  rivalBeyond: number;
  /** With `power` "armies": the common-threat bar of the re-priced power times this (below 1, the
   *  table's leader is named sooner). */
  threatScale: number;
  /** Every v6.1 change applies only at a table that started with at least this many seats; at a
   *  smaller one the bot is v6. 0 applies them at every table. */
  minPlayers: number;
  /** Every v6.1 change applies only while at least this many seats are alive at the decision. */
  minAlive: number;
  /** `attrition` applies only while at least this many seats are alive at the decision. */
  attritionAlive: number;
}

/** v6.1: v6 with the border loss of the single worst opponent. Provisional: the screen in
 *  `ideas/rule-bot-v6.1.md` picks the candidate `V6_1_PARAMS` is set to. */
export const V6_1_PARAMS: Params = {
  ...V6_PARAMS,
  border: "max",
  power: "face",
  armyRounds: 6,
  armyBeyond: 0.25,
  attrition: 0,
  borderScale: 1,
  reprice: "value",
  rivalBeyond: -1,
  threatScale: 1,
  minPlayers: 0,
  minAlive: 0,
  attritionAlive: 0,
};

/** Whether `p` plays v6's own value: no v6.1 setting moved. */
export function playsV6Value(p: Params): boolean {
  return p.border === "sum" && p.power === "face" && p.attrition === 0 && p.borderScale === 1;
}

/** The settings a decision plays by at a table that started with `players` seats and has
 *  `alive` left: `table`'s with every change off below `minPlayers` or `minAlive` and attrition
 *  off below `attritionAlive`, or null where that leaves v6's own value. The gate is read at the
 *  decision, not on each board it scores, so every plan of one decision is scored alike. */
export function inEffect(table: Params, players: number, alive: number): Params | null {
  if (players < table.minPlayers || alive < table.minAlive) return null;
  const settings = alive < table.attritionAlive && table.attrition !== 0 ? { ...table, attrition: 0 } : table;
  return playsV6Value(settings) ? null : settings;
}

/** Checks the v6.1 settings a label may move, loudly. */
export function checkSettings(p: Params): Params {
  if (!(p.armyRounds >= 0)) throw new Error(`rule-v6.1's armyRounds is 0 or more, not ${p.armyRounds.toString()}`);
  if (!(p.armyBeyond >= 0 && p.armyBeyond <= 1)) throw new Error(`rule-v6.1's armyBeyond is between 0 and 1, not ${p.armyBeyond.toString()}`);
  if (!(p.attrition >= 0)) throw new Error(`rule-v6.1's attrition is 0 or more, not ${p.attrition.toString()}`);
  if (!(p.rivalBeyond <= 4)) throw new Error(`rule-v6.1's rivalBeyond is at most 4 (below 0: armyBeyond), not ${p.rivalBeyond.toString()}`);
  if (!(p.threatScale > 0)) throw new Error(`rule-v6.1's threatScale is above 0, not ${p.threatScale.toString()}`);
  if (!(p.borderScale >= 0)) throw new Error(`rule-v6.1's borderScale is 0 or more, not ${p.borderScale.toString()}`);
  for (const [name, n] of [["minPlayers", p.minPlayers], ["minAlive", p.minAlive], ["attritionAlive", p.attritionAlive]] as const) {
    if (!(Number.isInteger(n) && n >= 0)) throw new Error(`rule-v6.1's ${name} is a whole number, 0 or more, not ${n.toString()}`);
  }
  return p;
}
