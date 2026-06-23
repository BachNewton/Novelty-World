// kyle-v2 — the first KYLE version with real logic, branched from the kyle-v1
// blank baseline. Adds a buy/raise-cash/forced-liquidation policy: always buy
// what you can afford, mortgage in a fixed value order to complete sets, never
// sell houses voluntarily. Plain-language strategy in ./PHILOSOPHY.md, wiring in
// ./policy.ts.
export { policy as kyleV2Bot } from "./policy";
