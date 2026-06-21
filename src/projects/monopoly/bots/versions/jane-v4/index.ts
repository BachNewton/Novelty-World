// jane-v4 — the fourth version of the JANE lineage (see EVOLUTION.md "Bot
// lineages"). Branched from jane-v3, adds a STRUCTURAL anti-churn fix.
//
// THE HOT-POTATO PROBLEM:
//   Bots compete for the premium-collector position on a rival's set-completer
//   lot. Turn after turn, the lot rotates among non-rivals (21-42 hops observed
//   on one lot in live games) as each bot tries to be the one holding it when
//   the one-short rival pays out. Each hop is net-zero but wastes turns and
//   produces indecisive, long games.
//
// PRIOR FIXES (all pricing patches):
//   - v14: phantom-denial gate (closed weak-set case only)
//   - v33: marginal-denial price gate (too broad, regressed -15 Elo)
//   - v34: temporal anti-churn cooldown (killed rings but bot stopped collecting,
//          regressed -15 Elo)
//   - v35: denialPositionCost (pricing symmetry — works but is a patch)
//
// jane-v4 STRUCTURAL FIX — trade memory:
//   Instead of patching pricing so each hop costs more, jane-v4 changes the
//   trade PROPOSAL logic: don't propose a denial (Offer C) for a lot that
//   recently changed hands via trade. These "hot" lots are exactly the ones
//   producing the premium-collector rotation.
//
//   Unlike v34's blanket cooldown (which blocked ALL re-trades), jane-v4 only
//   blocks DENIAL trades. Completion trades (Offer A/B) are always allowed —
//   completing your own monopoly is a genuine structural reason to re-acquire.
//
//   This eliminates the ring at the source: you can't hot-potato if you refuse
//   to re-trade for denial without cause.
export { claudeBot as janeV4Bot } from "./policy";
