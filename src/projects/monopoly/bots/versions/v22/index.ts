// v22 candidate — self-contained snapshot (see EVOLUTION.md). Branched from the champion
// v17. v22 is a HOUSE-FAMINE DENIAL lever — the proven negative-sum shape on a new
// channel (the 32-house bank). v17 only holds at 4-and-hold (instead of hoteling, which
// frees 4 houses back to the bank) when the bank is nearly empty (≤6). v22 extends that
// famine-hold to when the bank is DRAWING DOWN (≤12) and rivals could use houses —
// proactively winning the race to starve rivals of development, sacrificing my own hotel
// rent for the denial. Isolated to `desiredLevel`; the trade engine is verbatim v17/v14.
// Exposed as `v22Bot`.
export { policy as v22Bot } from "./policy";
