// v13 candidate — self-contained snapshot (see EVOLUTION.md). Branched from the
// champion v5. v13's change is the ANTI-KINGMAKER rule: the bot's incoming-trade
// vote prices the rival-monopoly threat by the recipient's STANDING — extra loath
// to feed its strongest opponent, more willing to feed a harmless trailer — while
// construction and the counterparty model stay exactly v5. Exposed as `v13Bot`.
export { policy as v13Bot } from "./policy";
