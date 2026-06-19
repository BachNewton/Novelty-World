// v1 snapshot — the original champion, frozen (see EVOLUTION.md). Exposes the
// policy as `v1Bot`, a drop-in `Bot`. This is the gauntlet's FLOOR and the base
// the version archive branches from; it is decoupled from whatever currently
// ships live (`bots/live.ts` → `LIVE_VERSION`), so `v1` always means *v1*.
export { claudeBot as v1Bot } from "./claude";
