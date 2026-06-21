// v1 snapshot — the original champion, frozen (see EVOLUTION.md). Exposes the
// policy as `claudeV1Bot`, a drop-in `Bot`. This is the gauntlet's FLOOR and the
// base the version archive branches from. It is deliberately unrated
// (`RATING_EXCLUDED` — its logic stalls games), so it has no Elo and renders
// DEPRECATED in the lobby; `v1` always means *v1*.
export { policy as claudeV1Bot } from "./policy";
