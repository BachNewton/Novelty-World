// gemini-v1 — the first version of the GEMINI lineage (a bot family distinct
// from Claude and Jane; see METHOD.md "Bot lineages"). Authored by Gemini and
// wired into our `Bot` contract (see ./policy.ts for the wiring-only changes).
// Branched from nothing — an independent, from-scratch rule-based policy.
export { policy as geminiV1Bot } from "./policy";
