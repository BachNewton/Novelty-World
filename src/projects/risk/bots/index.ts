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
import { V4_PARAMS } from "./rule-v4/params";
import { ruleBot as ruleV5, ruleV5Bot } from "./rule-v5";
import { V5_PARAMS } from "./rule-v5/params";
import { ruleBot as ruleV6, ruleV6Bot } from "./rule-v6";
import { V6_PARAMS } from "./rule-v6/params";
import { ruleBot as ruleV7, ruleV7Bot } from "./rule-v7";
import { V7_PARAMS } from "./rule-v7/params";
import { ruleV8Bot } from "./rule-v8";
import { sweeperV1Bot } from "./sweeper-v1";

/** Every bot the measuring harness can seat, by label. */
export const RISK_BOTS: Readonly<Record<string, Bot>> = {
  random: randomBot,
  greedy: greedyBot,
  "rule-v1": ruleV1Bot,
  "rule-v2": ruleV2Bot,
  "rule-v3": ruleV3Bot,
  "rule-v4": ruleV4Bot,
  "rule-v5": ruleV5Bot,
  "rule-v6": ruleV6Bot,
  "rule-v7": ruleV7Bot,
  "rule-v8": ruleV8Bot,
  "sweeper-v1": sweeperV1Bot,
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
  "rule-v5": "rule-v5/index.ts",
  "rule-v6": "rule-v6/index.ts",
  "rule-v7": "rule-v7/index.ts",
  "rule-v8": "rule-v8/index.ts",
  "sweeper-v1": "sweeper-v1/index.ts",
  "gd-defensive": "gd/index.ts",
  "gd-continental": "gd/index.ts",
  "gd-aggressive": "gd/index.ts",
  "gd-stacker": "gd/index.ts",
};

interface Tunable {
  prefs: Preferences;
  engine: Engine;
  /** Switches a version screens its changes by, each on (1) or off (0): v6's fixes. */
  switches?: Readonly<Record<string, number>>;
  /** Whole-number work knobs, each 0 or more: v7's replies and candidates. */
  knobs?: Readonly<Record<string, number>>;
  build: (prefs: Preferences, engine: Engine, switches: Record<string, number>, knobs: Record<string, number>) => Bot;
}

/** The rule bots a measuring run may seat with some settings moved, each by its code and
 *  its own settings: its preferences, its work knob and any switches it has. Never its
 *  opponent model, which is pinned (`rule-v1/params.ts`). */
export const TUNABLE_BOTS: Readonly<Record<string, Tunable>> = {
  "rule-v1": { prefs: V1_PARAMS.prefs, engine: V1_PARAMS.engine, build: (prefs, engine) => ruleBot({ ...V1_PARAMS, prefs, engine }) },
  "rule-v2": { prefs: V2_PARAMS.prefs, engine: V2_PARAMS.engine, build: (prefs, engine) => ruleV2({ ...V2_PARAMS, prefs, engine }) },
  "rule-v3": { prefs: V3_PARAMS.prefs, engine: V3_PARAMS.engine, build: (prefs, engine) => ruleV3({ ...V3_PARAMS, prefs, engine }) },
  "rule-v4": { prefs: V4_PARAMS.prefs, engine: V4_PARAMS.engine, build: (prefs, engine) => ruleV4({ ...V4_PARAMS, prefs, engine }) },
  // v4 at the small table, where its own preferences are `smallTable.prefs`.
  "rule-v4-small": {
    prefs: V4_PARAMS.smallTable.prefs,
    engine: V4_PARAMS.engine,
    build: (prefs, engine) => ruleV4({ ...V4_PARAMS, smallTable: { ...V4_PARAMS.smallTable, prefs }, engine }),
  },
  "rule-v5": { prefs: V5_PARAMS.prefs, engine: V5_PARAMS.engine, build: (prefs, engine) => ruleV5({ ...V5_PARAMS, prefs, engine }) },
  "rule-v5-small": {
    prefs: V5_PARAMS.smallTable.prefs,
    engine: V5_PARAMS.engine,
    build: (prefs, engine) => ruleV5({ ...V5_PARAMS, smallTable: { ...V5_PARAMS.smallTable, prefs }, engine }),
  },
  // v6 with its fixes switched one by one: `rule-v6~{"fork":1,"movein":0,...}` (`ideas/rule-bot-v6.md`).
  "rule-v6": {
    prefs: V6_PARAMS.prefs,
    engine: V6_PARAMS.engine,
    switches: { ...V6_PARAMS.fixes },
    build: (prefs, engine, switches) => ruleV6({ ...V6_PARAMS, prefs, engine, fixes: { ...V6_PARAMS.fixes, ...switches } }),
  },
  // v7 at a work budget: `rule-v7~{"replies":8}` (`ideas/rule-bot-v7.md`).
  "rule-v7": {
    prefs: V7_PARAMS.prefs,
    engine: V7_PARAMS.engine,
    switches: { mixed: V7_PARAMS.search.mixed },
    knobs: { replies: V7_PARAMS.search.replies, candidates: V7_PARAMS.search.candidates },
    build: (prefs, engine, switches, knobs) => ruleV7({ ...V7_PARAMS, prefs, engine, search: { ...V7_PARAMS.search, ...switches, ...knobs } }),
  },
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
  const { prefs, engine, switches = {}, knobs = {}, build } = TUNABLE_BOTS[base];
  const moved = { prefs: { ...prefs }, engine: { ...engine }, switches: { ...switches }, knobs: { ...knobs } };
  for (const [key, value] of Object.entries(overrides)) {
    if (Object.hasOwn(prefs, key)) moved.prefs[key as keyof Preferences] = value;
    else if (Object.hasOwn(engine, key)) moved.engine[key as keyof Engine] = value;
    else if (Object.hasOwn(switches, key)) {
      if (value !== 0 && value !== 1) throw new Error(`"${base}"'s switch "${key}" is 0 or 1, not ${value.toString()}`);
      moved.switches[key] = value;
    } else if (Object.hasOwn(knobs, key)) {
      if (!Number.isInteger(value) || value < 0) throw new Error(`"${base}"'s knob "${key}" is a whole number, 0 or more, not ${value.toString()}`);
      moved.knobs[key] = value;
    } else throw new Error(`"${base}" has no setting "${key}"`);
  }
  const bot = build(moved.prefs, moved.engine, moved.switches, moved.knobs);
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
