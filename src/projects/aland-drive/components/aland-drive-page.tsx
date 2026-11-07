"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import { AlandDrive } from "./aland-drive";

const ForestLab = dynamic(() => import("./forest-lab").then((m) => m.ForestLab), { ssr: false });

const DeerLab = dynamic(() => import("./deer-lab").then((m) => m.DeerLab), { ssr: false });

const JunctionLab = dynamic(() => import("./junction-lab").then((m) => m.JunctionLab), { ssr: false });

const WeatherLab = dynamic(() => import("./weather-lab").then((m) => m.WeatherLab), { ssr: false });
const LaneLab = dynamic(() => import("./lane-lab").then((m) => m.LaneLab), { ssr: false });

const SoundLab = dynamic(() => import("../audio/sound-lab").then((m) => m.SoundLab), { ssr: false });

const subscribeToNothing = () => () => {};
const labAsked = () => {
  const query = new URLSearchParams(window.location.search);
  if (query.has("forest-lab")) return "forest";
  if (query.has("deer-lab")) return "deer";
  if (query.has("sounds")) return "sounds";
  if (query.has("weather-lab")) return "weather";
  if (query.has("lane-lab")) return "lanes";
  return query.has("junction-lab") ? "junction" : "none";
};

/** The drive, or with `?deer-lab`, `?forest-lab`, `?junction-lab`, `?lane-lab`, `?weather-lab` or `?sounds` a lab. Which it is is known only in the browser. */
export function AlandDrivePage() {
  const lab = useSyncExternalStore(subscribeToNothing, labAsked, () => null);
  if (lab === null) return null;
  if (lab === "forest") return <ForestLab />;
  if (lab === "deer") return <DeerLab />;
  if (lab === "sounds") return <SoundLab />;
  if (lab === "weather") return <WeatherLab />;
  if (lab === "lanes") return <LaneLab />;
  return lab === "junction" ? <JunctionLab /> : <AlandDrive />;
}
