"use client";

import { useState } from "react";
import { Check, Trash2, X } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { regionCentre, regionName, regionOf, type Point, type Region } from "../compass";
import { colorAt } from "../color";
import { MODELS, SINCE, TOOLS, USES, choiceLabel, type Background } from "../background";
import { NAME_MAX, type SharedResult } from "../results";
import { STAKES, type Stakes } from "../quiz";
import { StakesMarker } from "./plane";

function Panel({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <section
      aria-live="polite"
      className="flex flex-col gap-5 rounded-lg border-2 bg-surface-secondary p-5 lg:w-96 lg:shrink-0 lg:overflow-y-auto"
      style={{ borderColor: `color-mix(in oklab, ${color} 50%, transparent)` }}
    >
      {children}
    </section>
  );
}

function RegionHeading({ region, as: Heading = "h2" }: { region: Region; as?: "h2" | "h3" }) {
  return (
    <div>
      <Heading className={`${Heading === "h2" ? "text-2xl" : "text-xl"} font-bold`} style={{ color: colorAt(regionCentre(region)) }}>
        {regionName(region)}
      </Heading>
      <p className="text-text-secondary">“{region.nickname}”</p>
    </div>
  );
}

export function RegionDetail({ region }: { region: Region }) {
  return (
    <Panel color={colorAt(regionCentre(region))}>
      <RegionHeading region={region} />
      <p className="text-text-secondary">{region.description}</p>
      <Practices title="Would do" items={region.wouldDo} icon={<Check size={18} className="shrink-0 text-brand-green" />} />
      <Practices title="Wouldn't do" items={region.wouldntDo} icon={<X size={18} className="shrink-0 text-brand-pink" />} />
    </Panel>
  );
}

function Practices({ title, items, icon }: { title: string; items: string[]; icon: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold tracking-widest text-text-muted uppercase">{title}</h3>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item} className="flex gap-2.5">
            {icon}
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const MONTH = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });

export function ResultDetail({
  result,
  mine,
  onOpenRegion,
  onRemove,
}: {
  result: SharedResult;
  mine: boolean;
  onOpenRegion: (region: Region) => void;
  onRemove: () => Promise<void>;
}) {
  const region = regionOf(result);
  return (
    <Panel color={colorAt(result)}>
      <div>
        <h2 className="text-2xl font-bold">{result.name}</h2>
        <p className="text-text-secondary">{MONTH.format(new Date(result.takenAt))}</p>
      </div>
      <Placement point={result} region={region} onOpenRegion={onOpenRegion} />
      <ByStakes points={result.byStakes} onOpenRegion={onOpenRegion} />
      <BackgroundAnswers background={result.background} />
      {mine && <RemoveButton onRemove={onRemove} />}
    </Panel>
  );
}

function RemoveButton({ onRemove }: { onRemove: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="ghost"
      className="self-start"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void onRemove().finally(() => setBusy(false));
      }}
    >
      <Trash2 size={16} className="mr-2" /> Take this point off the map
    </Button>
  );
}

/** Where a point sits: its region, and how far along each axis it is. */
function Placement({ point, region, onOpenRegion }: { point: Point; region: Region; onOpenRegion: (region: Region) => void }) {
  return (
    <div className="space-y-3">
      <button type="button" onClick={() => onOpenRegion(region)} className="text-left hover:underline">
        <RegionHeading region={region} as="h3" />
      </button>
      <AxisBar label="Scope" value={point.scope} />
      <AxisBar label="Ownership" value={point.ownership} />
    </div>
  );
}

const STAKES_LABEL: Record<Stakes, string> = { low: "Low stakes", mid: "Mid stakes", high: "High stakes" };

/** Where the person lands on each tier's scenes alone: the line on the map,
 *  spelled out. */
