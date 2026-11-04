import data from "./lanes.json";
import type { EndKind, LaneData, LaneEnd } from "./motion";

/*
 * The island's lanes, as `pipeline/sea_lanes.py` found them: the ferries' lines and the small boats' trips. JSON
 * gives an end's kind as any string, so each is checked here, once, against the kinds the motion knows.
 */

const KINDS: readonly EndKind[] = ["berth", "open", "anchor"];

type Raw = Omit<LaneData, "ends"> & { ends: { kind: string; turnM?: number; alongsideYaw?: number }[] };

function laneOf({ ends, ...lane }: Raw): LaneData {
  return {
    ...lane,
    ends: ends.map(({ kind, ...end }): LaneEnd => {
      const known = KINDS.find((name) => name === kind);
      if (known === undefined) throw new Error(`lane ${lane.name} has an end of kind ${kind}`);
      return { kind: known, ...end };
    }),
  };
}

export const LANES: { ferries: LaneData[]; boats: LaneData[] } = { ferries: data.ferries.map(laneOf), boats: data.boats.map(laneOf) };
