import { simulateGame, type Contender, type SimResult } from "./simulate";
import { versionBot } from "./versions";

const field = ["v1", "v5", "v14", "v17", "v28", "v29", "v32", "v33"];
const numSeeds = 20;
const maxTurns = 1500;

// Run all pairs
const results: Record<string, Record<string, { w: number; l: number; d: number }>> = {};
for (const f of field) results[f] = {};
for (const a of field) {
  for (const b of field) {
    if (a >= b) continue;
    const botA: Contender = { label: a, bot: versionBot(a) };
    const botB: Contender = { label: b, bot: versionBot(b) };
    let aw = 0, bw = 0, d = 0;
    for (let i = 0; i < numSeeds; i++) {
      const seats: Contender[] = i % 2 === 0 ? [botA, botB, botA, botB] : [botB, botA, botB, botA];
      const r: SimResult = simulateGame({ seats, seed: `elo-${a}-${b}-${i}`, maxTurns });
      if (!r.terminated) { d++; continue; }
      const winner = r.standings.find((s) => !s.bankrupt)?.label ?? "";
      if (winner === a) aw++; else if (winner === b) bw++; else d++;
    }
    results[a][b] = { w: aw, l: bw, d };
    results[b][a] = { w: bw, l: aw, d };
  }
}

// Simple Elo: start everyone at 1000, K=32
const elo: Record<string, number> = {};
for (const f of field) elo[f] = 1000;
for (let iter = 0; iter < 10; iter++) {
  for (const a of field) {
    for (const b of field) {
      if (a >= b) continue;
      const r = results[a][b];
      const ea = 1 / (1 + Math.pow(10, (elo[b] - elo[a]) / 400));
      const eb = 1 - ea;
      const total = r.w + r.l;
      if (total === 0) continue;
      const sa = r.w / total;
      const sb = r.l / total;
      elo[a] += 32 * (sa - ea);
      elo[b] += 32 * (sb - eb);
    }
  }
}

console.log("\nElo Ratings (10 iterations, K=32, 20 games/pair, 1500 turn cap):\n");
const sorted = Object.entries(elo).sort((a, b) => b[1] - a[1]);
console.log("  Version   Elo");
console.log("  " + "-".repeat(20));
for (const [v, e] of sorted) {
  console.log(`  ${v.padEnd(10)} ${e.toFixed(0)}`);
}

// Head-to-head matrix
console.log("\nWin rates (row vs col, 20 games each):\n");
console.log("       " + field.map(f => f.padStart(6)).join(""));
for (const a of field) {
  let row = `  ${a.padEnd(5)}`;
  for (const b of field) {
    if (a === b) { row += "    —"; continue; }
    const r = results[a][b];
    const total = r.w + r.l;
    const pct = total > 0 ? Math.round(100 * r.w / total) : 0;
    row += `${String(pct).padStart(5)}%`;
  }
  console.log(row);
}
console.log("");
