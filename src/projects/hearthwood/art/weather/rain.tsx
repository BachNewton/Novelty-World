"use client";

import type { AtmosphereUniforms } from "../atmosphere";
import { weatherColours } from "../atmosphere/colours";
import { Falling, type FallingKind } from "./falling";
import type { WeatherNow } from "./now";

/** Rain: fast thin streaks, slanted by the wind. */
const RAIN: FallingKind = {
  count: 9000,
  box: { across: 36, tall: 22 },
  fall: [7, 9.5],
  streak: 28,
  width: 0.011,
  carried: 0.6,
  sway: 0,
  opacity: 0.32,
  share: (now) => now.weather.precipitation * (1 - now.weather.snow),
};

export function Rain({ now, atmosphere }: { now: WeatherNow; atmosphere: AtmosphereUniforms }) {
  const colours = weatherColours();
  return <Falling kind={RAIN} colour={colours.rain} now={now} atmosphere={atmosphere} lightning={colours.lightning} />;
}
