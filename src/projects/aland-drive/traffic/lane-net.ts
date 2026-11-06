import type { Connector, Lane, LaneIssue, TileLanes } from "./lane-map";

/*
 * The loaded tiles' lane maps as one network. A lane crossing a tile's edge ends
 * on the seam section, which both tiles write to the millimetre, so its two halves
 * find each other by place, with no ids shared between tiles. The net lands and
 * goes with each tile's detail.
 */

/** A lane, named by its tile and its place in that tile's list. */
export interface LaneRef {
  tile: string;
  lane: number;
}

/** Two halves of one lane at a seam are this close. */
const SEAM_MATCH_M = 0.05;
const CELL_M = 50;

const cellKey = (column: number, row: number) => `${column},${row}`;

interface Loaded {
  lanes: TileLanes;
  /** Each lane's other half across a seam, by its end and its start. */
  onward: Map<number, LaneRef>;
  back: Map<number, LaneRef>;
  /** The lanes with a point in each cell, for finding lanes near a place. */
  cells: Map<string, number[]>;
}

export class LaneNet {
  private readonly tiles = new Map<string, Loaded>();
  private readonly listeners = new Set<() => void>();
  private version = 0;

  add(name: string, lanes: TileLanes): void {
    const cells = new Map<string, number[]>();
    lanes.lanes.forEach((lane, index) => {
      const seen = new Set<string>();
      for (let point = lane.first; point < lane.first + lane.count; point++) {
        const key = cellKey(Math.floor(lanes.points[point * 3] / CELL_M), Math.floor(lanes.points[point * 3 + 2] / CELL_M));
        if (seen.has(key)) continue;
        seen.add(key);
        const list = cells.get(key);
        if (list) list.push(index);
        else cells.set(key, [index]);
      }
    });
    const loaded: Loaded = { lanes, onward: new Map(), back: new Map(), cells };
    this.tiles.set(name, loaded);
    for (const [other, there] of this.tiles) {
      if (other !== name) this.joinSeams(name, loaded, other, there);
    }
    this.changed();
  }

  remove(name: string): void {
    if (!this.tiles.delete(name)) return;
    for (const there of this.tiles.values()) {
      for (const [lane, ref] of there.onward) if (ref.tile === name) there.onward.delete(lane);
      for (const [lane, ref] of there.back) if (ref.tile === name) there.back.delete(lane);
    }
    this.changed();
  }

  private joinSeams(name: string, here: Loaded, other: string, there: Loaded): void {
    const ends = (loaded: Loaded, start: boolean) => loaded.lanes.lanes.flatMap((lane, index) => ((start ? lane.seamStart : lane.seamEnd) ? [{ index, at: start ? lane.first : lane.first + lane.count - 1 }] : []));
    const near = (a: Loaded, i: number, b: Loaded, j: number) => Math.hypot(a.lanes.points[i * 3] - b.lanes.points[j * 3], a.lanes.points[i * 3 + 2] - b.lanes.points[j * 3 + 2]) < SEAM_MATCH_M;
    for (const [from, fromName, to, toName] of [[here, name, there, other], [there, other, here, name]] as const) {
      const starts = ends(to, true);
      for (const end of ends(from, false)) {
        const partner = starts.find((start) => near(from, end.at, to, start.at));
        if (!partner) continue;
        from.onward.set(end.index, { tile: toName, lane: partner.index });
        to.back.set(partner.index, { tile: fromName, lane: end.index });
      }
    }
  }

  private changed(): void {
    this.version++;
    for (const listener of this.listeners) listener();
  }

  /** Called whenever a tile's lanes land or go. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Changes each time a tile's lanes land or go. */
  get changes(): number {
    return this.version;
  }

  loaded(): string[] {
    return [...this.tiles.keys()];
  }

  tile(name: string): TileLanes | undefined {
    return this.tiles.get(name)?.lanes;
  }

  lane({ tile, lane }: LaneRef): Lane {
    const found = this.tiles.get(tile)?.lanes.lanes[lane];
    if (!found) throw new Error(`no lane ${lane} on ${tile}`);
    return found;
  }

  /** The lanes traffic can carry on to from a lane's end: through its junction's connectors, or over a seam. */
  onward(ref: LaneRef): { lane: LaneRef; connector: Connector | null }[] {
    const loaded = this.tiles.get(ref.tile);
    if (!loaded) throw new Error(`${ref.tile} has no lanes loaded`);
    const across = loaded.onward.get(ref.lane);
    if (across) return [{ lane: across, connector: null }];
    return loaded.lanes.lanes[ref.lane].next.map((index) => {
      const connector = loaded.lanes.connectors[index];
      return { lane: { tile: ref.tile, lane: connector.to }, connector };
    });
  }

  /** The lane on from a seam end, if the tile over the edge is loaded. */
  acrossSeam(ref: LaneRef): LaneRef | null {
    return this.tiles.get(ref.tile)?.onward.get(ref.lane) ?? null;
  }

  /** How many seam ends are joined to a lane over the edge, and how many face a loaded tile with nothing there. */
  seams(): { joined: number; open: number } {
    let joined = 0;
    let open = 0;
    for (const loaded of this.tiles.values()) {
      loaded.lanes.lanes.forEach((lane, index) => {
        if (lane.seamEnd) {
          if (loaded.onward.has(index)) joined++;
          else open++;
        }
      });
    }
    return { joined, open };
  }

  /** Every loaded tile's list of places where the lanes can't sit cleanly on the drawn road. */
  issues(): (LaneIssue & { tile: string })[] {
    return [...this.tiles].flatMap(([tile, { lanes }]) => lanes.issues.map((issue) => ({ ...issue, tile })));
  }

  /** Lanes with a point within a cell or so of a place: the candidates for the nearest. */
  lanesNear(x: number, z: number, reach: number): LaneRef[] {
    const found: LaneRef[] = [];
    const cells = Math.ceil(reach / CELL_M);
    const column = Math.floor(x / CELL_M);
    const row = Math.floor(z / CELL_M);
    for (const [tile, loaded] of this.tiles) {
      const seen = new Set<number>();
      for (let down = -cells; down <= cells; down++) {
        for (let across = -cells; across <= cells; across++) {
          for (const lane of loaded.cells.get(cellKey(column + across, row + down)) ?? []) {
            if (seen.has(lane)) continue;
            seen.add(lane);
            found.push({ tile, lane });
          }
        }
      }
    }
    return found;
  }

  points(tile: string): Float32Array {
    const loaded = this.tiles.get(tile);
    if (!loaded) throw new Error(`${tile} has no lanes loaded`);
    return loaded.lanes.points;
  }
}
