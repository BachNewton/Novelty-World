import type { Bot } from "./bot";
import { gdAggressiveBot, gdContinentalBot, gdDefensiveBot, gdStackerBot } from "./gd";
import { greedyBot } from "./greedy";
import { randomBot } from "./random";
import { ruleBot, ruleV1Bot } from "./rule-v1";
import { V1_PARAMS, type Engine, type Preferences } from "./rule-v1/params";
import { ruleBot as ruleV2, ruleV2Bot } from "./rule-v2";
import { V2_PARAMS } from "./rule-v2/params";
import { ruleBot as ruleV3, ruleV3Bot } from "./rule-v3";
import { V3_PARAMS } from "./rule-v3/params";
import { ruleBot as ruleV4, ruleV4Bot } from "./rule-v4";
import { BELIEF_VARIANTS, V4_PARAMS, type Params as Params4 } from "./rule-v4/params";

/** Every bot the measuring harness can seat, by label. */
export const RISK_BOTS: Readonly<Record<string, Bot>> = {
  random: randomBot,
  greedy: greedyBot,
  "rule-v1": ruleV1Bot,
  "rule-v2": ruleV2Bot,
  "rule-v3": ruleV3Bot,
  "rule-v4": ruleV4Bot,
  ...Object.fromEntries(Object.entries(BELIEF_VARIANTS).map(([belief, params]) => [`rule-v4-${belief}`, ruleV4(params)])),
  "gd-defensive": gdDefensiveBot,
  "gd-continental": gdContinentalBot,
  "gd-aggressive": gdAggressiveBot,
  "gd-stacker": gdStackerBot,
};

/** Each bot's own module in this folder, by label: where the code its games depend on
 *  starts, which the ratings cache follows through its imports (`eval/ratings-cache.ts`). */
export const BOT_MODULES: Readonly<Record<string, string>> = {
  random: "random.ts",
  greedy: "greedy.ts",
  "rule-v1": "rule-v1/index.ts",
  "rule-v2": "rule-v2/index.ts",
  "rule-v3": "rule-v3/index.ts",
  "rule-v4": "rule-v4/index.ts",
  ...Object.fromEntries(Object.keys(BELIEF_VARIANTS).map((belief) => [`rule-v4-${belief}`, "rule-v4/index.ts"])),
  "gd-defensive": "gd/index.ts",
  "gd-continental": "gd/index.ts",
  "gd-aggressive": "gd/index.ts",
  "gd-stacker": "gd/index.ts",
};

/** v4 and its belief variants, by label. */
const V4_FAMILY: Readonly<Record<string, Params4>> = {
  "rule-v4": V4_PARAMS,
  ...Object.fromEntries(Object.entries(BELIEF_VARIANTS).map(([belief, params]) => [`rule-v4-${belief}`, params])),
};

/** A v4 bot is tunable twice: its preferences above the small table, and (`<label>-small`)
 *  the small table's own. */
function v4Tunables(label: string, params: Params4): [string, Tunable][] {
  return [
    [label, { prefs: params.prefs, engine: params.engine, build: (prefs, engine) => ruleV4({ ...params, prefs, engine }) }],
    [
      `${label}-small`,
      {
        prefs: params.smallTable.prefs,
        engine: params.engine,
        build: (prefs, engine) => ruleV4({ ...params, smallTable: { ...params.smallTable, prefs }, engine }),
      },
    ],
  ];
}

interface Tunable {
  prefs: Preferences;
  engine: Engine;
  build: (prefs: Preferences, engine: Engine) => Bot;
}

/** The rule bots a measuring run may seat with some settings moved, each by its code and
 *  its own settings: its preferences and its work knob. Never its opponent model, which is
 *  pinned (`rule-v1/params.ts`). */
export const TUNABLE_BOTS: Readonly<Record<string, Tunable>> = {
  "rule-v1": { prefs: V1_PARAMS.prefs, engine: V1_PARAMS.engine, build: (prefs, engine) => ruleBot({ ...V1_PARAMS, prefs, engine }) },
  "rule-v2": { prefs: V2_PARAMS.prefs, engine: V2_PARAMS.engine, build: (prefs, engine) => ruleV2({ ...V2_PARAMS, prefs, engine }) },
  "rule-v3": { prefs: V3_PARAMS.prefs, engine: V3_PARAMS.engine, build: (prefs, engine) => ruleV3({ ...V3_PARAMS, prefs, engine }) },
  ...Object.fromEntries(Object.entries(V4_FAMILY).flatMap(([label, params]) => v4Tunables(label, params))),
};

export type Overrides = Partial<Preferences & Engine>;

/** The label that seats `base` with some settings overridden: `rule-v1~{"borderWeight":0.7}`. */
export function tunedLabel(base: string, overrides: Overrides): string {
  return `${base}~${JSON.stringify(overrides)}`;
}

const tuned = new Map<string, Bot>();

function tunedBot(label: string): Bot | null {
  const at = label.indexOf("~");
  if (at < 0) return null;
  const base = label.slice(0, at);
  if (!Object.hasOwn(TUNABLE_BOTS, base)) throw new Error(`no tunable Risk bot "${base}" (tunable: ${Object.keys(TUNABLE_BOTS).join(", ")})`);
  const known = tuned.get(label);
  if (known) return known;
  const overrides = JSON.parse(label.slice(at + 1)) as Record<string, number>;
  const { prefs, engine, build } = TUNABLE_BOTS[base];
  const moved = { prefs: { ...prefs }, engine: { ...engine } };
  for (const [key, value] of Object.entries(overrides)) {
    if (Object.hasOwn(prefs, key)) moved.prefs[key as keyof Preferences] = value;
    else if (Object.hasOwn(engine, key)) moved.engine[key as keyof Engine] = value;
    else throw new Error(`"${base}" has no setting "${key}"`);
  }
  const bot = build(moved.prefs, moved.engine);
  tuned.set(label, bot);
  return bot;
}

export function riskBot(label: string): Bot {
  const bot = tunedBot(label);
  if (bot) return bot;
  if (!Object.hasOwn(RISK_BOTS, label)) {
    throw new Error(`no Risk bot "${label}" (known: ${Object.keys(RISK_BOTS).join(", ")})`);
  }
  return RISK_BOTS[label];
}
