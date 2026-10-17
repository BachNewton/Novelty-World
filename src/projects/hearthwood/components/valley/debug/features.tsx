"use client";

import { useEffect, useState } from "react";
import { FEATURE_GROUPS, FEATURES, liveFeatures, type FeatureId } from "../../../features";
import { FEATURE_ART } from "../../../art/features";
import { SCENE_SPANS, type FrameCosts } from "../../../art/passes";
import { useFeature } from "../feature-renderer";
import type { DebugContext, DebugSection } from "./section";

/*
 * Every feature's switch, by group, with what it costs the GPU beside it: a
 * feature's own passes, timed one by one. A feature that is only GLSL in the
 * shared materials costs inside the scene's draw, so its saving shows there
 * when it is switched off. The frame is timed only while this section is
 * open.
 */

const PASSES_OF = new Map(FEATURE_ART.map((a) => [a.feature, (a.passes ?? []).map((p) => p.id)]));

function ms(value: number | null): string {
  return value === null ? "–" : value.toFixed(2);
}

function sum(costs: FrameCosts, spans: readonly string[]): number | null {
  const timed = spans.map((s) => costs.ms(s)).filter((v) => v !== null);
  return timed.length === 0 ? null : timed.reduce((a, b) => a + b, 0);
}

/** Re-renders once a frame while mounted, to show the costs as they move. */
function useEveryFrame(): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    let raf = requestAnimationFrame(function tick() {
      setTick((n) => n + 1);
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, []);
}

function FeatureSwitch({ id, name, description, costs }: { id: FeatureId; name: string; description: string; costs: FrameCosts }) {
  const on = useFeature(id);
  const passes = PASSES_OF.get(id) ?? [];
  return (
    <label className="flex items-center gap-2" title={description}>
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => {
          liveFeatures().set(id, e.target.checked);
        }}
      />
      <span className="grow">{name}</span>
      <span className="tabular-nums opacity-80">{passes.length === 0 ? "scene" : on ? ms(sum(costs, passes)) : "off"}</span>
    </label>
  );
}

function Features({ context: { costs } }: { context: DebugContext }) {
  useEffect(() => costs.watch(), [costs]);
  useEveryFrame();

  return (
    <>
      {FEATURE_GROUPS.map((group) => {
        const members = FEATURES.filter((f) => f.group === group.id);
        if (members.length === 0) return null;
        return (
          <div key={group.id} className="flex flex-col gap-1">
            <span className="text-xs uppercase opacity-70">{group.name}</span>
            {members.map((f) => (
              <FeatureSwitch key={f.id} id={f.id} name={f.name} description={f.description} costs={costs} />
            ))}
          </div>
        );
      })}
      <div className="flex flex-col gap-0.5 border-t pt-1 text-xs tabular-nums" style={{ borderColor: "currentColor" }}>
        {costs.available ? (
          <>
            <span className="flex justify-between">
              <span>Scene draw</span>
              <span>{ms(sum(costs, [SCENE_SPANS.scene, SCENE_SPANS.late]))} ms</span>
            </span>
            <span className="flex justify-between">
              <span>To the screen</span>
              <span>{ms(costs.ms(SCENE_SPANS.output))} ms</span>
            </span>
            <span className="flex justify-between font-bold">
              <span>GPU in all</span>
              <span>{costs.total().toFixed(2)} ms</span>
            </span>
          </>
        ) : (
          <span>GPU timing is not available in this browser</span>
        )}
      </div>
    </>
  );
}

export const FEATURES_SECTION: DebugSection = { id: "features", title: "Features", Section: Features };
