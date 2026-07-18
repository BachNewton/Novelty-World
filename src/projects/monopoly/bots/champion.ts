// ---------------------------------------------------------------------------
// The EVOLUTION-LOOP STATE: which version currently holds the crown, and which one
// the next version branches from. Two labels, and they are the only MUTABLE facts
// in the whole evolution record — every version bump overwrites them.
//
// Why they live in code rather than in EVOLUTION.md prose: a mutable pointer inside
// an append-only document rots silently. EVOLUTION.md's job is the RECORD (what was
// tried, what it measured — rows that are never edited); a value that changes every
// session is a different lifecycle and needs a different home. Here, the labels
// resolve through the same archive lookup as everything else, so a cull that removed
// a crowned version fails LOUDLY in `champion.test.ts` instead of leaving a doc
// quietly wrong (see the root CLAUDE.md: docs describe concepts, references must
// fail loudly).
//
// NOT the same as the player-facing default. `roles.ts` `DEFAULT_BOT_VERSION` is the
// STRONGEST bot (top of the Elo ladder, ungated, derived) — a different audience and
// a different bar. The three can legitimately disagree, and collapsing them is the
// single biggest trap in this model. See EVOLUTION.md "Two bests: strongest vs crown
// vs substrate" for why.
// ---------------------------------------------------------------------------

/** The CROWN — the reigning champion: the latest version to clear the strict crown
 *  gate (SPRT `BETTER` vs its base on BOTH seed streams, AND no regression against
 *  any anchor-panel member). Elo PROPOSES, SPRT CONFIRMS: a ladder-topper that is
 *  only EVEN under SPRT is recorded and may be the player default, but is not
 *  crowned. Advancing this needs no human greenlight — only the measurement. */
export const CROWN = "fable-v7";

/** The SUBSTRATE — what the next version is evolved FROM. A JUDGMENT, not a rule:
 *  the crown is the default prior, but you are free to branch from any family or
 *  start fresh (survey all of them — "winning is the only loyalty"). Today it is
 *  fable-v12, a deliberate call with an unusually clean argument: it IS the
 *  prior substrate fable-v8 in every bot-vs-bot game (identity pinned and
 *  demonstrated over 40 full seeded games), plus the two-iteration human-
 *  counterparty model — no premium asks or surplus riders against human
 *  seats, a $75 margin on human-proposed trades, and a 2× threat multiplier
 *  when arming a human — each dim live-validated in a human-marked probe game
 *  (see EVOLUTION.md "the 4q3y6i night", fable-v11/fable-v12). */
export const SUBSTRATE = "fable-v12";
