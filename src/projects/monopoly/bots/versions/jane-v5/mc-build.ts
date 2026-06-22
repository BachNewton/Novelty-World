// ===========================================================================
// MC Building enumeration: enumerate the FULL finite decision space for the
// "managing" phase, simulate each candidate, pick the best by MC rollouts.
//
// The building space is finite:
//   - For each monopoly group owned: each lot has a development level 0-5
//   - Even-build rule: within a group, levels can differ by at most 1
//     (e.g., 1,1,2 is valid but 1,1,3 is not)
//   - Each lot can be mortgaged or unmortgaged
//   - Constrained by: cash ≥ build cost + unmortgage cost
//
// We enumerate all valid (build, mortgage) combos, filter by affordability,
// and run MC rollouts on each.
// ===========================================================================

import { apply, autoStep, netWorth } from "../../../engine";
import { driveOp, type BotResolver } from "../../../pacing";
import { janeV3Bot } from "../jane-v3";
import { planBuild } from "../jane-v3/valuation";
import type { BotDecision } from "../../decision";
import type { GameState, Intent, PropertyColor } from "../../../types";
import {
  groupPositions,
  developmentLevel,
} from "../../../development";
import { hasMonopoly } from "../../../logic";

const ROLLOUTS_PER_ACTION = 10;
const MAX_ROLLOUT_TURNS = 80;
const MAX_BUILD_CANDIDATES = 40;

/** Color groups in priority order (most valuable first). Matches jane-v3's
 *  internal COLORS_BY_WEIGHT which isn't exported. */
const COLOR_PRIORITY: readonly PropertyColor[] = [
  "dark-blue", "brown", "green", "red", "yellow",
  "orange", "light-blue", "pink",
];

/** One candidate build/mortgage configuration for MC evaluation. */
interface BuildCandidate {
  intent: Intent;
  label: string;
}

/** Generate all valid development-level combinations for a single monopoly
 *  group, respecting the even-build rule (max-min ≤ 1).
 *
 *  For a 3-lot group, the valid combos are:
 *    - All same level: (0,0,0), (1,1,1), ..., (5,5,5) = 6 combos
 *    - Two at level N, one at N+1: for each N in 0-4, 3 positions = 15 combos
 *    - One at level N, two at N+1: for each N in 0-4, 3 positions = 15 combos
 *  Total: ~36 per group (but many are duplicates or current state)
 *
 *  We represent each combo as per-position target levels. */
function enumerateGroupLevels(
  positions: readonly number[],
  currentLevels: number[],
): number[][] {
  const n = positions.length;
  const results: number[][] = [];

  // For each base level 0-5, generate all valid combos where all lots are
  // at baseLevel or baseLevel+1.
  for (let baseLevel = 0; baseLevel <= 5; baseLevel++) {
    if (baseLevel + 1 > 5 && baseLevel === 5) {
      // Only (5,5,...,5)
      results.push(new Array(n).fill(5));
      continue;
    }

    // Count how many lots can be at baseLevel+1 (the rest at baseLevel)
    // We need to enumerate all subsets of lots that get the +1
    // For n lots, that's 2^n subsets (each lot independently gets +1 or not)
    const maxUp = baseLevel < 5 ? 1 : 0;

    // Generate all subsets of {0..n-1} — each lot independently is at
    // baseLevel or baseLevel+1
    const total = 1 << n; // 2^n
    for (let mask = 0; mask < total; mask++) {
      const combo = new Array(n);
      let valid = true;
      for (let i = 0; i < n; i++) {
        const up = (mask >> i) & 1;
        combo[i] = baseLevel + up * maxUp;
        if (combo[i] > 5) { valid = false; break; }
      }
      if (valid) {
        // Check this isn't a duplicate (same combo at a different baseLevel)
        const key = combo.join(",");
        if (!results.some(r => r.join(",") === key)) {
          results.push(combo);
        }
      }
    }
  }

  // Filter out combos identical to current state
  const currentKey = currentLevels.join(",");
  return results.filter(r => r.join(",") !== currentKey);
}

