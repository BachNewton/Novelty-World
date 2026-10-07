import type { AiDecision, GameState, Intent } from "../../types";
import type { JsonSchema, Sampling } from "./model/adapter";

// The contract between the shared AI machinery (claim, ask, settle) and a
// frozen AI version (`versions/`). A version owns everything that shapes play:
// what the model is told, the shape its answers take and how they become
// intents, when it is asked, and how its model is called.

/** One step of carrying out an answer: an intent, or a mechanical `step` (one
 *  `autoStep`): the jail roll, or opening a boundary window the seat armed. */
export type AiOp = { kind: "intent"; intent: Intent } | { kind: "step" };

/** What one answer amounts to once read: the ops to carry out (in order, in one
 *  write), and the seat's own bookkeeping. An empty `publicNote` puts nothing on
 *  the table; the private note and plan are still kept. */
export interface AiResolution {
  ops: AiOp[];
  auctionMax: number | null;
  publicNote: string;
  privateNote: string;
  plan: string;
}

export type Resolved = { ok: true; resolution: AiResolution } | { ok: false; reason: string };

/** One decision kind: what the model is asked, the shape its answer must take,
 *  and how that answer becomes intents. `think` gives the model room to reason
 *  before answering, for decisions worth the wait. `verify` checks the state
 *  after the intents apply, for a decision whose answer can be legal yet not
 *  finish the job. */
export interface DecisionSpec {
  think: boolean;
  question: (state: GameState, seat: string) => string;
  schema: (state: GameState, seat: string) => JsonSchema;
  /** A second, quick question that some first answers need before they can be
   *  carried out (a counter's terms, once "counter" is chosen), or null when
   *  the first answer is complete. Its answer goes into the first under `key`,
   *  and `resolve` reads the two together. */
  followUp?: (state: GameState, seat: string, answer: Record<string, unknown>) => FollowUp | null;
  resolve: (state: GameState, seat: string, answer: Record<string, unknown>) => Resolved;
  verify?: (after: GameState, seat: string) => string | null;
}

/** A follow-up question: asked without thinking, with the same view. */
export interface FollowUp {
  key: string;
  question: string;
  schema: JsonSchema;
}

/** What the model is sent: a system message that never changes between calls
 *  (so the model server can reuse its work on it), and the seat's view plus the
 *  question. */
export interface AiPrompt {
  system: string;
  user: string;
}

/** A frozen AI version: one `llm-vN` label and everything it plays with.
 *  Changing anything here makes a new version; a registered one is never
 *  edited. */
export interface AiVersion {
  label: string;
  /** The decisions it can make. A decision missing here fails loudly. */
  specs: Readonly<Partial<Record<AiDecision, DecisionSpec>>>;
  buildPrompt: (state: GameState, seat: string, question: string) => AiPrompt;
  /** Whether the seat owes its turn-start question now (pure). */
  turnStartOwed: (state: GameState, seat: string) => boolean;
  /** The board facts a turn-start question was answered against, stored so a
   *  later turn can tell whether anything relevant changed. */
  turnStartFingerprint: (state: GameState, seat: string) => string;
  /** How the model is called: the thinking budget, and sampling (null = the
   *  model server's own defaults). */
  call: { thinkTokens: number; sampling: Sampling | null };
  /** Whether the seat's public note on an auction stays off the log until the
   *  auction closes, so it can't give its maximum away. */
  holdAuctionNotes: boolean;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** A list of whole-number square positions, or null if it isn't one. */
export function readPositions(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const positions: number[] = [];
  for (const v of value) {
    if (typeof v !== "number" || !Number.isInteger(v)) return null;
    positions.push(v);
  }
  return positions;
}
