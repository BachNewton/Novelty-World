"use client";

import { useEffect, useState } from "react";
import { auroraAt, auroraTonight } from "../../../art/sky/aurora";
import { rainbowAt } from "../../../art/sky/rainbow";
import { SKY_INPUTS, type Sighting } from "../../../art/sky/sky-inputs";
import type { DebugContext, DebugSection } from "./section";

/*
 * The sky's own inputs and what it shows now: the rain the rainbow needs
 * (until the weather drives it), the rare sights held on or off rather than
 * left to their seeded nights, and readings of the sun, the moon and those
 * sights.
 */

const SIGHTINGS: readonly Sighting[] = ["seeded", "on", "off"];

const percent = (x: number) => `${Math.round(x * 100)}%`;

function SightingChoice({ label, value, onChange }: { label: string; value: Sighting; onChange: (s: Sighting) => void }) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span>{label}</span>
      <select
        aria-label={label}
        className="rounded bg-transparent"
        value={value}
        onChange={(e) => {
          onChange(e.target.value as Sighting);
        }}
      >
        {SIGHTINGS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </label>
  );
}

function Sky({ context: { clock } }: { context: DebugContext }) {
  const [inputs, setInputs] = useState({ ...SKY_INPUTS });
  const [, setTick] = useState(0);

  // The readings follow the turning day, read once a frame.
  useEffect(() => {
    let raf = requestAnimationFrame(function follow() {
      setTick((n) => n + 1);
      raf = requestAnimationFrame(follow);
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  const set = (change: Partial<typeof SKY_INPUTS>): void => {
    Object.assign(SKY_INPUTS, change);
    setInputs({ ...SKY_INPUTS });
  };

  const { sun, moon } = clock.sky;
  return (
    <>
      <span className="flex justify-between tabular-nums">
        <span>Sun</span>
        <span>{sun.elevation.toFixed(1)}°</span>
      </span>
      <span className="flex justify-between tabular-nums">
        <span>Moon</span>
        <span>
          {moon.phase}, {percent(moon.illuminated)} lit, {moon.elevation.toFixed(0)}°
        </span>
      </span>
      <span className="flex justify-between tabular-nums">
        <span>Aurora</span>
        <span>
          tonight {percent(auroraTonight(clock.date))}, now {percent(auroraAt(clock.date, sun))}
        </span>
      </span>
      <label className="flex items-center justify-between gap-2">
        <span>Rain</span>
        <span className="tabular-nums">{percent(inputs.rain)}</span>
      </label>
      <input
        type="range"
        aria-label="Rain"
        min={0}
        max={1}
        step={0.05}
        value={inputs.rain}
        onChange={(e) => {
          set({ rain: Number(e.target.value) });
        }}
      />
      <span className="flex justify-between tabular-nums">
        <span>Rainbow</span>
        <span>{percent(rainbowAt(sun))}</span>
      </span>
      <SightingChoice
        label="Northern lights"
        value={inputs.aurora}
        onChange={(aurora) => {
          set({ aurora });
        }}
      />
    </>
  );
}

export const SKY_SECTION: DebugSection = { id: "sky", title: "Sky", Section: Sky };
