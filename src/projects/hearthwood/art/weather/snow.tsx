"use client";

import type { AtmosphereUniforms } from "../atmosphere";
import { weatherColours } from "../atmosphere/colours";
import { Falling, type FallingKind } from "./falling";
import type { WeatherNow } from "./now";

/** Snow: soft round flakes drifting slowly down, swaying as they go. */
const SNOW: FallingKind = {
  count: 12000,
  box: { across: 40, tall: 26 },
  fall: [0.6, 1.3],
  streak: 1,
  width: 0.028,
  carried: 0.5,
  sway: 0.35,
  opacity: 0.9,
  share: (now) => now.weather.precipitation * now.weather.snow,
};

export function Snow({ now, atmosphere }: { now: WeatherNow; atmosphere: AtmosphereUniforms }) {
  const colours = weatherColours();
  return <Falling kind={SNOW} colour={colours.snow} now={now} atmosphere={atmosphere} lightning={colours.lightning} />;
}
