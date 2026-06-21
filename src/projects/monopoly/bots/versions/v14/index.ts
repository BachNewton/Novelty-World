// v14 candidate — self-contained snapshot (see EVOLUTION.md). Branched from the
// champion v5. v14 fixes the PHANTOM-DENIAL bug (live-game Finding 1): Offer C now
// gates the denial premium on the rival's ability to REALISTICALLY acquire the
// completer, so an already-blocked weak lot no longer hot-potatoes between bots.
// Construction is otherwise verbatim v5. Exposed as `v14Bot`.
export { policy as v14Bot } from "./policy";
