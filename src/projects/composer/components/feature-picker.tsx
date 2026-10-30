"use client";

import { useState } from "react";
import { toneVar, type Feature, type Section } from "../analysis";
import { cn } from "@/shared/lib/utils";

// The themes and patterns of the section playing, to pick one and see it light
// up everywhere. A theme is a dot, a motif a diamond, a pattern a bar.

const SHAPE: Record<Feature["kind"], string> = { theme: "rounded-full", motif: "rotate-45", pattern: "h-1 rounded-none" };

function inSection(feature: Feature, section: Section | undefined, barLength: number): boolean {
  if (section === undefined) return true;
  const [from, to] = [(section.bars[0] - 1) * barLength, section.bars[1] * barLength];
  return feature.spans.some((span) => span.from < to && span.to > from);
}

interface PickerProps {
  features: readonly Feature[];
  section: Section | undefined;
  barLength: number;
  picked: Feature | null;
  onPick: (feature: Feature | null) => void;
  detail: string;
}

export function FeaturePicker({ features, section, barLength, picked, onPick, detail }: PickerProps) {
  const [all, setAll] = useState(false);
  const here = features.filter((feature) => all || feature === picked || inSection(feature, section, barLength));
  return (
    <div className="shrink-0 border-t border-border-default bg-surface-primary px-1 pt-1 max-md:hidden">
      <div className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none]">
        {features.length > 0 && (
          <button
            type="button"
            aria-pressed={all}
            aria-label="Every theme and pattern in the piece"
            title="Every theme and pattern in the piece"
            onClick={() => setAll(!all)}
            className={cn("shrink-0 rounded-full border px-2 py-0.5 text-xs", all ? "border-text-primary text-text-primary" : "border-border-default text-text-muted")}
          >
            {`${String(here.length)}/${String(features.length)}`}
          </button>
        )}
        {here.map((feature) => (
          <button
            key={feature.id}
            type="button"
            aria-pressed={feature === picked}
            title={`${feature.name}: ${feature.about}`}
            onClick={() => onPick(feature === picked ? null : feature)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs whitespace-nowrap transition-colors",
              feature === picked ? "border-text-primary bg-surface-elevated text-text-primary" : "border-border-default text-text-secondary hover:border-border-hover",
            )}
          >
            <span className={cn("size-2 shrink-0", SHAPE[feature.kind])} style={{ background: `var(${toneVar(feature.tone)})` }} />
            {feature.name}
          </button>
        ))}
      </div>
      <p aria-live="polite" className="h-8 overflow-hidden pt-0.5 text-[11px] leading-[14px] text-text-secondary">
        {detail}
      </p>
    </div>
  );
}
