"use client";

import { useState } from "react";
import { holdWeatherInput, weatherOverrides, type WeatherOverrides } from "../../../art/shadows/weather-input";
import type { DebugSection } from "./section";

const SLIDERS: readonly { key: keyof WeatherOverrides; label: string; max: number }[] = [
  { key: "clouds", label: "Clouds", max: 1 },
  { key: "wind", label: "Wind", max: 1 },
  { key: "windToward", label: "Wind toward", max: Math.PI * 2 },
];

/** The clouds and wind the shadows and plants answer to: the weather's own, or each held on a slider for testing. */
function WeatherSliders() {
  const [values, setValues] = useState<WeatherOverrides>(() => ({ ...weatherOverrides() }));
  const set = (key: keyof WeatherOverrides, value: number | null) => {
    setValues(holdWeatherInput(key, value));
  };
  return (
    <>
      {SLIDERS.map(({ key, label, max }) => {
        const held = values[key];
        return (
          <label key={key} className="flex flex-col gap-1">
            <span className="flex items-center justify-between gap-2">
              <span>{label}</span>
              <span className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  aria-label={`Hold ${label.toLowerCase()}`}
                  checked={held !== null}
                  onChange={(e) => {
                    set(key, e.target.checked ? max / 2 : null);
                  }}
                />
                {held === null ? "weather" : held.toFixed(2)}
              </span>
            </span>
            <input
              type="range"
              aria-label={label}
              min={0}
              max={max}
              step={0.01}
              disabled={held === null}
              value={held ?? 0}
              onChange={(e) => {
                set(key, Number(e.target.value));
              }}
            />
          </label>
        );
      })}
    </>
  );
}

export const WEATHER_INPUT_SECTION: DebugSection = { id: "weather-input", title: "Clouds and wind", Section: WeatherSliders };
