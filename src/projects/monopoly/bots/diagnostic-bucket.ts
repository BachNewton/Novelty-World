// Diagnostic: bucket jane-v2 vs jane-v1 wins by game length
import { VERSIONS } from "./versions/index.ts";

const BUCKETS = [
  { name: "short (<100)", min: 0, max: 100 },
  { name: "mid (100-150)", min: 100, max: 150 },
  { name: "late (150-200)", min: 150, max: 200 },
  { name: "long (200+)", min: 200, max: 9999 },
];

const GAMES = 400;
const results = BUCKETS.map(() => ({ v2Wins: 0, v1Wins: 0, draws: 0 }));

// Match the gauntlet's API: simulateGame({ seats, seed, maxTurns })
const { simulateGame } = await import("./simulate.ts");

for (let i = 0; i < GAMES; i++) {
  const seed = `diag:${i}`;
  const labels = i % 2 === 0
    ? ["jane-v2", "jane-v1", "jane-v2", "jane-v1"]
    : ["jane-v1", "jane-v2", "jane-v1", "jane-v2"];

  const seats = labels.map(l => ({ label: l, bot: VERSIONS[l] }));
  const result = simulateGame({ seats, seed, maxTurns: 2000 });

  const bucket = BUCKETS.findIndex(b => result.turns >= b.min && result.turns < b.max);
  if (bucket < 0) continue;

  // Match gauntlet logic: only count if game terminated (someone went bankrupt)
  if (result.terminated) {
    const winnerStanding = result.standings.find((s: any) => !s.bankrupt);
    const winnerLabel = winnerStanding?.label ?? null;
    if (winnerLabel === "jane-v2") results[bucket].v2Wins++;
    else if (winnerLabel === "jane-v1") results[bucket].v1Wins++;
    else results[bucket].draws++;
  } else {
    results[bucket].draws++;
  }
}

console.log("\njane-v2 vs jane-v1 — win rate by game length:");
console.log("Bucket             | v2 wins | v1 wins | draws | v2 win%");
console.log("-------------------|---------|---------|-------|-------");
for (let i = 0; i < BUCKETS.length; i++) {
  const b = BUCKETS[i];
  const r = results[i];
  const decisive = r.v2Wins + r.v1Wins;
  const pct = decisive > 0 ? ((r.v2Wins / decisive) * 100).toFixed(1) : "—";
  console.log(`${b.name.padEnd(19)}| ${String(r.v2Wins).padStart(7)} | ${String(r.v1Wins).padStart(7)} | ${String(r.draws).padStart(5)} | ${pct}%`);
}
