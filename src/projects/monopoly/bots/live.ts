import type { Bot } from "./decision";
import { versionBot } from "./versions";

// ---------------------------------------------------------------------------
// The single source of truth for WHICH archived version ships to real games
// (online + dev). The live `claude` registry strategy resolves through here.
//
// PROMOTION IS THIS ONE LINE. Change `LIVE_VERSION` to a label in the version
// archive and the live bot becomes that snapshot — no code copy, no test churn
// (each version owns its tests under `versions/`), no doc surgery.
//
// Deliberately ORTHOGONAL to the gauntlet floor (`v1`) and the loop champion:
// shipping a version live is a product call and says nothing about the
// measurement field. The gauntlet fields versions by label and anchors Elo at
// v1, so `LIVE_VERSION` can never move a measurement result. You can ship a
// version live without making it the floor. See EVOLUTION.md "Coexistence &
// promotion".
// ---------------------------------------------------------------------------
export const LIVE_VERSION = "v17";

/** The live policy, resolved from the version archive at `LIVE_VERSION`. */
export const liveBot: Bot = versionBot(LIVE_VERSION);
