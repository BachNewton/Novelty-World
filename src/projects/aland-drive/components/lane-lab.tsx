"use client";

import { Bike, Car, PersonStanding } from "lucide-react";
import { useCallback, useState, useSyncExternalStore, type ReactNode } from "react";
import type { GameProbe, Place } from "../render/game";
import { JUNCTION_SPOTS, fromAbove, placeOf } from "../render/junction-spots";
import type { LaneIssueKind } from "../traffic/lane-map";
import type { LaneNet } from "../traffic/lane-net";
import { AlandDrive } from "./aland-drive";

/*
 * The `?lane-lab` page: the real game with its lane map drawn over the road, to
 * judge each junction's lanes, connectors and right of way. The list is the
 * audit's, for the loaded tiles: every place a lane or connector can't sit
 * cleanly on the drawn road, a click away from above. The junction lab's hardest
 * junctions are here too, and cars, cyclists and walkers on the lanes round the camera,
 * coming and going out of sight, to see the lanes and their right of way at work. `?at=` opens it at a place, as the
 * audit's links do.
 */

const ABOVE_M = 60;
/** How busy the lanes round the camera are: Åland's own density, four times it to see more meet, or none. */
const DENSITIES = [
  { density: 0, label: "Off" },
  { density: 1, label: "Åland" },
  { density: 4, label: "×4" },
];
const OPENS_WITH = 1;

function DensityPicker({ name, icon, value, onPick }: { name: string; icon: ReactNode; value: number; onPick: (density: number) => void }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={name}>
      {icon}
      {DENSITIES.map(({ density, label }) => (
        <button key={density} type="button" aria-pressed={value === density} className={`rounded px-2 py-0.5 text-xs ${value === density ? "bg-surface-tertiary font-bold" : "hover:bg-surface-tertiary"}`} onClick={() => { onPick(density); }}>
          {label}
        </button>
      ))}
    </div>
  );
}

const LEGEND = [
  { token: "lane-road", label: "Lane, arrows the way it runs" },
  { token: "lane-path", label: "Path lane" },
  { token: "lane-priority", label: "Has right of way" },
  { token: "lane-yield", label: "Gives way" },
  { token: "lane-off", label: "Gap in the road surface" },
  { token: "lane-back", label: "Turns round" },
  { token: "lane-issue", label: "Audit finding" },
];

const KIND_NAMES: Record<LaneIssueKind, string> = {
  "off-road": "Off the road",
  tight: "Too tight to turn",
  buried: "Under another road",
  step: "Steps",
  kink: "Kinks",
  unreachable: "Unreachable",
};

const subscribeToNothing = () => () => {};

function useLanes(net: LaneNet | null): number {
  return useSyncExternalStore(net ? (listener) => net.subscribe(listener) : subscribeToNothing, () => net?.changes ?? 0, () => 0);
}

const above = (x: number, z: number): Place => ({ ...placeOf(x, z), height: ABOVE_M, yaw: 0, pitch: -Math.PI / 2 });

function Swatch({ token }: { token: string }) {
  return <span aria-hidden className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: `var(--color-aland-drive-${token})` }} />;
}

export function LaneLab() {
  const [probe, setProbe] = useState<GameProbe | null>(null);
  const [shown, setShown] = useState(true);
  const [paths, setPaths] = useState(false);
  const [cars, setCars] = useState(OPENS_WITH);
  const [bikes, setBikes] = useState(OPENS_WITH);
  const [walkers, setWalkers] = useState(OPENS_WITH);
  const net = probe?.lanes() ?? null;
  useLanes(net);

  // Stable, or the drive would start again on every render.
  const start = useCallback((started: GameProbe) => {
    started.showLanes(true);
    started.traffic(OPENS_WITH);
    started.cyclists(OPENS_WITH);
    started.walkers(OPENS_WITH);
    setProbe(started);
  }, []);
  const look = (at: Place) => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    probe?.look(at);
  };
  const issues = (net?.issues() ?? []).filter((issue) => paths || !issue.path);
  const kinds = [...new Set(issues.map((issue) => issue.kind))];
  const counts = net
    ?.loaded()
    .map((name) => net.tile(name))
    .reduce((sum, tile) => ({ lanes: sum.lanes + (tile?.lanes.filter((lane) => !lane.path).length ?? 0), connectors: sum.connectors + (tile?.connectors.length ?? 0) }), { lanes: 0, connectors: 0 });
  const seams = net?.seams();

  return (
    <>
      <AlandDrive solo onStarted={start} />
      <aside className="fixed top-14 left-3 z-10 flex max-h-[calc(100vh-5rem)] w-72 flex-col gap-1 overflow-y-auto rounded-lg bg-surface-elevated/90 p-3 text-sm text-text-primary">
        <h1 className="font-bold">Lane lab</h1>
        {net && counts && seams ? (
          <p className="text-xs text-text-secondary">
            {net.loaded().length} tiles · {counts.lanes} lanes · {counts.connectors} connectors · seams {seams.joined} joined, {seams.open} open
          </p>
        ) : null}
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={shown} onChange={(event) => { setShown(event.target.checked); probe?.showLanes(event.target.checked); }} />
          Lanes
        </label>
        <DensityPicker name="Cars on the lanes" icon={<Car className="size-4" aria-hidden />} value={cars} onPick={(density) => { setCars(density); probe?.traffic(density); }} />
        <DensityPicker name="Cyclists on the lanes" icon={<Bike className="size-4" aria-hidden />} value={bikes} onPick={(density) => { setBikes(density); probe?.cyclists(density); }} />
        <DensityPicker name="Walkers on the paths" icon={<PersonStanding className="size-4" aria-hidden />} value={walkers} onPick={(density) => { setWalkers(density); probe?.walkers(density); }} />
        <ul className="flex flex-col gap-0.5 text-xs">
          {LEGEND.map(({ token, label }) => (
            <li key={token} className="flex items-center gap-2">
              <Swatch token={token} />
              {label}
            </li>
          ))}
        </ul>
        <h2 className="mt-2 text-xs text-text-secondary">Hardest junctions</h2>
        {JUNCTION_SPOTS.map((spot) => (
          <button key={spot.name} type="button" className="rounded px-2 py-0.5 text-left hover:bg-surface-tertiary" onClick={() => { look(fromAbove(spot)); }}>
            {spot.name}
          </button>
        ))}
        <div className="mt-2 flex items-center justify-between">
          <h2 className="text-xs text-text-secondary">Audit, loaded tiles</h2>
          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" checked={paths} onChange={(event) => { setPaths(event.target.checked); }} />
            Paths
          </label>
        </div>
        {kinds.map((kind) => (
          <details key={kind}>
            <summary className="cursor-pointer">
              {KIND_NAMES[kind]} ({issues.filter((issue) => issue.kind === kind).length})
            </summary>
            {issues
              .filter((issue) => issue.kind === kind)
              .map((issue) => (
                <button key={`${issue.tile} ${issue.x} ${issue.z}`} type="button" title={issue.detail} className="block w-full truncate rounded px-2 py-0.5 text-left text-xs hover:bg-surface-tertiary" onClick={() => { look(above(issue.x, issue.z)); }}>
                  {issue.path ? "· " : ""}
                  {issue.detail}
                  {issue.count > 1 ? ` ×${issue.count}` : ""}
                </button>
              ))}
          </details>
        ))}
      </aside>
    </>
  );
}
