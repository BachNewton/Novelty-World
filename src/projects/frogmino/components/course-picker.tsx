"use client";

import { Medal as MedalIcon } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { COOP_COURSES } from "../coop-courses";
import { COURSE_TIERS, type CourseTier, type DesignedCourse } from "../coop-courses/design";
import { formatTime, MEDALS } from "../medals";
import { toTicks } from "../ticks";
import { MEDAL_NAMES, MEDAL_TEXT } from "./run-clock";

// Picking a co-op course: every designed course, grouped by tier, easiest
// first, each with its name, tier, description, road and medal times. The
// local join screen and the online host's waiting room pick with it; the
// online guest sees the host's pick as a single card.

const TIER_NAMES: Record<CourseTier, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };
const TIER_TONE: Record<CourseTier, string> = {
  easy: "border-brand-green text-brand-green",
  medium: "border-brand-orange text-brand-orange",
  hard: "border-brand-pink text-brand-pink",
};

function TierBadge({ tier }: { tier: CourseTier }) {
  return <span className={cn("shrink-0 rounded-full border px-2 text-xs font-bold", TIER_TONE[tier])}>{TIER_NAMES[tier]}</span>;
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
        <span data-testid="course-name" className="truncate font-bold text-text-primary">{course.name}</span>
        <TierBadge tier={course.tier} />
      </span>
      <span className="text-sm text-text-secondary">{course.description}</span>
      <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-xs text-text-muted">
          {course.rows.length} rows · {course.lanes} lanes · {course.kinds.join(" + ")}
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
// key meant for the list apart.
export function CoursePicker({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
  return (
    <div className="flex w-full flex-col gap-3">
      {COURSE_TIERS.map((tier) => {
        const courses = COOP_COURSES.filter((course) => course.tier === tier);
        if (courses.length === 0) return null;
        return (
          <section key={tier} aria-label={`${TIER_NAMES[tier]} courses`} className="flex flex-col gap-2">
            <h3 className="text-left text-xs font-bold uppercase tracking-wide text-text-muted">{TIER_NAMES[tier]}</h3>
            <ul className="flex flex-col gap-2">
              {courses.map((course) => {
                const picked = course.id === selected;
                return (
                  <li key={course.id}>
                    <button
                      type="button"
                      aria-pressed={picked}
                      data-course={course.id}
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
          </section>
        );
      })}
    </div>
  );
}
