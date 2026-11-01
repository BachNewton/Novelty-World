"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import { AlandDrive } from "./aland-drive";

const ForestLab = dynamic(() => import("./forest-lab").then((m) => m.ForestLab), { ssr: false });

const JunctionLab = dynamic(() => import("./junction-lab").then((m) => m.JunctionLab), { ssr: false });

const subscribeToNothing = () => () => {};
const labAsked = () => {
  const query = new URLSearchParams(window.location.search);
  if (query.has("forest-lab")) return "forest";
  return query.has("junction-lab") ? "junction" : "none";
};

/** The drive, or with `?forest-lab` or `?junction-lab` a lab. Which it is is known only in the browser. */
export function AlandDrivePage() {
  const lab = useSyncExternalStore(subscribeToNothing, labAsked, () => null);
  if (lab === null) return null;
  if (lab === "forest") return <ForestLab />;
  return lab === "junction" ? <JunctionLab /> : <AlandDrive />;
}
