// kyle-v3 — kyle-v2 plus a trade engine, branched from kyle-v2. Replaces the two
// color tables with one MATCH_VALUE ladder (driving both the mortgage order and
// trade valuation), accepts any N-way trade that completes a set for Kyle on
// fair terms, and proactively proposes the best mutual-completion cycle it can
// build. Plain-language strategy in ./PHILOSOPHY.md, wiring in ./policy.ts.
export { policy as kyleV3Bot } from "./policy";
