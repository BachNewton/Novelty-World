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
import { ruleBot as ruleV6_1, ruleV6_1Bot } from "./rule-v6.1";
import { BORDER_MODES, borderMode } from "./rule-v6.1/border";
import { POWER_MODES, powerMode, REPRICE_MODES, repriceMode, V6_1_PARAMS } from "./rule-v6.1/params";
import { ruleBot as ruleV7, ruleV7Bot } from "./rule-v7";
import { V7_PARAMS } from "./rule-v7/params";
import { ruleBot as ruleV7_1, ruleV7_1Bot } from "./rule-v7.1";
import { V7_1_PARAMS } from "./rule-v7.1/params";
import { DEFAULT_WEIGHTS as NET_DEFAULT_WEIGHTS, isPick, netV1, netV1Bot, PICKS } from "./net-v1";
import { WEIGHT_SETS as NET_WEIGHT_SETS } from "./net-v1/weights";
import { ruleV8Bot } from "./rule-v8";
import { DEFAULT_WEIGHTS, studentBot, studentV1Bot } from "./student-v1";
import { scorer } from "./student-v1/network";
import { WEIGHT_SETS } from "./student-v1/weights";
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
  "rule-v6.1": ruleV6_1Bot,
  "rule-v7": ruleV7Bot,
  "rule-v7.1": ruleV7_1Bot,
  "rule-v8": ruleV8Bot,
  "student-v1": studentV1Bot,
  "sweeper-v1": sweeperV1Bot,
  "net-v1": netV1Bot,
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
  "rule-v6.1": "rule-v6.1/index.ts",
  "rule-v7": "rule-v7/index.ts",
  "rule-v7.1": "rule-v7.1/index.ts",
  "rule-v8": "rule-v8/index.ts",
  "student-v1": "student-v1/index.ts",
  "sweeper-v1": "sweeper-v1/index.ts",
  "net-v1": "net-v1/index.ts",
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
  /** Settings that name one of a list, each with its default: a student's weight set. */
  choices?: Readonly<Record<string, { value: string; options: readonly string[] }>>;
  /** Settings of a version's own that are any number, each with its default, checked by the
   *  version: v6.1's army discount. */
  numbers?: Readonly<Record<string, number>>;
  build: (
    prefs: Preferences,
    engine: Engine,
    switches: Record<string, number>,
    knobs: Record<string, number>,
    choices: Record<string, string>,
    numbers: Record<string, number>,
  ) => Bot;
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
  // Plain `rule-v6.1` is the screen's pick (`ideas/rule-bot-v6.1.md`); a label moves settings from it
  // (`rule-v6.1~{"rivalBeyond":1.5}`). "sum", "face", attrition 0 and borderScale 1 play exactly v6's moves.
  "rule-v6.1": {
    prefs: V6_1_PARAMS.prefs,
    engine: V6_1_PARAMS.engine,
    choices: {
      border: { value: V6_1_PARAMS.border, options: BORDER_MODES },
      power: { value: V6_1_PARAMS.power, options: POWER_MODES },
      reprice: { value: V6_1_PARAMS.reprice, options: REPRICE_MODES },
    },
    numbers: {
      armyRounds: V6_1_PARAMS.armyRounds,
      armyBeyond: V6_1_PARAMS.armyBeyond,
      attrition: V6_1_PARAMS.attrition,
      borderScale: V6_1_PARAMS.borderScale,
      rivalBeyond: V6_1_PARAMS.rivalBeyond,
      threatScale: V6_1_PARAMS.threatScale,
      minPlayers: V6_1_PARAMS.minPlayers,
      minAlive: V6_1_PARAMS.minAlive,
      attritionAlive: V6_1_PARAMS.attritionAlive,
    },
    build: (prefs, engine, _switches, _knobs, choices, numbers) =>
      ruleV6_1({
        ...V6_1_PARAMS,
        prefs,
        engine,
        border: borderMode(choices.border),
        power: powerMode(choices.power),
        armyRounds: numbers.armyRounds,
        armyBeyond: numbers.armyBeyond,
        attrition: numbers.attrition,
        borderScale: numbers.borderScale,
        reprice: repriceMode(choices.reprice),
        rivalBeyond: numbers.rivalBeyond,
        threatScale: numbers.threatScale,
        minPlayers: numbers.minPlayers,
        minAlive: numbers.minAlive,
        attritionAlive: numbers.attritionAlive,
      }),
  },
  // v7 at a work budget: `rule-v7~{"replies":8}` (`ideas/rule-bot-v7.md`).
  "rule-v7": {
    prefs: V7_PARAMS.prefs,
    engine: V7_PARAMS.engine,
    switches: { mixed: V7_PARAMS.search.mixed },
    knobs: { replies: V7_PARAMS.search.replies, candidates: V7_PARAMS.search.candidates },
    build: (prefs, engine, switches, knobs) => ruleV7({ ...V7_PARAMS, prefs, engine, search: { ...V7_PARAMS.search, ...switches, ...knobs } }),
  },
  // v7.1, v7's search on v6.1, at a work budget: `rule-v7.1~{"replies":8}`. v6.1's settings stay its
  // default's.
  "rule-v7.1": {
    prefs: V7_1_PARAMS.prefs,
    engine: V7_1_PARAMS.engine,
    switches: { mixed: V7_1_PARAMS.search.mixed },
    knobs: { replies: V7_1_PARAMS.search.replies, candidates: V7_1_PARAMS.search.candidates },
    build: (prefs, engine, switches, knobs) => ruleV7_1({ ...V7_1_PARAMS, prefs, engine, search: { ...V7_1_PARAMS.search, ...switches, ...knobs } }),
  },
  // The student with one of its weight sets: `student-v1~{"weights":"pilot"}` (`ideas/student-v1.md`).
  "student-v1": {
    prefs: V7_PARAMS.prefs,
    engine: V7_PARAMS.engine,
    choices: { weights: { value: DEFAULT_WEIGHTS, options: Object.keys(WEIGHT_SETS) } },
    build: (prefs, engine, _switches, _knobs, choices) => studentBot({ ...V7_PARAMS, prefs, engine }, scorer(WEIGHT_SETS[choices.weights])),
  },
};

