import { describe, expect, it } from "vitest";
import { riskBot } from "../bots";
import { fromView } from "../bots/rule-v1/board";
import { breakdown } from "../bots/rule-v3/evaluate";
import { V3_PARAMS } from "../bots/rule-v3/params";
import { playGame } from "./runner";
import { v3Forecast, v3Prefs } from "./v3-opponent-model";

// `risk:opponents` scores v3's model as written out beside v4's, so it must be v3's: on every
// position v3 decides in, it gives v3's own breakdown its kill exposure, border loss, common
// threat and share.

describe("v3's opponent model, written out", () => {
  it.each([
    ["v3-model-a", ["rule-v3", "rule-v3", "rule-v3"]],
    ["v3-model-b", ["rule-v3", "greedy", "rule-v2", "gd-stacker", "rule-v3"]],
  ])("is v3's own, over %s", (seed, labels) => {
    let checked = 0;
    playGame({
      seed,
      bots: labels.map(riskBot),
      maxTurns: 200,
      observe: {
        decided: (input) => {
          if (labels[input.seat] !== "rule-v3") return;
          const b = fromView(input.view);
          const alive = [...Array(b.players).keys()].filter((s) => b.alive[s]);
          if (!b.alive[input.seat] || alive.length < 2) return;
          const own = breakdown(b, input.seat, { ...V3_PARAMS, prefs: v3Prefs(b.players, alive.length) });
          const f = v3Forecast(b, input.seat, alive);
          expect(1 - f.spared[input.seat]).toBe(own.killExposure);
          expect(f.borderLoss).toBe(own.borderLoss);
          expect(f.commonThreat).toBe(own.commonThreat);
          expect(f.power[input.seat] / f.total).toBe(own.share);
          checked++;
        },
      },
    });
    expect(checked).toBeGreaterThan(50);
  });
});
