import type { LaneNet, LaneRef } from "./lane-net";
import type { Connector, LaneLine } from "./lane-map";

/*
 * Knowing what's around: every vehicle near the player, whatever drives it, each
 * placed on the lane or connector it's on and how far along. A simulated car is
 * matched to the nearest lane running its way, as respawning finds the nearest
 * road; a car the lane map drives is put where it is. The questions are few and
 * the same for every asker: what's ahead within a distance, through the junctions
 * coming and on what merges into them; what's behind; and what's coming on the
 * connectors a turn gives way to.
 */

/** A vehicle's place: on a lane, or on a connector through a junction, metres along it. */
export interface OnLane {
  tile: string;
  /** A lane's index, or a connector's with `connector` true. */
  index: number;
  connector: boolean;
  along: number;
}

export interface Seen {
  id: string;
  /** Metres along the way from the asker to it. */
  gap: number;
  place: OnLane;
}

/** How far off a lane's line a vehicle may be and still be on it, and how far its heading may turn from the lane's. */
const ON_LANE_M = 6;
const SAME_WAY = Math.cos(Math.PI / 3);

const keyOf = ({ tile, index, connector }: Pick<OnLane, "tile" | "index" | "connector">) => `${tile}:${connector ? "c" : "l"}${index}`;

function lengthOf(points: Float32Array, line: LaneLine): number {
  let length = 0;
  for (let at = line.first; at < line.first + line.count - 1; at++) length += Math.hypot(points[at * 3 + 3] - points[at * 3], points[at * 3 + 5] - points[at * 3 + 2]);
  return length;
}

/** The nearest point of a line to a place: metres off it, metres along it, and whether the line runs within a turn of `heading`. */
function nearestOn(points: Float32Array, line: LaneLine, x: number, z: number, heading: { x: number; z: number } | null) {
  let best = { off: Infinity, along: 0, sameWay: false };
  let travelled = 0;
  for (let at = line.first; at < line.first + line.count - 1; at++) {
    const x0 = points[at * 3];
    const z0 = points[at * 3 + 2];
    const dx = points[at * 3 + 3] - x0;
    const dz = points[at * 3 + 5] - z0;
    const length = Math.hypot(dx, dz);
    if (length < 1e-6) continue;
    const share = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / (length * length)));
    const off = Math.hypot(x - (x0 + dx * share), z - (z0 + dz * share));
    if (off < best.off) best = { off, along: travelled + share * length, sameWay: heading === null || (dx * heading.x + dz * heading.z) / length > SAME_WAY };
    travelled += length;
  }
  return best;
}

export class Around {
  private readonly places = new Map<string, OnLane>();
  private readonly onLines = new Map<string, Set<string>>();
  private readonly lengths = new Map<string, number>();

  constructor(private readonly net: LaneNet) {
    net.subscribe(() => {
      this.lengths.clear();
      const loaded = new Set(net.loaded());
      for (const [id, place] of this.places) if (!loaded.has(place.tile)) this.forget(id);
    });
  }

  /** Puts a vehicle where its lane driver says it is. */
  put(id: string, place: OnLane): void {
    this.forget(id);
    this.places.set(id, place);
    const key = keyOf(place);
    const on = this.onLines.get(key);
    if (on) on.add(id);
    else this.onLines.set(key, new Set([id]));
  }

  /** Puts a vehicle on the nearest lane or connector running its way, or nowhere if none is near: off the road. Heading is a scene (x, z) way. */
  match(id: string, x: number, z: number, heading: { x: number; z: number }): OnLane | null {
    let best: { off: number; place: OnLane } | null = null;
    const length = Math.hypot(heading.x, heading.z);
    const way = { x: heading.x / length, z: heading.z / length };
    for (const ref of this.net.lanesNear(x, z, ON_LANE_M)) {
      const tile = this.net.tile(ref.tile);
      if (!tile) continue;
      const lane = tile.lanes[ref.lane];
      const found = nearestOn(tile.points, lane, x, z, way);
      if (found.sameWay && found.off < ON_LANE_M && (!best || found.off < best.off)) best = { off: found.off, place: { tile: ref.tile, index: ref.lane, connector: false, along: found.along } };
      // A junction's connectors leave from a lane's end, so a vehicle in one is found from the lanes round it.
      for (const index of lane.next) {
        const through = nearestOn(tile.points, tile.connectors[index], x, z, way);
        if (through.sameWay && through.off < ON_LANE_M && (!best || through.off < best.off)) best = { off: through.off, place: { tile: ref.tile, index, connector: true, along: through.along } };
      }
    }
    if (!best) {
      this.forget(id);
      return null;
    }
    this.put(id, best.place);
    return best.place;
  }

  forget(id: string): void {
    const place = this.places.get(id);
    if (!place) return;
    this.places.delete(id);
    this.onLines.get(keyOf(place))?.delete(id);
  }

  where(id: string): OnLane | undefined {
    return this.places.get(id);
  }

  private length(place: Pick<OnLane, "tile" | "index" | "connector">): number {
    const key = keyOf(place);
    const known = this.lengths.get(key);
    if (known !== undefined) return known;
    const tile = this.net.tile(place.tile);
    if (!tile) throw new Error(`${place.tile} has no lanes loaded`);
    const length = lengthOf(tile.points, place.connector ? tile.connectors[place.index] : tile.lanes[place.index]);
    this.lengths.set(key, length);
    return length;
  }

