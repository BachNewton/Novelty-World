import type { ComponentType } from "react";
import type { FrameCosts } from "../../../art/passes";
import type { ValleyClock } from "../clock";
import type { SceneWeather } from "../world-weather";

/** What every section of the ~ panel can read and drive. */
export interface DebugContext {
  clock: ValleyClock;
  /** Each part of the frame's GPU time, measured while a section watches it. */
  costs: FrameCosts;
  /** The weather now, and holding it at one kind; absent where nothing has weather (the art gallery). */
  weather?: SceneWeather;
}

/** One section of the ~ panel: its own component under its own heading, in the order `sections.ts` lists them. */
export interface DebugSection {
  id: string;
  title: string;
  Section: ComponentType<{ context: DebugContext }>;
}
