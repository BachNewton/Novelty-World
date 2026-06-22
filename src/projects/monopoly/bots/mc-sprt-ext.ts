// Extended SPRT: jane-v5 (6 MC points) vs jane-v3
// Up to 200 games with SPRT stopping rules (accept-H1 at LLR >= 2.94, accept-H0 at LLR <= -2.94)
// Uses seeds ext-1 through ext-200 to avoid overlap with prior runs.
import { simulateGame } from "./simulate";
import { versionBot } from "./versions";
import type { Contender } from "./simulate";
import * as fs from "fs";

function makeContender(label: string, version: string): Contender {
  return { label, marker: version, bot: versionBot(version) };
}

const A_SEATINGS = [
  new Set([0, 1]),
  new Set([0, 2]),
  new Set([0, 3]),
  new Set([1, 2]),
  new Set([1, 3]),
  new Set([2, 3]),
];

const MAX_GAMES = 200;
let v5Wins = 0;
let v3Wins = 0;
let draws = 0;
const results: any[] = [];

console.log(`=== jane-v5 (6 MC) vs jane-v3 — EXTENDED SPRT ===`);
console.log(`Max games: ${MAX_GAMES}, accept-H1 at LLR >= 2.94`);
console.log(`Started: ${new Date().toISOString()}`);

function sprt(wins: number, losses: number): { llr: number; decision: string } {
  const n = wins + losses;
  if (n === 0) return { llr: 0, decision: "continue" };
  const p0 = 0.50, p1 = 0.57;
  const llr = wins * Math.log(p1 / p0) + losses * Math.log((1 - p1) / (1 - p0));
  let decision = "continue";
  if (llr >= 2.94) decision = "accept-H1 (jane-v5 is BETTER)";
  else if (llr <= -2.94) decision = "accept-H0 (no improvement)";
  return { llr, decision };
}

for (let i = 0; i < MAX_GAMES; i++) {
  const seed = `ext-${i + 1}`;
  const t0 = performance.now();

  const aSeats = A_SEATINGS[i % A_SEATINGS.length];
  const seats = [0, 1, 2, 3].map(s =>
    aSeats.has(s)
      ? makeContender(`v5-${s}`, "jane-v5")
      : makeContender(`v3-${s}`, "jane-v3")
  );

  console.log(`\nGame ${i + 1}/${MAX_GAMES} (seed ${seed})...`);

  try {
    const result = simulateGame({ seed, seats, maxTurns: 500 });
    const elapsed = (performance.now() - t0) / 1000;
    const winnerLabel = result.standings.find(s => s.id === result.winnerId)?.label ?? "draw";
    const isV5 = winnerLabel.startsWith("v5");
    const isV3 = winnerLabel.startsWith("v3");

    if (isV5) v5Wins++;
    else if (isV3) v3Wins++;
    else draws++;

    console.log(`  ${result.turns} turns, ${elapsed.toFixed(0)}s, winner=${winnerLabel}`);
    console.log(`  Running: v5=${v5Wins} v3=${v3Wins} draws=${draws} (${((v5Wins / (i + 1)) * 100).toFixed(0)}%)`);

    results.push({ game: i + 1, seed, turns: result.turns, elapsedSec: elapsed, winner: winnerLabel });

    const { llr, decision } = sprt(v5Wins, v3Wins);
    console.log(`  SPRT: LLR=${llr.toFixed(2)} → ${decision}`);

    fs.writeFileSync("/workspace/mc-sprt-progress.json", JSON.stringify({
      test: "jane-v5 (6 MC points) vs jane-v3 EXTENDED SPRT",
      games: i + 1, v5Wins, v3Wins, draws,
      winRate: v5Wins / (i + 1),
      sprt: { llr, decision },
      lastUpdated: new Date().toISOString(),
    }, null, 2));

    if (decision.startsWith("accept")) {
      console.log(`\n=== SPRT DECISION: ${decision} ===`);
      console.log(`Stopping after ${i + 1} games.`);
      break;
    }
  } catch (e) {
    const elapsed = (performance.now() - t0) / 1000;
    console.error(`  ERROR after ${elapsed.toFixed(0)}s: ${e}`);
    results.push({ game: i + 1, seed, error: String(e) });
  }
}

const { llr, decision } = sprt(v5Wins, v3Wins);
const summary = {
  test: "jane-v5 (6 MC points) vs jane-v3 EXTENDED SPRT",
  totalGames: results.length, v5Wins, v3Wins, draws,
  winRate: results.length > 0 ? v5Wins / results.length : 0,
  sprt: { llr, decision },
  finished: new Date().toISOString(),
};
fs.writeFileSync("/workspace/mc-sprt-final.json", JSON.stringify(summary, null, 2));
console.log(`\n=== FINAL ===`);
console.log(`Games: ${results.length}, v5: ${v5Wins}, v3: ${v3Wins}, draws: ${draws}`);
console.log(`Win rate: ${(summary.winRate * 100).toFixed(1)}%`);
console.log(`SPRT: LLR=${llr.toFixed(2)} → ${decision}`);
