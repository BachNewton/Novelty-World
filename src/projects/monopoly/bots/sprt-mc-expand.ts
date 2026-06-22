// Expanded MC SPRT: jane-v5 (buy+jail+auction+trade) vs jane-v3.
// Resumable across sandbox time limits.
import { simulateGame } from "./simulate";
import { janeV5Bot } from "./versions/jane-v5";
import { janeV3Bot } from "./versions/jane-v3";
import { sprt } from "./sprt";
import type { Bot } from "./decision";
import * as fs from "fs";

const STATE_FILE = "/workspace/Novelty-World/mc-expand-sprt.json";
const MARGIN = 20, ALPHA = 0.05, BETA = 0.05;

interface State { wins: number; losses: number; gameIdx: number; }

let state: State = fs.existsSync(STATE_FILE)
  ? JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"))
  : { wins: 0, losses: 0, gameIdx: 0 };

const startW = state.wins, startL = state.losses;
const upper = Math.log((1-ALPHA)/ALPHA);
console.log(`Starting from W=${state.wins} L=${state.losses} idx=${state.gameIdx}`);

// Run as many games as we can fit in ~260s (leaving margin for startup/shutdown)
const BATCH_TIME_MS = 260000;
const t0 = Date.now();
let count = 0;

while (Date.now() - t0 < BATCH_TIME_MS) {
  const v5First = state.gameIdx % 2 === 0;
  const seats: { label: string; bot: Bot }[] = v5First
    ? [{ label: "jane-v5", bot: janeV5Bot }, { label: "jane-v3", bot: janeV3Bot }]
    : [{ label: "jane-v3", bot: janeV3Bot }, { label: "jane-v5", bot: janeV5Bot }];
  const r = simulateGame({ seed: `mc-expand-${state.gameIdx}`, seats, maxTurns: 5000, maxSteps: 500000 });
  const winner = r.standings.find((s) => !s.bankrupt)?.label ?? "?";
  if (winner === "jane-v5") state.wins++;
  else if (winner === "jane-v3") state.losses++;
  state.gameIdx++;
  count++;

  if (count % 5 === 0) {
    const improve = sprt(state.wins, state.losses, { elo0: 0, elo1: MARGIN, alpha: ALPHA, beta: BETA });
    const regress = sprt(state.wins, state.losses, { elo0: 0, elo1: -MARGIN, alpha: ALPHA, beta: BETA });
    console.log(`[${state.wins+state.losses}] W=${state.wins} L=${state.losses} | imp LLR=${improve.llr.toFixed(2)}/${upper.toFixed(2)} ${improve.verdict} | reg ${regress.verdict} | ${count} games in ${((Date.now()-t0)/1000).toFixed(0)}s`);
    fs.writeFileSync(STATE_FILE, JSON.stringify(state));
    if (improve.verdict === "accept-h1" || regress.verdict === "accept-h1" || (improve.verdict === "accept-h0" && regress.verdict === "accept-h0")) break;
  }
}

fs.writeFileSync(STATE_FILE, JSON.stringify(state));
const improve = sprt(state.wins, state.losses, { elo0: 0, elo1: MARGIN, alpha: ALPHA, beta: BETA });
const regress = sprt(state.wins, state.losses, { elo0: 0, elo1: -MARGIN, alpha: ALPHA, beta: BETA });
console.log(`\nThis batch: +${state.wins - startW}W +${state.losses - startL}L (${count} games)`);
console.log(`Cumulative: W=${state.wins} L=${state.losses} (${(state.wins/(state.wins+state.losses)*100).toFixed(1)}%)`);
console.log(`SPRT improvement: ${improve.verdict} (LLR ${improve.llr.toFixed(2)}/${improve.upper.toFixed(2)})`);
console.log(`SPRT regression:  ${regress.verdict} (LLR ${regress.llr.toFixed(2)}/${regress.lower.toFixed(2)})`);
