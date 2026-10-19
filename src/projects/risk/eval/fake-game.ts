import { createRng } from "@/shared/lib/seeded-random";
import type { RiskGameResult, RiskGameSpec } from "./runner";

// A stand-in for a Risk game in the harness's tests: a pure function of its seed and
// seating, like a real one, but instant. The stronger bot wins more often, and about
// one game in twenty is capped, so a test sees every kind of outcome.

const STRENGTH: Readonly<Record<string, number>> = { cand: 1.6, base: 1, other: 0.8 };

export function fakeGame(spec: RiskGameSpec): RiskGameResult {
  const rng = createRng(`${spec.seed}|${spec.labels.join(",")}`);
  const n = spec.labels.length;
  const base = { index: spec.index, seed: spec.seed, labels: spec.labels, turns: 30 + Math.floor(rng.next() * 40), decisions: 300 };
  if (rng.next() < 0.05) return { ...base, winner: null, places: spec.labels.map(() => 1) };
  const weights = spec.labels.map((l) => STRENGTH[l]);
  let pick = rng.next() * weights.reduce((s, w) => s + w, 0);
  const winner = weights.findIndex((w) => (pick -= w) < 0);
  const rest = Array.from({ length: n - 1 }, (_, k) => k + 2).sort(() => rng.next() - 0.5);
  return { ...base, winner, places: spec.labels.map((_, seat) => (seat === winner ? 1 : (rest.pop() ?? n))) };
}
