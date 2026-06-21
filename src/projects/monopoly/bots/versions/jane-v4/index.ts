// jane-v4 — the fourth version of the JANE lineage (see EVOLUTION.md "Bot
// lineages"). The current champion, branched from jane-v2 with three
// improvements that make it decisively beat claude-v35 (the Claude lineage's
// strongest version).
//
// vs claude-v35: 56.8% win rate, +47.8 Elo, SPRT passed.
// vs claude-v29: 55.5% win rate, +38.3 Elo, SPRT passed.
// Champion across the full Claude field — no regressions, no overfitting.
//
// IMPROVEMENT 1 — RAIL_SYNERGY [0,0,70,180,380] → [0,0,100,250,500]:
//   Railroads provide consistent income that funds aggressive development.
//   Valuing them higher means the bot acquires/buys more rails, creating a
//   cash-flow flywheel: rails → income → houses/hotels → more income.
//
// IMPROVEMENT 2 — distressThreatScale backport from claude-v35:
//   When the bot is genuinely distressed (one bad landing from bankruptcy),
//   it discounts the rival-monopoly threat premium to zero — immediate cash
//   now outweighs the future cost of an empowered rival. The seller half of
//   the symmetric pricing fix.
//
// IMPROVEMENT 3 — STRUCTURAL TRADE MEMORY (the key innovation):
//   Fixes the hot-potato ring structurally instead of with pricing patches.
//   The ring: bots compete for the premium-collector position on a rival's
//   set-completer lot, rotating it turn after turn (21-42 hops observed on
//   one lot in live games). Each hop is net-zero but wastes turns.
//
//   jane-v4's fix: refuse to propose a DENIAL trade (Offer C) for a lot that
//   recently changed hands via trade (within 8 turns). These "hot" lots are
//   exactly the ones producing the premium-collector rotation.
//
//   Unlike v34's blanket cooldown (which blocked ALL re-trades and made bots
//   stop collecting premiums, regressing -15 Elo), jane-v4 only blocks DENIAL
//   trades. Completion trades (Offer A/B) are always allowed — completing your
//   own monopoly is a genuine structural reason to acquire a lot.
//
//   This eliminates the ring at the source: you can't hot-potato if you refuse
//   to re-trade for denial without cause.
//
// PRIOR FIXES (all pricing patches, documented in EVOLUTION.md):
//   - claude-v14: phantom-denial gate (closed weak-set case only)
//   - claude-v33: marginal-denial price gate (too broad, regressed -15 Elo)
//   - claude-v34: temporal anti-churn cooldown (killed rings, regressed -15 Elo)
//   - claude-v35: denialPositionCost (pricing symmetry — works but is a patch)
//
// jane-v4 is the first version to fix the ring STRUCTURALLY rather than by
// tuning pricing parameters. The CHURN_WINDOW=8 parameter is remarkably
// stable — sweeps at 4 (+46.3) and 12 (+47.6) are within noise of the kept 8.
export { claudeBot as janeV4Bot } from "./policy";
