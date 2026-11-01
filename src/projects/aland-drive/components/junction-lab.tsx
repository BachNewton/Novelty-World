"use client";

import { Fragment, useState } from "react";
import { JUNCTION_SPOTS, fromAbove, onApproach, type JunctionSpot } from "../render/junction-spots";
import { AlandDrive } from "./aland-drive";

/*
 * The `?junction-lab` page: the real game, with the hardest junctions a click
 * away, from above or at a driver's eye. It looks through the game's own probe,
 * so what it shows is what's driven on. F leaves the camera free to look round;
 * `?tiles=local:<port>` beside it shows a build of one's own.
 */

type View = "above" | "driver";

export function JunctionLab() {
  const [spot, setSpot] = useState<JunctionSpot | null>(null);
  const [view, setView] = useState<View>("above");

  const show = (next: JunctionSpot, nextView: View) => {
    setSpot(next);
    setView(nextView);
    window.__alandDrive?.look(nextView === "above" ? fromAbove(next) : onApproach(next));
  };

  return (
    <>
      <AlandDrive />
      <aside className="fixed top-14 left-3 z-10 flex max-h-[calc(100vh-5rem)] w-64 flex-col gap-1 overflow-y-auto rounded-lg bg-surface-elevated/90 p-3 text-sm text-text-primary">
        <h1 className="font-bold">Junction lab</h1>
        {JUNCTION_SPOTS.map((junction, index) => (
          <Fragment key={junction.name}>
            {index === 0 || JUNCTION_SPOTS[index - 1].kind !== junction.kind ? <h2 className="mt-1 text-xs text-text-secondary capitalize">{junction.kind}</h2> : null}
            <button type="button" aria-pressed={junction === spot} className={`rounded px-2 py-1 text-left hover:bg-surface-tertiary ${junction === spot ? "bg-surface-tertiary font-bold" : ""}`} onClick={() => show(junction, view)}>
              {junction.name}
            </button>
          </Fragment>
        ))}
        <div className="mt-2 flex gap-1">
          {(["above", "driver"] as const).map((option) => (
            <button key={option} type="button" aria-pressed={option === view} disabled={spot === null} className={`flex-1 rounded px-2 py-1 capitalize disabled:opacity-50 ${option === view ? "bg-surface-tertiary font-bold" : ""}`} onClick={() => spot && show(spot, option)}>
              {option}
            </button>
          ))}
        </div>
      </aside>
    </>
  );
}
