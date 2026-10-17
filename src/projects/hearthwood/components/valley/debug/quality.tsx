"use client";

import type { ReactNode } from "react";
import { QUALITY, type PlantReach } from "../../../quality";
import type { DebugSection } from "./section";

/*
 * The quality profile the world is drawn with (`quality.ts`), each knob
 * read-only: how far the land and the plants reach, the pixel ratio and the
 * sun's shadows. Changing a knob means rebuilding what it shaped, so it is
 * changed in the profile, not here.
 */

function metres(value: number): string {
  if (!Number.isFinite(value)) return "∞";
  return value >= 1000 ? `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)} km` : `${String(value)} m`;
}

function reach(r: PlantReach): string {
  const thin = Number.isFinite(r.thinFrom) ? `, ${String(Math.round(r.keep * 100))}% past ${metres(r.thinFrom)}` : "";
  return `${metres(r.near)} · ${metres(r.far)}${thin}`;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="flex justify-between gap-2">
      <span className="opacity-70">{label}</span>
      <span className="text-right tabular-nums">{children}</span>
    </span>
  );
}

function Quality() {
  const q = QUALITY;
  return (
    <div className="flex flex-col gap-0.5 text-xs">
      <Row label="Land reaches">{metres(q.viewDistance)}</Row>
      <Row label="Tile splits within">{q.tileSplit} widths</Row>
      <Row label="Water on levels">0–{q.waterLevels}</Row>
      <Row label="Trees near · far">{reach(q.trees)}</Row>
      <Row label="Shrubs near · far">{reach(q.shrubs)}</Row>
      <Row label="Small near · far">{reach(q.small)}</Row>
      <Row label="Pixel ratio">
        up to {q.maxPixelRatio} (now {typeof window === "undefined" ? "–" : Math.min(window.devicePixelRatio, q.maxPixelRatio)})
      </Row>
      <Row label="Shadow map">
        {q.shadowMap}² over {metres(q.shadowReach)}
      </Row>
      <Row label="Builds a frame">{q.buildsPerFrame}</Row>
    </div>
  );
}

export const QUALITY_SECTION: DebugSection = { id: "quality", title: "Quality", Section: Quality };
