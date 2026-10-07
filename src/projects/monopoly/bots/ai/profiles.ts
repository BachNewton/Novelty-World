import type { BotStrategy, GameState } from "../../types";

/** The model profiles an AI seat can play as. A seat's `botStrategy` stores the
 *  profile id; which server, model and key it reaches is server-side config
 *  (`model/config.ts`), so a client can only pick from this list, never point the
 *  route at an address of its own. Client-safe: no server config lives here. */
export const AI_PROFILES = {
  "ai:local": { label: "Local LLM" },
} as const;

export type AiProfileId = keyof typeof AI_PROFILES;

// `Object.keys` types its result as `string[]`; the keys of a literal object are
// exactly its profile ids.
export const AI_PROFILE_IDS = Object.keys(AI_PROFILES) as readonly AiProfileId[];

export function isAiStrategy(strategy: BotStrategy | null): strategy is AiProfileId {
  return strategy !== null && strategy in AI_PROFILES;
}

/** Whether a seat is played by a language model rather than a rule-based bot. */
export function isAiSeat(state: GameState, playerId: string): boolean {
  const player = state.players.find((p) => p.id === playerId);
  return player !== undefined && isAiStrategy(player.botStrategy);
}
