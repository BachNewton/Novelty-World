"use client";

import { useState } from "react";
import {
  ArrowRight,
  ArrowUp,
  Check,
  Compass,
  X,
} from "lucide-react";
import {
  LEVELS,
  OWNERSHIP,
  SCOPE,
  levelCentre,
  regionAt,
  regionCentre,
  regionName,
  sameRegion,
  type Level,
  type Point,
  type Region,
} from "../compass";

/** Rows run from high ownership at the top to low at the bottom. */
const ROWS: Level[] = [2, 1, 0];

/** Minor grid lines per axis: five to each region. */
const GRID_DIVISIONS = 15;

/** Every place on the plane blends the four corners' colours by its position,
 *  so no corner reads as the better one. */
function colorAt({ scope, ownership }: Point): string {
  const x = Math.round(scope * 100);
  const top = `color-mix(in oklab, var(--color-compass-delegate-steered) ${x}%, var(--color-compass-ask-steered))`;
  const bottom = `color-mix(in oklab, var(--color-compass-delegate-accepted) ${x}%, var(--color-compass-ask-accepted))`;
  return `color-mix(in oklab, ${top} ${Math.round(ownership * 100)}%, ${bottom})`;
}

/** A two-axis map of how people build software with AI: how much of the work
 *  they hand over, and how much of the result they own. */
export function AiCompass() {
  const [region, setRegion] = useState<Region>(() => regionAt(1, 1));

  return (
    <div className="flex min-h-dvh w-full flex-col gap-4 px-4 py-4 lg:h-dvh">
      <header className="flex items-center gap-3">
        <div className="rounded-md bg-surface-elevated p-2 text-brand-blue">
          <Compass size={24} />
        </div>
        <div>
          <h1 className="text-2xl leading-tight font-bold">AI Compass</h1>
          <p className="text-sm text-text-secondary">Map how you build software with AI: how much you hand over, and how much you own.</p>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-4 lg:min-h-0 lg:flex-row">
        <section
          aria-label="The compass"
          className="grid aspect-square grid-cols-[auto_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto] gap-2 lg:aspect-auto lg:min-h-0 lg:flex-1"
        >
          <OwnershipAxis />
          <Plane region={region} onSelect={setRegion} />
          <div />
          <ScopeAxis />
        </section>

        <RegionDetail region={region} />
      </main>
    </div>
  );
}

function Plane({ region, onSelect }: { region: Region; onSelect: (region: Region) => void }) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-border-default">
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to right, var(--color-compass-ask-accepted), var(--color-compass-delegate-accepted))",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(to right, var(--color-compass-ask-steered), var(--color-compass-delegate-steered))",
          maskImage: "linear-gradient(to bottom, black, transparent)",
        }}
      />
      <div className="absolute inset-0 bg-surface-primary/85" />
      <GridLines />

      <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
        {ROWS.flatMap((ownership) =>
          LEVELS.map((scope) => {
            const cell = regionAt(scope, ownership);
            const selected = sameRegion(cell, region);
            return (
              <button
                key={`${scope}-${ownership}`}
                type="button"
                aria-pressed={selected}
                onClick={() => onSelect(cell)}
                className={`flex flex-col items-center justify-center gap-1 p-2 text-center transition-colors ${
                  selected ? "bg-text-primary/8" : "hover:bg-text-primary/4"
                }`}
              >
                <span className="text-xs leading-tight font-bold sm:text-lg 2xl:text-2xl" style={{ color: colorAt(regionCentre(cell)) }}>
                  {regionName(cell)}
                </span>
                <span className="hidden text-sm text-text-secondary sm:block 2xl:text-base">“{cell.nickname}”</span>
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}

function GridLines() {
  const lines = Array.from({ length: GRID_DIVISIONS - 1 }, (_, i) => i + 1);
  return (
    <svg
      className="pointer-events-none absolute inset-0 size-full"
      viewBox={`0 0 ${GRID_DIVISIONS} ${GRID_DIVISIONS}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      {lines.map((i) => {
        const boundary = i % (GRID_DIVISIONS / 3) === 0;
        return (
          <g key={i} className={boundary ? "stroke-text-muted" : "stroke-border-default"} strokeWidth={boundary ? 1.5 : 1}>
            <line x1={i} y1={0} x2={i} y2={GRID_DIVISIONS} vectorEffect="non-scaling-stroke" />
            <line x1={0} y1={i} x2={GRID_DIVISIONS} y2={i} vectorEffect="non-scaling-stroke" />
          </g>
        );
      })}
    </svg>
  );
}

function OwnershipAxis() {
  return (
    <div className="flex">
      <div className="flex flex-col items-center justify-center gap-1 text-text-muted">
        <ArrowUp size={14} />
        <span className="rotate-180 text-xs font-bold tracking-widest uppercase [writing-mode:vertical-rl]">Ownership</span>
      </div>
      <div className="grid grid-rows-3">
        {ROWS.map((level) => (
          <div
            key={level}
            className="flex items-center justify-center px-1"
            style={{ color: colorAt({ scope: 0.5, ownership: levelCentre(level) }) }}
            title={OWNERSHIP[level].meaning}
          >
            <span className="rotate-180 text-xs font-bold [writing-mode:vertical-rl] sm:text-sm">{OWNERSHIP[level].name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScopeAxis() {
  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-3">
        {LEVELS.map((level) => (
          <div
            key={level}
            className="text-center text-xs font-bold sm:text-sm"
            style={{ color: colorAt({ scope: levelCentre(level), ownership: 0.5 }) }}
            title={SCOPE[level].rungs.join(", ")}
          >
            {SCOPE[level].name}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center gap-1 text-xs font-bold tracking-widest text-text-muted uppercase">
        Scope <ArrowRight size={14} />
      </div>
    </div>
  );
}

function RegionDetail({ region }: { region: Region }) {
  const color = colorAt(regionCentre(region));
  return (
    <section
      aria-live="polite"
      className="flex flex-col gap-5 rounded-lg border-2 bg-surface-secondary p-5 lg:w-96 lg:shrink-0 lg:overflow-y-auto"
      style={{ borderColor: `color-mix(in oklab, ${color} 50%, transparent)` }}
    >
      <div>
        <h2 className="text-2xl font-bold" style={{ color }}>
          {regionName(region)}
        </h2>
        <p className="text-text-secondary">“{region.nickname}”</p>
      </div>

      <p className="text-text-secondary">{region.description}</p>

      <Practices title="Would do" items={region.wouldDo} icon={<Check size={18} className="shrink-0 text-brand-green" />} />
      <Practices title="Wouldn't do" items={region.wouldntDo} icon={<X size={18} className="shrink-0 text-brand-pink" />} />
    </section>
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
