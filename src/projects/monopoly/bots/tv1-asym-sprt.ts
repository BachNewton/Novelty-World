import { runHeadToHead } from "./tournament";
import { versionBot } from "./versions";
import * as fs from "fs";

// SPRT for trade-v1 (asymmetric valuation) vs jane-v3 champion
// H0: trade-v1 is NOT better than jane-v3 (win rate <= 50%)
// H1: trade-v1 IS better than jane-v3 (win rate >= 55%)

function sprtLLR(wins: number, losses: number, draws: number, p0: number, p1: number): number {
  const n = wins + losses + draws;
  if (n === 0) return 0;
  const decWins = wins + 0.5 * draws;
  const pHat = decWins / n;
  // Avoid log(0)
  const eps = 1e-10;
  const llr = pHat * Math.log((p1 + eps) / (p0 + eps)) + (1 - pHat) * Math.log((1 - p1 + eps) / (1 - p0 + eps));
  return n * llr;
}

const BATCH_SIZE = 20;
const MAX_GAMES = 500;
const THRESHOLD_UPPER = 2.94;  // accept H1
const THRESHOLD_LOWER = -2.94; // accept H0
const P0 = 0.50; // H0: not better
const P1 = 0.55; // H1: better

const tradeV1 = { label: "trade-v1", bot: versionBot("trade-v1")! };
const janeV3 = { label: "jane-v3", bot: versionBot("jane-v3")! };

let tv1Wins = 0, v3Wins = 0, draws = 0;
let batch = 0;

console.log("=== trade-v1 Asymmetric Valuation SPRT ===");
console.log(`H0: WR<=${P0*100}%  H1: WR>=${P1*100}%  Thresholds: [${THRESHOLD_LOWER}, ${THRESHOLD_UPPER}]`);

const progressFile = "/workspace/tv1-asym-sprt-progress.json";

while (true) {
  const seeds = Array.from({length: BATCH_SIZE}, (_, i) => `tv1-asym-${batch}-${i}`);
  const result = runHeadToHead({
    a: tradeV1, b: janeV3,
    seeds, maxTurns: 500,
  });
  tv1Wins += result.aWins;
  v3Wins += result.bWins;
  draws += result.draws;
  batch++;

  const llr = sprtLLR(tv1Wins, v3Wins, draws, P0, P1);
  const totalGames = tv1Wins + v3Wins + draws;
  const winRate = totalGames > 0 ? ((tv1Wins + 0.5 * draws) / totalGames * 100).toFixed(1) : "0";

  let decision = "continue";
  if (llr >= THRESHOLD_UPPER) decision = "accept-H1 (trade-v1 is BETTER)";
  else if (llr <= THRESHOLD_LOWER) decision = "accept-H0 (trade-v1 is NOT better)";

  console.log(`${totalGames}g: tv1=${tv1Wins} v3=${v3Wins} draws=${draws} WR=${winRate}% LLR=${llr.toFixed(2)} ${decision}`);

  // Save progress
  const progress = {
    games: totalGames, tv1Wins, v3Wins, draws,
    winRate: totalGames > 0 ? (tv1Wins + 0.5 * draws) / totalGames : 0,
    sprt: { llr, decision, thresholdUpper: THRESHOLD_UPPER, thresholdLower: THRESHOLD_LOWER },
  };
  fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));

  if (decision !== "continue" || totalGames >= MAX_GAMES) {
    const final = { ...progress, result: decision, conclusion: decision };
    fs.writeFileSync("/workspace/tv1-asym-sprt-final.json", JSON.stringify(final, null, 2));
    console.log(`\n=== FINAL: ${decision} ===`);
    console.log(`Games: ${totalGames}, tv1=${tv1Wins}, v3=${v3Wins}, draws=${draws}`);
    console.log(`Win rate: ${winRate}%`);
    console.log(`LLR: ${llr.toFixed(2)}`);
    break;
  }
}
