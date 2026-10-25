"use client";

import { useEffect, useState } from "react";
import { FEATURE_GROUPS, FEATURES, liveFeatures, type FeatureId } from "../../../features";
import { FRAME_SPANS } from "../../../art/frame";
import { useFeature } from "../feature-renderer";
import type { DebugContext, DebugSection } from "./section";

/*
 * Every feature's switch, by group, and below them what the frame costs the
 * GPU: everything drawn (the shadows, the scene and the post pipeline) and
 * everything computed. A feature's own cost is what the frame saves when it
 * is switched off. The frame is timed only while this section is open.
 */

function ms(value: number | null): string {
  return value === null ? "–" : value.toFixed(2);
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

function FeatureSwitch({ id, name, description }: { id: FeatureId; name: string; description: string }) {
  const on = useFeature(id);
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
              <FeatureSwitch key={f.id} id={f.id} name={f.name} description={f.description} />
            ))}
          </div>
        );
      })}
      <div className="flex flex-col gap-0.5 border-t pt-1 text-xs tabular-nums" style={{ borderColor: "currentColor" }}>
        {costs.available ? (
          <>
            <span className="flex justify-between">
              <span>Drawn</span>
              <span>{ms(costs.ms(FRAME_SPANS.render))} ms</span>
            </span>
            <span className="flex justify-between">
              <span>Computed</span>
              <span>{ms(costs.ms(FRAME_SPANS.compute))} ms</span>
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
