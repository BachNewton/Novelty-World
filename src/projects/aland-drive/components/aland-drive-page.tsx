"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import { AlandDrive } from "./aland-drive";

const ForestLab = dynamic(() => import("./forest-lab").then((m) => m.ForestLab), { ssr: false });

const subscribeToNothing = () => () => {};
const isForestLab = () => new URLSearchParams(window.location.search).has("forest-lab");

/** The drive, or with `?forest-lab` the forest on its own. Which it is is known only in the browser. */
export function AlandDrivePage() {
  const lab = useSyncExternalStore(subscribeToNothing, isForestLab, () => null);
  if (lab === null) return null;
  return lab ? <ForestLab /> : <AlandDrive />;
}
