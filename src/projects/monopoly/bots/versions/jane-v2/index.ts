// jane-v2 — the second version of the JANE lineage (see METHOD.md "Bot
// lineages"). Branched from jane-v1, adds four parameter discoveries that make
// the Jane lineage decisively beat Claude's champion v29 for the first time.
//
// THE JOURNEY (from jane-v1's ~50% tie with v29 to a decisive +104.6 Elo win):
//
// Starting from jane-v1 (SF=0.4, DENY=0.6, FLOOR=120, CUSHION=600), each axis
// was swept one parameter at a time with SPRT gauntlets (α=β=0.05, H0=-20,
// H1=+20 Elo). Every rejected variant is documented in the commit history of
// the jane-v2-spread-development branch.
//
// Discovery 1 — SURVIVAL_FACTOR 0.4 → 1.5 (jane-v10):
//   Each dollar of cash is worth up to $2.50 to a distressed seller (was $1.40).
//   The bot demands more when selling while distressed and needs less to acquire
//   from distressed opponents. vs v29: 55.4%, +37.7 Elo.
//
// Discovery 2 — DENY_FACTOR 0.6 → 0.3 (jane-v13):
//   Lowering the opponent-denial weight means the bot focuses on its OWN
//   development instead of wasting resources blocking opponents.
//   vs v29: 60.1%, +71.4 Elo.
//
// Discovery 3 — BASE_FLOOR 120 → 60 (jane-v15):
//   Lower cash reserve means more aggressive development sooner.
//   vs v29: 61.4%, +80.6 Elo.
//
// Discovery 4 — HOTEL_CUSHION 600 → 300 (jane-v18):
//   Trigger hotel development at a lower cash threshold.
//   vs v29: 64.6%, +104.6 Elo.
//
// Also tested and REJECTED (all declined vs jane-v18):
//   - FLOOR_CAP 300→150, JAIL_DANGER_RENT 350→200, FLOOR_RENT_FRACTION 0.3→0.15
//   - SURVIVAL_FACTOR re-tune (1.2, 1.8 both worse)
//   - Opponent-aware hotel timing (pushes hotels when opponents distressed)
//   - SPREAD_FLOOR 3→2 (faster spread)
//   - GROUP_WEIGHT retune (cheap sets higher)
//   - Aggressive buy thresholds (RAISE_WORTH_MULT, DIP_WORTH_MULT)
//   - ACCEPT_MARGIN 30→10 and 30→50
//
// All four discoveries push the same direction: more aggressive, more
// self-focused. jane-v18 is the peak of this lineage.
//
// Measured (official `npm run sim:gauntlet -- jane-v18 --base v29 --field v29`):
// 64.6% win rate, +104.6 Elo, SPRT passed (LLR improvement 2.96).
export { claudeBot as janeV2Bot } from "./policy";
