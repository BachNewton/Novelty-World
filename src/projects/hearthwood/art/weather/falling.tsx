"use client";

import type { Color } from "three";
import type { AtmosphereUniforms } from "../atmosphere";
import type { WeatherNow } from "./now";

export interface FallingKind {
  count: number;
  box: { across: number; tall: number };
  fall: [number, number];
  streak: number;
  width: number;
  carried: number;
  sway: number;
  opacity: number;
  share: (now: WeatherNow) => number;
}

export function Falling(_: { kind: FallingKind; colour: Color; now: WeatherNow; atmosphere: AtmosphereUniforms; lightning: Color }) {
  return null;
}
