"use client";

import { CarFront, Medal as MedalIcon, Road } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { COOP_COURSES } from "../coop-courses";
import type { DesignedCourse } from "../coop-courses/design";
import { pieceShape } from "../logic";
import { formatTime, MEDALS } from "../medals";
import { toTicks } from "../ticks";
import type { TetrominoKind } from "../types";
import { MEDAL_NAMES, MEDAL_TEXT } from "./run-clock";

// Picking a co-op course: every designed course, in the registry's order,
// each with its name, description, its pair of pieces, rows, road and medal
// times, shown as symbols. The local join screen and the online host's
// waiting room pick with it; the online guest sees the host's pick as a
// single card.

// Each player's piece in its frog's skin: Sprout's first.
const PLAYER_FILL = ["fill-(--color-frogmino-frog-p1-skin)", "fill-(--color-frogmino-frog-p2-skin)"] as const;
const PLAYER_NAMES = ["Sprout", "Splash"] as const;

// A glyph's cell, in CSS pixels, so every piece is drawn to one scale.
const GLYPH_CELL = 6;

// A piece as the picker draws it: its first rotation, one square a cell.
function PieceGlyph({ kind, player }: { kind: TetrominoKind; player: number }) {
  const cells = pieceShape(kind, 0);
  const cols = Math.max(...cells.map((cell) => cell.col)) + 1;
  const rows = Math.max(...cells.map((cell) => cell.row)) + 1;
  const name = `${PLAYER_NAMES[player]}: ${kind}`;
  return (
    <svg
      role="img"
      aria-label={name}
      viewBox={`0 0 ${String(cols)} ${String(rows)}`}
      width={cols * GLYPH_CELL}
      height={rows * GLYPH_CELL}
      className={PLAYER_FILL[player]}
    >
      <title>{name}</title>
      {cells.map((cell) => (
        <rect key={`${String(cell.col)}-${String(cell.row)}`} x={cell.col + 0.06} y={rows - 1 - cell.row + 0.06} width={0.88} height={0.88} rx={0.15} />
      ))}
    </svg>
  );
}

// A count beside the symbol it counts, named for a screen reader and a tooltip.
function Count({ icon: Icon, count, label }: { icon: typeof CarFront; count: number; label: string }) {
  const name = `${String(count)} ${label}`;
  return (
    <span role="img" aria-label={name} title={name} className="flex items-center gap-1 font-mono tabular-nums">
      <Icon aria-hidden className="h-3.5 w-3.5" />
      {count}
    </span>
  );
}

function MedalTimesLine({ course }: { course: DesignedCourse }) {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-text-secondary">
      {MEDALS.map((medal) => (
        <span key={medal} className="flex items-center gap-1 font-mono tabular-nums">
          <MedalIcon aria-label={MEDAL_NAMES[medal]} className={cn("h-3.5 w-3.5", MEDAL_TEXT[medal])} />
          {formatTime(toTicks(course.medals[medal]), true)}
        </span>
      ))}
    </span>
  );
}

function CourseDetails({ course }: { course: DesignedCourse }) {
  return (
    <span className="flex min-w-0 flex-col gap-1 text-left">
      <span className="flex items-center justify-between gap-2">
        <span data-testid="course-name" className="truncate font-bold text-text-primary">
          {course.name}
        </span>
        <span className="flex shrink-0 items-end gap-1.5">
          {course.kinds.map((kind, player) => (
            <PieceGlyph key={player} kind={kind} player={player} />
          ))}
        </span>
      </span>
      <span className="text-sm text-text-secondary">{course.description}</span>
      <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="flex items-center gap-3 text-xs text-text-muted">
          <Count icon={CarFront} count={course.rows.length} label="rows of traffic" />
          <Count icon={Road} count={course.lanes} label="lanes" />
        </span>
        <MedalTimesLine course={course} />
      </span>
    </span>
  );
}

// One course, as the online guest sees the host's pick.
export function CourseCard({ course }: { course: DesignedCourse }) {
  return (
    <div data-testid="course-chosen" className="w-full rounded-lg border-2 border-brand-green bg-surface-secondary p-3">
      <CourseDetails course={course} />
    </div>
  );
}

// The list to pick from, the picked course marked. Each course's button
// carries its id as `data-course`, so a screen's own key handling can tell a
// key meant for the list apart. A controller's focus starts on the course
// picked.
export function CoursePicker({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
  return (
    <ul className="flex w-full flex-col gap-2">
      {COOP_COURSES.map((course) => {
        const picked = course.id === selected;
        return (
          <li key={course.id}>
            <button
              type="button"
              aria-pressed={picked}
              data-course={course.id}
              data-pad-start={picked || undefined}
              onClick={() => {
                onSelect(course.id);
              }}
              className={cn(
                "w-full rounded-lg border-2 bg-surface-secondary p-3 transition-colors hover:bg-surface-tertiary focus-visible:outline-2 focus-visible:outline-brand-blue",
                picked ? "border-brand-green bg-surface-tertiary" : "border-border-default",
              )}
            >
              <CourseDetails course={course} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