/** The network bots a measuring run may seat with settings of their own, each one of a list: a
 *  weight set, and how it picks a move (sampling, as trained, or its most likely move):
 *  `net-v1~{"weights":"m1a-25","pick":"argmax"}` (`bots/net-v1/`). */
export const WEIGHTED_BOTS: Readonly<Record<string, { settings: Readonly<Record<string, { value: string; options: readonly string[] }>>; build: (settings: Readonly<Record<string, string>>) => Bot }>> = {
  "net-v1": {
    settings: { weights: { value: NET_DEFAULT_WEIGHTS, options: Object.keys(NET_WEIGHT_SETS) }, pick: { value: "sample", options: PICKS } },
    build: ({ weights, pick }) => {
      if (!isPick(pick)) throw new Error(`net-v1's pick is one of ${PICKS.join(", ")}, not ${JSON.stringify(pick)}`);
      return netV1(weights, pick);
    },
  },
};

export type Overrides = Partial<Preferences & Engine>;

/** The label that seats `base` with some settings overridden: `rule-v1~{"borderWeight":0.7}`. */
export function tunedLabel(base: string, overrides: Overrides): string {
  return `${base}~${JSON.stringify(overrides)}`;
}

const tuned = new Map<string, Bot>();

function weightedBot(label: string, base: string): Bot {
  const known = tuned.get(label);
  if (known) return known;
  const given = JSON.parse(label.slice(label.indexOf("~") + 1)) as Record<string, unknown>;
  const { settings, build } = WEIGHTED_BOTS[base];
  const extra = Object.keys(given).filter((key) => !Object.hasOwn(settings, key));
  if (extra.length > 0) throw new Error(`"${base}" has the settings ${Object.keys(settings).map((k) => `"${k}"`).join(", ")}, not ${extra.map((k) => `"${k}"`).join(", ")}`);
  const chosen: Record<string, string> = {};
  for (const [key, { value: byDefault, options }] of Object.entries(settings)) {
    const value = Object.hasOwn(given, key) ? given[key] : byDefault;
    if (typeof value !== "string" || !options.includes(value)) throw new Error(`"${base}"'s "${key}" is one of ${options.join(", ")}, not ${JSON.stringify(value)}`);
    chosen[key] = value;
  }
  const bot = build(chosen);
  tuned.set(label, bot);
  return bot;
}

function tunedBot(label: string): Bot | null {
  const at = label.indexOf("~");
  if (at < 0) return null;
  const base = label.slice(0, at);
  if (Object.hasOwn(WEIGHTED_BOTS, base)) return weightedBot(label, base);
  if (!Object.hasOwn(TUNABLE_BOTS, base)) throw new Error(`no tunable Risk bot "${base}" (tunable: ${Object.keys(TUNABLE_BOTS).join(", ")})`);
  const known = tuned.get(label);
  if (known) return known;
  const overrides = JSON.parse(label.slice(at + 1)) as Record<string, unknown>;
  const { prefs, engine, switches = {}, knobs = {}, choices = {}, numbers = {}, build } = TUNABLE_BOTS[base];
  const moved = {
    prefs: { ...prefs },
    engine: { ...engine },
    switches: { ...switches },
    knobs: { ...knobs },
    numbers: { ...numbers },
    choices: Object.fromEntries(Object.entries(choices).map(([key, c]) => [key, c.value])),
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (Object.hasOwn(choices, key)) {
      if (typeof value !== "string" || !choices[key].options.includes(value)) throw new Error(`"${base}"'s "${key}" is one of ${choices[key].options.join(", ")}, not ${JSON.stringify(value)}`);
      moved.choices[key] = value;
    } else if (typeof value !== "number") throw new Error(`"${base}"'s setting "${key}" is a number, not ${JSON.stringify(value)}`);
    else if (Object.hasOwn(prefs, key)) moved.prefs[key as keyof Preferences] = value;
    else if (Object.hasOwn(engine, key)) moved.engine[key as keyof Engine] = value;
    else if (Object.hasOwn(switches, key)) {
      if (value !== 0 && value !== 1) throw new Error(`"${base}"'s switch "${key}" is 0 or 1, not ${value.toString()}`);
      moved.switches[key] = value;
    } else if (Object.hasOwn(knobs, key)) {
      if (!Number.isInteger(value) || value < 0) throw new Error(`"${base}"'s knob "${key}" is a whole number, 0 or more, not ${value.toString()}`);
      moved.knobs[key] = value;
    } else if (Object.hasOwn(numbers, key)) moved.numbers[key] = value;
    else throw new Error(`"${base}" has no setting "${key}"`);
  }
  const bot = build(moved.prefs, moved.engine, moved.switches, moved.knobs, moved.choices, moved.numbers);
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
