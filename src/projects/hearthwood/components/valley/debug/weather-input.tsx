"use client";

import { useState } from "react";
import { weatherInput, type WeatherInput } from "../../../art/shadows/weather-input";
import type { DebugSection } from "./section";

const SLIDERS: readonly { key: keyof WeatherInput; label: string; max: number }[] = [
  { key: "clouds", label: "Clouds", max: 1 },
  { key: "wind", label: "Wind", max: 1 },
  { key: "windToward", label: "Wind toward", max: Math.PI * 2 },
];

/** The weather the shadows and plants answer to, on sliders, until the weather has an engine to set it. */
function WeatherSliders() {
  const input = weatherInput();
  const [values, setValues] = useState<WeatherInput>(() => ({ ...input }));
  return (
    <>
      {SLIDERS.map(({ key, label, max }) => (
        <label key={key} className="flex flex-col gap-1">
          <span className="flex justify-between">
            <span>{label}</span>
            <span>{values[key].toFixed(2)}</span>
          </span>
          <input
            type="range"
            aria-label={label}
            min={0}
            max={max}
            step={0.01}
            value={values[key]}
            onChange={(e) => {
              input[key] = Number(e.target.value);
              setValues({ ...input });
            }}
          />
        </label>
      ))}
    </>
  );
}

export const WEATHER_INPUT_SECTION: DebugSection = { id: "weather-input", title: "Clouds and wind", Section: WeatherSliders };
