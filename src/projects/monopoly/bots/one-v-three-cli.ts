// `npm run sim:1v3` — the 1-vs-3 lobby-geometry check from the standard
// evaluation kit (EVOLUTION.md, fable-v1 session; LEAPS.md L6): one candidate
// seat vs three of a base version, candidate seat rotating, null = 25%. The
// geometry a bot actually meets in a mixed lobby, which neither the 2+2
// versus nor the panel measures — it has REVERSED a standing conclusion once
// (claude-v46, the "equal twin" that collapses outnumbered) and tempered one
// (the fable-v4/v5/v6 stack's outnumbered cost). Pool two prefixes before
// trusting a read: single 400-game streams on this metric have misled by
// ±4 points (fable-v2 read 29.5% then 25.1%).
// Run: npm run sim:1v3 -- <candidate> <base> [games] [seedPrefix]
import { simulateGame } from "./simulate";
import { versionBot } from "./versions";

const [cand, baseLabel, gamesArg, prefixArg] = process.argv.slice(2);
const GAMES = Number(gamesArg ?? "400");
const PREFIX = prefixArg ?? "1v3";
const candidate = { label: cand, bot: versionBot(cand) };
const base = { label: baseLabel, bot: versionBot(baseLabel) };

let wins = 0;
let draws = 0;
for (let i = 0; i < GAMES; i++) {
  const seat = i % 4;
  const seats = [0, 1, 2, 3].map((s) => (s === seat ? candidate : base));
  const r = simulateGame({ seed: `${PREFIX}-${cand}-${i.toString()}`, seats });
  if (r.winnerId === null) draws++;
  else if (r.standings.find((s) => s.id === r.winnerId)?.label === cand) wins++;
}
const decisive = GAMES - draws;
console.log(
  `${cand} alone vs 3x ${baseLabel}: ${((wins / decisive) * 100).toFixed(1)}% ` +
    `(${wins.toString()}/${decisive.toString()} decisive, ${draws.toString()} draws; null = 25%)`,
);
