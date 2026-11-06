"use client";

import { ArrowRight, ArrowUp } from "lucide-react";
import { LEVELS, OWNERSHIP, SCOPE, levelCentre, regionAt, regionCentre, regionName, type Level, type Point, type Region } from "../compass";
import { colorAt } from "../color";
import type { SharedResult } from "../results";
import { STAKES, type Stakes } from "../quiz";

/** Rows run from high ownership at the top to low at the bottom. */
const ROWS: Level[] = [2, 1, 0];

/** Minor grid lines per axis: five to each region. */
const GRID_DIVISIONS = 15;

export type Selection =
  | { kind: "region"; region: Region }
  | { kind: "result"; result: SharedResult }
  | { kind: "draft" };

interface CompassProps {
  results: SharedResult[];
  /** A finished quiz not shared (yet), shown only to whoever took it. */
  draft: Point | null;
  /** The selected person's points on low, mid and high stakes scenes alone. */
  stakes: Record<Stakes, Point> | null;
  mine: string | null;
  selection: Selection;
  onSelect: (selection: Selection) => void;
}

/** The plane with its two axes, and everyone placed on it. */
export function CompassMap(props: CompassProps) {
  return (
    <section
      aria-label="The compass"
      className="grid aspect-square grid-cols-[auto_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto] gap-2 lg:aspect-auto lg:min-h-0 lg:flex-1"
    >
      <OwnershipAxis />
      <Plane {...props} />
      <div />
      <ScopeAxis />
    </section>
  );
}

function Plane({ results, draft, stakes, mine, selection, onSelect }: CompassProps) {
  const selectedRegion = selection.kind === "region" ? selection.region : null;
  const selectedPerson = selection.kind === "result" ? selection.result.person : null;
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
            const region = regionAt(scope, ownership);
            const selected = region === selectedRegion;
            return (
              <button
                key={`${scope}-${ownership}`}
                type="button"
                aria-pressed={selected}
                onClick={() => onSelect({ kind: "region", region })}
                className={`flex flex-col items-center justify-start gap-1 p-2 text-center transition-colors sm:pt-4 ${
                  selected ? "bg-text-primary/8" : "hover:bg-text-primary/4"
                }`}
              >
                <span className="text-xs leading-tight font-bold sm:text-lg 2xl:text-2xl" style={{ color: colorAt(regionCentre(region)) }}>
                  {regionName(region)}
                </span>
                <span className="hidden text-sm text-text-secondary sm:block 2xl:text-base">“{region.nickname}”</span>
              </button>
            );
          }),
        )}
      </div>

      <Trails results={results} highlighted={selectedPerson} />
      {stakes && <StakesLine points={stakes} />}
      {results.map((result) => (
        <PersonPoint
          key={result.id}
          point={result}
          label={result.name}
          selected={selection.kind === "result" && selection.result.id === result.id}
          mine={result.person === mine}
          onSelect={() => onSelect({ kind: "result", result })}
        />
      ))}
      {draft && (
        <PersonPoint point={draft} label="You" selected={selection.kind === "draft"} mine draft onSelect={() => onSelect({ kind: "draft" })} />
      )}
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

/** One person's results joined oldest to newest, so their path shows how
 *  they have moved. */
function Trails({ results, highlighted }: { results: SharedResult[]; highlighted: string | null }) {
  const byPerson = Map.groupBy(results, (result) => result.person);
  return (
    <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden>
      {[...byPerson].map(([person, trail]) =>
        trail.length < 2 ? null : (
          <polyline
            key={person}
            points={trail.map((r) => `${r.scope},${1 - r.ownership}`).join(" ")}
            fill="none"
            className={person === highlighted ? "stroke-text-primary" : "stroke-text-muted"}
            strokeWidth={person === highlighted ? 2 : 1}
            strokeDasharray={person === highlighted ? undefined : "4 3"}
            vectorEffect="non-scaling-stroke"
          />
        ),
      )}
    </svg>
  );
}

/** Marker sizes grow with the stakes, so the line reads from low to high
 *  without a legend. */
export const STAKES_MARKER: Record<Stakes, string> = { low: "size-2", mid: "size-3", high: "size-4" };

export function StakesMarker({ stakes, point }: { stakes: Stakes; point: Point }) {
  return (
    <span
      className={`block rounded-sm border-2 border-text-primary ${STAKES_MARKER[stakes]}`}
      style={{ backgroundColor: colorAt(point) }}
    />
  );
}

function StakesLine({ points }: { points: Record<Stakes, Point> }) {
  return (
    <>
      <svg className="pointer-events-none absolute inset-0 z-20 size-full" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden>
        <polyline
          points={STAKES.map((s) => `${points[s].scope},${1 - points[s].ownership}`).join(" ")}
          fill="none"
          className="stroke-text-primary"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {STAKES.map((s) => (
        <span
          key={s}
          title={`${s} stakes`}
          className="pointer-events-none absolute z-20 -translate-x-1/2 translate-y-1/2"
          style={{ left: `${points[s].scope * 100}%`, bottom: `${points[s].ownership * 100}%` }}
        >
          <StakesMarker stakes={s} point={points[s]} />
        </span>
      ))}
    </>
  );
}

function PersonPoint({
  point,
  label,
  selected,
  mine,
  draft = false,
  onSelect,
}: {
  point: Point;
  label: string;
  selected: boolean;
  mine: boolean;
  draft?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={label}
      title={label}
      onClick={onSelect}
      className={`group absolute flex -translate-x-1/2 translate-y-1/2 items-center justify-center ${selected ? "z-30" : "z-20"}`}
      style={{ left: `${point.scope * 100}%`, bottom: `${point.ownership * 100}%` }}
    >
      {draft && <span className="absolute size-7 animate-ping rounded-full border-2 border-text-primary" />}
      <span
        className={`block rounded-full border-2 transition-transform group-hover:scale-125 ${
          mine ? "border-text-primary" : "border-surface-primary"
        } ${selected ? "size-6 ring-2 ring-text-primary ring-offset-2 ring-offset-surface-primary" : "size-4"}`}
        style={{ backgroundColor: colorAt(point) }}
      />
      {selected && (
        <span className="absolute left-full ml-2 rounded-sm bg-surface-primary/85 px-1.5 py-0.5 text-sm font-bold whitespace-nowrap">
          {label}
        </span>
      )}
    </button>
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