  private on(place: Pick<OnLane, "tile" | "index" | "connector">, except: string): { id: string; along: number }[] {
    return [...(this.onLines.get(keyOf(place)) ?? [])].filter((id) => id !== except).map((id) => ({ id, along: this.places.get(id)?.along ?? 0 }));
  }

  /** The lines that follow a lane or connector: a lane's connectors, a connector's lane, a seam's other half. */
  private following(place: Pick<OnLane, "tile" | "index" | "connector">): Pick<OnLane, "tile" | "index" | "connector">[] {
    const tile = this.net.tile(place.tile);
    if (!tile) return [];
    if (place.connector) return [{ tile: place.tile, index: tile.connectors[place.index].to, connector: false }];
    const across = this.net.acrossSeam({ tile: place.tile, lane: place.index });
    if (across) return [{ tile: across.tile, index: across.lane, connector: false }];
    return tile.lanes[place.index].next.map((index) => ({ tile: place.tile, index, connector: true }));
  }

  /**
   * The nearest vehicles ahead within a reach, on every way on from here: along the line, through each junction's
   * connectors, and on the connectors that merge into the same lane. Nearest first, each once.
   */
  ahead(id: string, reach: number): Seen[] {
    const start = this.places.get(id);
    if (!start) return [];
    const seen = new Map<string, Seen>();
    const note = (other: string, gap: number, place: OnLane) => {
      const before = seen.get(other);
      if (gap <= reach && (!before || gap < before.gap)) seen.set(other, { id: other, gap, place });
    };
    const visited = new Set<string>();
    const walk = (place: Pick<OnLane, "tile" | "index" | "connector">, from: number, gapAtStart: number) => {
      const key = keyOf(place);
      if (gapAtStart > reach || visited.has(key)) return;
      visited.add(key);
      for (const other of this.on(place, id)) if (other.along > from) note(other.id, gapAtStart + other.along - from, { ...place, along: other.along });
      const end = gapAtStart + this.length(place) - from;
      for (const next of this.following(place)) {
        if (next.connector) this.merging(next, end, id, note);
        walk(next, 0, end);
      }
    };
    walk(start, start.along, 0);
    return [...seen.values()].sort((a, b) => a.gap - b.gap);
  }

  /** Vehicles on the other connectors into the lane a connector leads to, counted as far off as they are from its end. */
  private merging(place: Pick<OnLane, "tile" | "index" | "connector">, gapAtStart: number, except: string, note: (id: string, gap: number, at: OnLane) => void): void {
    const tile = this.net.tile(place.tile);
    if (!tile) return;
    const target = tile.connectors[place.index].to;
    const ownLength = this.length(place);
    tile.connectors.forEach((other, index) => {
      if (index === place.index || other.to !== target) return;
      const otherLength = this.length({ tile: place.tile, index, connector: true });
      for (const vehicle of this.on({ tile: place.tile, index, connector: true }, except)) note(vehicle.id, gapAtStart + Math.max(0, ownLength - (otherLength - vehicle.along)), { tile: place.tile, index, connector: true, along: vehicle.along });
    });
  }

  /** The nearest vehicles behind within a reach, back along the line and the lanes leading into it. */
  behind(id: string, reach: number): Seen[] {
    const start = this.places.get(id);
    if (!start) return [];
    const found = this.on(start, id)
      .filter((other) => other.along < start.along && start.along - other.along <= reach)
      .map((other) => ({ id: other.id, gap: start.along - other.along, place: { ...start, along: other.along } }));
    const tile = this.net.tile(start.tile);
    if (tile && start.along < reach) {
      const into = start.connector
        ? [{ tile: start.tile, index: tile.connectors[start.index].from, connector: false }]
        : tile.connectors.flatMap((connector, index) => (connector.to === start.index ? [{ tile: start.tile, index, connector: true }] : []));
      for (const place of into) {
        const length = this.length(place);
        for (const other of this.on(place, id)) {
          const gap = start.along + length - other.along;
          if (gap <= reach) found.push({ id: other.id, gap, place: { ...place, along: other.along } });
        }
      }
    }
    return found.sort((a, b) => a.gap - b.gap);
  }

  /**
   * What's coming on the connectors a connector gives way to: each vehicle on one of them, or on the lane leading
   * into one within the reach, with its distance from the junction's end of that lane.
   */
  coming(tile: string, connector: number, reach: number): Seen[] {
    const lanes = this.net.tile(tile);
    if (!lanes) return [];
    const found: Seen[] = [];
    for (const index of lanes.connectors[connector].yields) {
      const other: Connector = lanes.connectors[index];
      for (const vehicle of this.on({ tile, index, connector: true }, "")) found.push({ id: vehicle.id, gap: 0, place: { tile, index, connector: true, along: vehicle.along } });
      const feeding = { tile, index: other.from, connector: false };
      const length = this.length(feeding);
      for (const vehicle of this.on(feeding, "")) {
        const gap = length - vehicle.along;
        if (gap <= reach) found.push({ id: vehicle.id, gap, place: { ...feeding, along: vehicle.along } });
      }
    }
    return found.sort((a, b) => a.gap - b.gap);
  }

  /** Every vehicle placed, for drawing or handing over. */
  all(): [string, OnLane][] {
    return [...this.places];
  }
}

export type { LaneRef };
