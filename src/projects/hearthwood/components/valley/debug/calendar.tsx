"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { Crossing } from "../../../engine/astronomy";
import { daysPerYear, FESTIVALS, festivalDay, festivalOn, nextFestival, type Season } from "../../../engine/calendar";
import { holdDay, setDay, type ValleyClock } from "../clock";
import type { DebugContext, DebugSection } from "./section";

/*
 * The date: its season, day and year, the real date it stands for, today's
 * festival or the next, the sun's day (sunrise, sunset, its length) and the
 * twilight now, and the moon's phase; the day of the year on a slider with a
 * step either way, a jump to any festival, and holding the date while the
 * hours turn.
 */

const SEASON_NAMES: Record<Season, string> = { spring: "Spring", summer: "Summer", autumn: "Autumn", winter: "Winter" };

/** Each season's own colour, for its dot. */
const SEASON_COLOURS: Record<Season, string> = {
  spring: "var(--color-hearthwood-valley-season-birch-fresh)",
  summer: "var(--color-hearthwood-valley-season-maple-summer)",
  autumn: "var(--color-hearthwood-valley-maple-orange)",
  winter: "var(--color-hearthwood-valley-ground-snow)",
};

function clockFace(hours: number): string {
  const minutes = Math.round(hours * 60) % (24 * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** The real date a real day of the year stands for, in a year that is not a leap year. */
function realDate(dayOfYear: number): string {
  return new Date(Date.UTC(2025, 0, 1 + Math.floor(dayOfYear))).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
}

function crossingText(crossing: Crossing, rises: boolean): string {
  if (crossing === "always-above") return "up all night";
  if (crossing === "always-below") return "never up";
  return clockFace(rises ? crossing.rises : crossing.sets);
}

function hoursText(hours: number): string {
  return `${String(Math.floor(hours))}h ${String(Math.round((hours % 1) * 60)).padStart(2, "0")}m`;
}

/** The moon as it shows: lit on its right while it waxes, on its left while it wanes. */
function MoonPhase({ lit, waxing }: { lit: number; waxing: boolean }) {
  const r = 9;
  const bulge = Math.abs(1 - 2 * lit) * r;
  const outer = waxing ? 1 : 0;
  const crescent = lit < 0.5;
  const inner = waxing === crescent ? 0 : 1;
  return (
    <svg width={22} height={22} viewBox="-11 -11 22 22" aria-hidden="true">
      <circle r={r} fill="currentColor" opacity={0.18} />
      <path d={`M 0 ${String(-r)} A ${String(r)} ${String(r)} 0 0 ${String(outer)} 0 ${String(r)} A ${bulge.toFixed(2)} ${String(r)} 0 0 ${String(inner)} 0 ${String(-r)} Z`} style={{ fill: "var(--color-hearthwood-valley-moon)" }} />
    </svg>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="flex items-center justify-between gap-2">
      <span className="opacity-70">{label}</span>
      <span className="flex items-center gap-1 text-right">{children}</span>
    </span>
  );
}

/** Re-renders once a frame while mounted, so the readings follow the turning day. */
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

function moveTo(clock: ValleyClock, dayOfYear: number): void {
  const yearStart = clock.date.day - clock.date.dayOfYear;
  setDay(clock, yearStart + ((dayOfYear % daysPerYear()) + daysPerYear()) % daysPerYear());
}

function Calendar({ context: { clock } }: { context: DebugContext }) {
  useEveryFrame();
  const [held, setHeld] = useState(clock.heldDay !== null);
  const { date, sky, today } = clock;
  const festival = festivalOn(date.day);
  const next = nextFestival(date.day);
  const dot = { background: SEASON_COLOURS[date.season] } as CSSProperties;

  return (
    <>
      <Row label="Date">
        <span className="inline-block size-2.5 rounded-full" style={dot} aria-hidden="true" />
        <span>
          {SEASON_NAMES[date.season]} {date.dayOfSeason} · year {date.year}
        </span>
      </Row>
      <Row label="Stands for">{realDate(date.realDayOfYear)}</Row>
      <Row label={festival ? "Today" : "Next"}>{festival ? festival.name : `${next.festival.name} in ${String(next.inDays)} ${next.inDays === 1 ? "day" : "days"}`}</Row>
      <Row label="Sunrise · sunset">
        {crossingText(today.sun, true)} · {crossingText(today.sun, false)}
      </Row>
      <Row label="Day length">{hoursText(today.dayLength)}</Row>
      <Row label="Sky now">{sky.sun.twilight === "day" ? "day" : sky.sun.twilight === "night" ? "night" : `${sky.sun.twilight} twilight`}</Row>
      <Row label="Moon">
        <MoonPhase lit={sky.moon.illuminated} waxing={sky.moon.waxing} />
        <span>
          {sky.moon.phase}, {Math.round(sky.moon.illuminated * 100)}%
        </span>
      </Row>
      <div className="flex items-center gap-2">
        <button type="button" aria-label="The day before" className="rounded px-1.5" style={{ border: "1px solid currentColor" }} onClick={() => moveTo(clock, date.dayOfYear - 1)}>
          ‹
        </button>
        <input
          type="range"
          className="grow"
          aria-label="Day of the year"
          min={0}
          max={daysPerYear() - 1}
          step={1}
          value={date.dayOfYear}
          onChange={(e) => {
            moveTo(clock, Number(e.target.value));
          }}
        />
        <button type="button" aria-label="The day after" className="rounded px-1.5" style={{ border: "1px solid currentColor" }} onClick={() => moveTo(clock, date.dayOfYear + 1)}>
          ›
        </button>
      </div>
      <label className="flex items-center justify-between gap-2">
        <span>Go to</span>
        <select
          aria-label="Go to a festival"
          className="rounded px-1"
          style={{ background: "transparent", border: "1px solid currentColor" }}
          value={festival?.id ?? ""}
          onChange={(e) => {
            const chosen = FESTIVALS.find((f) => f.id === e.target.value);
            if (chosen) moveTo(clock, festivalDay(chosen));
          }}
        >
          <option value="" disabled>
            a festival…
          </option>
          {FESTIVALS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={held}
          onChange={(e) => {
            holdDay(clock, e.target.checked);
            setHeld(e.target.checked);
          }}
        />
        <span>Hold the date</span>
      </label>
    </>
  );
}

export const CALENDAR_SECTION: DebugSection = { id: "calendar", title: "Calendar", Section: Calendar };
