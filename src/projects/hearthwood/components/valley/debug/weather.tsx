"use client";

import { useEffect, useState } from "react";
import { parseWeather, WEATHER_KINDS, type Weather } from "../../../engine/weather";
import type { DebugContext, DebugSection } from "./section";

/*
 * The weather now, as bars that move with it, and holding it at one kind
 * (a clear day, mist, rain…) to look at, or letting the sky drift as it
 * will.
 */

const BARS: readonly { label: string; read: (w: Weather) => number; scale?: [number, number]; unit?: string }[] = [
  { label: "Temp", read: (w) => w.temperature, scale: [-15, 30], unit: "°C" },
  { label: "Humid", read: (w) => w.humidity },
  { label: "Cloud", read: (w) => w.cloudCover },
  { label: "Heaped", read: (w) => w.heaped },
  { label: "Wind", read: (w) => w.wind.speed, scale: [0, 14], unit: "m/s" },
  { label: "Rain", read: (w) => w.precipitation * (1 - w.snow) },
  { label: "Snow", read: (w) => w.precipitation * w.snow },
  { label: "Storm", read: (w) => w.storm },
  { label: "Mist", read: (w) => w.mist },
  { label: "Haze", read: (w) => w.haze, scale: [0, 3] },
  { label: "Wet", read: (w) => w.wetness },
  { label: "Puddles", read: (w) => w.puddles },
];

function Bar({ label, value, scale: [low, high] = [0, 1], unit = "" }: { label: string; value: number; scale?: [number, number]; unit?: string }) {
  const share = Math.min(1, Math.max(0, (value - low) / (high - low)));
  return (
    <div className="flex items-center gap-2 text-xs tabular-nums">
      <span className="w-14">{label}</span>
      <span className="h-1.5 grow rounded-full" style={{ background: "color-mix(in srgb, currentColor 18%, transparent)" }}>
        <span className="block h-full rounded-full" style={{ width: `${(share * 100).toFixed(1)}%`, background: "currentColor" }} />
      </span>
      <span className="w-14 text-right">
        {value.toFixed(unit === "" ? 2 : 1)}
        {unit}
      </span>
    </div>
  );
}

function WeatherNow({ context: { weather } }: { context: DebugContext }) {
  const [, setTick] = useState(0);
  // The bars follow the weather, read once a frame.
  useEffect(() => {
    let raf = requestAnimationFrame(function follow() {
      setTick((n) => n + 1);
      raf = requestAnimationFrame(follow);
    });
    return () => cancelAnimationFrame(raf);
  }, []);
  if (!weather) return <span className="text-xs opacity-70">No weather here</span>;
  const now = weather.weather;
  return (
    <>
      <label className="flex items-center justify-between gap-2">
        <span>Hold</span>
        <select
          aria-label="Hold the weather"
          className="rounded px-1"
          style={{ background: "transparent", color: "inherit", border: "1px solid currentColor" }}
          value={weather.held ?? "drift"}
          onChange={(e) => {
            weather.hold(e.target.value === "drift" ? null : parseWeather(e.target.value));
          }}
        >
          <option value="drift">as it comes</option>
          {WEATHER_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </select>
      </label>
      {BARS.map(({ label, read, scale, unit }) => (
        <Bar key={label} label={label} value={read(now)} scale={scale} unit={unit} />
      ))}
    </>
  );
}

export const WEATHER_SECTION: DebugSection = { id: "weather", title: "Weather", Section: WeatherNow };
