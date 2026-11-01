import { BOT_RATINGS } from "./ratings";

/** The versions carrying the HUMAN-COUNTERPARTY MODEL, in increasing fullness — the
 *  THIRD hand-maintained eval knob, alongside `RATING_EXCLUDED` and `RATING_PANEL`,
 *  and for the same reason: the Elo ladder cannot derive it. The human DIMS are gated
 *  on the counterparty being human (`botStrategy === null` — see `bots/CLAUDE.md` "The
 *  human-counterparty model"), so they contribute nothing to bot-vs-bot play and the
 *  ladder can never propose an entry on the strength of them.
 *
 *  Entries need not be bot-play-identical to each other: fable-v11/v12 are pinned
 *  twins of fable-v8, but fable-v14 adds `auctionTailFrac` — a NON-gated guard that
 *  does change bot play (and rates above v12 because of it). Membership means "carries
 *  the human model", not "is a pinned twin".
 *
 *  INVARIANT: the seat a human actually plays must carry the model. `roles.ts`
 *  `DEFAULT_BOT_VERSION` therefore seats the FULLEST entry (last) whenever the Elo
 *  topper is NOT itself listed here — a human-blind bot may hold the crown and the
 *  "Strongest" display on bot-vs-bot merit, but it does not get the human's seat.
 *
 *  Why the rule is "topper lacks the model" and not "topper is one specific base":
 *  it used to key off a single `base` (fable-v8) plus its twins, which silently
 *  stopped protecting the moment a bot from ANOTHER lineage topped the ladder.
 *  jane-v20 (PR #11) is exactly that case — a human-blind crown whose probe-gate
 *  leakage is 4× the model's ($530 vs $130) — and the old predicate would have
 *  seated it. See EVOLUTION.md "jane-v20".
 *
 *  Extend when a fuller human-model version lands. When a new champion supersedes
 *  these in real strength, the fix is to build its human-aware version and add it
 *  here — not to relax the rule. */
export const HUMAN_MODEL_VERSIONS: readonly string[] = ["fable-v11", "fable-v12", "fable-v14"];

/** The version a fresh bot seat plays by default (`addBot`, `freshGame`) — the
 *  opponent a HUMAN actually faces. This is NOT simply the top of the Elo ladder:
 *  Elo is measured bot-vs-bot, and the archive's human-facing refinement (the fable
 *  human-counterparty model) is pinned IDENTICAL to its base in bot play, so the
 *  ladder can't see it and would seat a human against a human-BLIND bot. So whenever
 *  the Elo-strongest bot does not itself carry the model, we seat the FULLEST version
 *  that does (see `bots/CLAUDE.md` "The human-counterparty model"). The Elo-derived
 *  "Strongest" DISPLAY (`LOBBY_BOTS.overallBest`) is unchanged — this moves only the
 *  default SEAT. Apart from the lobby's derivation (`roles.ts`) because a game's
 *  setup needs this label, not the archive behind it. */
export const DEFAULT_BOT_VERSION: string = humanFacingDefault();

function humanFacingDefault(): string {
  const fullest = HUMAN_MODEL_VERSIONS.at(-1);
  if (fullest === undefined) throw new Error("no human-model bot versions listed");
  const ratings = Object.entries(BOT_RATINGS);
  const eloBest = ratings.reduce((best, entry) => ((entry[1] ?? -Infinity) > (best[1] ?? -Infinity) ? entry : best), ratings[0]);
  return HUMAN_MODEL_VERSIONS.includes(eloBest[0]) ? eloBest[0] : fullest;
}
