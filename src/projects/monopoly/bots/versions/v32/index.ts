// v32 candidate — fork of v28 (the champion). v32 adds AUCTION VULTURE:
// when a distressed opponent is bidding, bid above normal value to starve them
// of assets. Denial on the auction channel — v5 covered trades + open buys only.
// Exposed as `v32Bot`.
export { claudeBot as v32Bot } from "./claude";