/** Enumerate all valid building configurations for the player. */
function enumerateBuildCandidates(
  state: GameState,
  pid: string,
): BuildCandidate[] {
  const player = state.players.find((p) => p.id === pid);
  if (!player) return [];

  // Find all monopoly groups the player owns
  const myMonopolies: { color: PropertyColor; positions: readonly number[] }[] = [];
  for (const color of COLOR_PRIORITY) {
    if (hasMonopoly(state, color, pid)) {
      myMonopolies.push({ color, positions: groupPositions(color) });
    }
  }

  if (myMonopolies.length === 0) return [];

  const candidates: BuildCandidate[] = [];

  // Option 0: Build nothing (baseline)
  candidates.push({
    intent: { kind: "manage", playerId: pid, build: {}, mortgage: {} },
    label: "noop",
  });

  // Option 1: jane-v3's recommended plan
  const v3Plan = planBuild(state, pid);
  if (v3Plan && (Object.keys(v3Plan.build).length > 0 || Object.keys(v3Plan.mortgage).length > 0)) {
    candidates.push({
      intent: { kind: "manage", playerId: pid, build: v3Plan.build, mortgage: v3Plan.mortgage },
      label: "v3plan",
    });
  }

  // Options 2+: For each monopoly, enumerate all valid level combos
  for (const mono of myMonopolies) {
    const currentLevels = mono.positions.map((pos) => developmentLevel(state, pos));
    const combos = enumerateGroupLevels(mono.positions, currentLevels);

    for (const combo of combos) {
      const build: Record<number, number> = {};
      for (let i = 0; i < mono.positions.length; i++) {
        build[mono.positions[i]] = combo[i];
      }

      // If any lots are mortgaged, unmortgage them to build
      const mortgage: Record<number, boolean> = {};
      for (const pos of mono.positions) {
        if (state.mortgaged[pos] && combo[mono.positions.indexOf(pos)] > 0) {
          mortgage[pos] = false;
        }
      }

      candidates.push({
        intent: { kind: "manage", playerId: pid, build, mortgage },
        label: `${mono.color}→[${combo.join(",")}]`,
      });

      if (candidates.length >= MAX_BUILD_CANDIDATES) break;
    }
    if (candidates.length >= MAX_BUILD_CANDIDATES) break;
  }

  return candidates;
}

// -----------------------------------------------------------------------
// Rollout (shared logic)
// -----------------------------------------------------------------------

function rollout(state: GameState, myId: string, maxTurns: number): number {
  let s = state;
  const botFor: BotResolver = () => janeV3Bot;
  const startTurn = s.turns[s.turns.length - 1].turn;
  let steps = 0;
  const maxSteps = maxTurns * 10;

  while (s.status === "active" && steps < maxSteps) {
    const turnNo = s.turns[s.turns.length - 1].turn;
    if (turnNo - startTurn > maxTurns) break;

    const op = driveOp(s, true, null, botFor);
    if (op === null) break;

    if (op.kind === "step") {
      const result = autoStep(s);
      if (result.state === s) break;
      s = result.state;
    } else {
      const result = apply(s, op.intent);
      if (!result.ok) break;
      s = result.state;
    }
    steps++;
  }

  if (s.status === "finished") {
    for (let i = s.turns.length - 1; i >= 0; i--) {
      const events = s.turns[i].events;
      for (let j = events.length - 1; j >= 0; j--) {
        const e = events[j];
        if (e.kind === "winner" && "winnerId" in e) {
          return e.winnerId === myId ? 1.0 : 0.0;
        }
      }
    }
    return 0.5;
  }

  const me = s.players.find((p) => p.id === myId);
  if (me?.bankrupt) return 0.0;

  const myWorth = netWorth(s, myId);
  let maxOpp = -Infinity;
  let oppAlive = false;
  for (const p of s.players) {
    if (p.id === myId || p.bankrupt) continue;
    oppAlive = true;
    const w = netWorth(s, p.id);
    if (w > maxOpp) maxOpp = w;
  }
  if (!oppAlive) return 1.0;
  if (myWorth > maxOpp * 1.15) return 0.85;
  if (myWorth > maxOpp) return 0.65;
  if (myWorth < maxOpp * 0.85) return 0.15;
  return 0.4;
}

/** Monte Carlo build decision: enumerate all valid building configurations,
 *  simulate each via rollouts, pick the one with the highest expected outcome. */
export function monteCarloBuild(
  state: GameState,
  pid: string,
): BotDecision | null {
  if (state.turn.phase !== "managing") return null;
  if (state.turn.managerId !== pid) return null;

  const candidates = enumerateBuildCandidates(state, pid);
  if (candidates.length <= 1) return null;

  let best = candidates[0];
  let bestScore = -1;

  for (const candidate of candidates) {
    let total = 0;
    let valid = 0;

    for (let i = 0; i < ROLLOUTS_PER_ACTION; i++) {
      const cloned: GameState = structuredClone(state);
      cloned.rngState = (cloned.rngState ^ ((i + 1) * 0x9e3779b9)) >>> 0;

      const result = apply(cloned, candidate.intent);
      if (!result.ok) continue;

      const score = rollout(result.state, pid, MAX_ROLLOUT_TURNS);
      total += score;
      valid++;
    }

    if (valid === 0) continue;
    const avg = total / valid;

    if (avg > bestScore) {
      bestScore = avg;
      best = candidate;
    }
  }

  // If the best is "noop" (build nothing), fall back to v3
  if (best.label === "noop") {
    return null;
  }

  return {
    intent: best.intent,
    note: `MC build: ${best.label} (${(bestScore * 100).toFixed(0)}% over ${ROLLOUTS_PER_ACTION} rollouts, ${candidates.length} candidates)`,
  };
}
