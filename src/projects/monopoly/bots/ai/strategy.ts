import type { BotStrategy, GameState } from "../../types";
import type { AiVersion } from "./spec";
import { AI_VERSIONS, type AiVersionLabel } from "./versions";

/** The model profiles an AI seat can play through: which server and model it
 *  reaches is server-side config (`model/config.ts`), so a client can only pick
 *  from this list, never point the route at an address of its own. Client-safe:
 *  no server config lives here. */
export const AI_PROFILES = {
  "ai:local": { label: "Local LLM" },
  "ai:claude": { label: "Claude" },
} as const;

export type AiProfileId = keyof typeof AI_PROFILES;

// `Object.keys` types its result as `string[]`; the keys of a literal object are
// exactly its profile ids.
export const AI_PROFILE_IDS = Object.keys(AI_PROFILES) as readonly AiProfileId[];

/** An AI seat's two axes: the model it plays through (`profile`) and the frozen
 *  version of everything we control about how it plays (`version`). */
export interface AiStrategy {
  profile: AiProfileId;
  version: AiVersionLabel;
}

/** How an AI seat's `botStrategy` is written: `<profile>@<version>`, e.g.
 *  `ai:local@llm-v2`. This and `parseAiStrategy` are the only places that know. */
export function aiStrategyId({ profile, version }: AiStrategy): BotStrategy {
  return `${profile}@${version}`;
}

/** The profile and version a `botStrategy` names, or null when it isn't an AI
 *  seat's (or names a profile or version that doesn't exist). */
export function parseAiStrategy(strategy: BotStrategy | null): AiStrategy | null {
  if (strategy === null) return null;
  const at = strategy.indexOf("@");
  if (at < 0) return null;
  const profile = strategy.slice(0, at);
  const version = strategy.slice(at + 1);
  if (!isProfile(profile) || !isVersion(version)) return null;
  return { profile, version };
}

export function isAiStrategy(strategy: BotStrategy | null): boolean {
  return parseAiStrategy(strategy) !== null;
}

/** Whether a seat is played by a language model rather than a rule-based bot. */
export function isAiSeat(state: GameState, playerId: string): boolean {
  return aiStrategyOf(state, playerId) !== null;
}

export function aiStrategyOf(state: GameState, playerId: string): AiStrategy | null {
  const player = state.players.find((p) => p.id === playerId);
  return player === undefined ? null : parseAiStrategy(player.botStrategy);
}

/** The AI version a seat plays, or null when it isn't an AI seat. */
export function aiVersionOf(state: GameState, playerId: string): AiVersion | null {
  const strategy = aiStrategyOf(state, playerId);
  return strategy === null ? null : AI_VERSIONS[strategy.version];
}

function isProfile(id: string): id is AiProfileId {
  return id in AI_PROFILES;
}

function isVersion(label: string): label is AiVersionLabel {
  return label in AI_VERSIONS;
}