function ByStakes({ points, onOpenRegion }: { points: Record<Stakes, Point>; onOpenRegion: (region: Region) => void }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold tracking-widest text-text-muted uppercase">By stakes</h3>
      <ul className="space-y-1.5">
        {STAKES.map((stakes) => {
          const region = regionOf(points[stakes]);
          return (
            <li key={stakes} className="flex items-center gap-2.5 text-sm">
              <span className="flex w-4 justify-center">
                <StakesMarker stakes={stakes} point={points[stakes]} />
              </span>
              <span className="w-24 text-text-secondary">{STAKES_LABEL[stakes]}</span>
              <button
                type="button"
                onClick={() => onOpenRegion(region)}
                className="font-bold hover:underline"
                style={{ color: colorAt(regionCentre(region)) }}
              >
                {regionName(region)}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function AxisBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-20 text-text-secondary">{label}</span>
      <div
        className="h-2 flex-1 overflow-hidden rounded-full bg-surface-tertiary"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
      >
        <div className="h-full rounded-full bg-text-secondary" style={{ width: `${value * 100}%` }} />
      </div>
      <span className="w-8 text-right font-mono text-text-secondary">{Math.round(value * 100)}</span>
    </div>
  );
}

function BackgroundAnswers({ background }: { background: Background }) {
  const rows = [
    { title: "Using AI for", labels: background.since === undefined ? [] : [choiceLabel(SINCE, background.since)] },
    { title: "Uses it for", labels: (background.uses ?? []).map((id) => choiceLabel(USES, id)) },
    { title: "Tools", labels: (background.tools ?? []).map((id) => choiceLabel(TOOLS, id)) },
    { title: "Models", labels: (background.models ?? []).map((id) => choiceLabel(MODELS, id)) },
  ].filter((row) => row.labels.length > 0);
  if (rows.length === 0) return null;
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.title} className="space-y-1.5">
          <h3 className="text-xs font-bold tracking-widest text-text-muted uppercase">{row.title}</h3>
          <div className="flex flex-wrap gap-1.5">
            {row.labels.map((label) => (
              <span key={label} className="rounded-full bg-surface-tertiary px-2.5 py-0.5 text-sm text-text-secondary">
                {label}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** A finished quiz, seen only by whoever took it until they choose to share. */
export function DraftPanel({
  point,
  byStakes,
  background,
  name,
  onOpenRegion,
  onShare,
  onDiscard,
}: {
  point: Point;
  byStakes: Record<Stakes, Point>;
  background: Background;
  name: string;
  onOpenRegion: (region: Region) => void;
  onShare: (name: string) => Promise<void>;
  onDiscard: () => void;
}) {
  const region = regionOf(point);
  const [draftName, setDraftName] = useState(name);
  const [busy, setBusy] = useState(false);
  const trimmed = draftName.trim();
  return (
    <Panel color={colorAt(point)}>
      <h2 className="text-2xl font-bold">Your result</h2>
      <Placement point={point} region={region} onOpenRegion={onOpenRegion} />
      <p className="text-text-secondary">{region.description}</p>
      <ByStakes points={byStakes} onOpenRegion={onOpenRegion} />
      <BackgroundAnswers background={background} />

      <div className="space-y-3 rounded-md border border-border-default p-4">
        <h3 className="font-bold">Add your point to the shared map?</h3>
        <p className="text-sm text-text-secondary">
          Nothing has been sent anywhere. If you share, everyone who opens this page sees your name, the month, your point and the
          answers about you above. You can take it off again from this browser.
        </p>
        <label className="block space-y-1 text-sm">
          <span className="text-text-secondary">Name to show</span>
          <input
            type="text"
            value={draftName}
            maxLength={NAME_MAX}
            onChange={(event) => setDraftName(event.target.value)}
            className="w-full rounded-md border border-border-default bg-surface-primary px-2 py-1.5 text-text-primary focus:border-brand-blue focus:outline-none"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy || trimmed.length === 0}
            onClick={() => {
              setBusy(true);
              void onShare(trimmed).finally(() => setBusy(false));
            }}
          >
            Share my point
          </Button>
          <Button variant="ghost" onClick={onDiscard}>
            Keep it to myself
          </Button>
        </div>
      </div>
    </Panel>
  );
}
