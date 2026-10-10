import { roomLight, spreadBounce, withBounce, type Gathered, type LightLayout, type RoomLight } from "./bake";
import type { FrozenRoom } from "./freeze";

/*
 * The last step of a pass, once all its chunks are in: laying the room's
 * light into its lightmap, with the bounce spread over the texels and added
 * to the direct light. It runs in a worker, so the main thread only shows
 * what comes back.
 */

export type FinishWork =
  | { kind: "direct"; layout: LightLayout; light: Gathered }
  | { kind: "bounce"; layout: LightLayout; direct: Gathered; coarse: Gathered };

/** A frozen room's layout as plain data, small enough to send to a worker. */
export function lightLayout(room: FrozenRoom): LightLayout {
  const { width, height, index, charts } = room.texels;
  return { texels: { width, height, index, charts }, probes: { all: { length: room.probes.all.length } } };
}

export function finishLight(work: FinishWork): RoomLight {
  return work.kind === "direct" ? roomLight(work.layout, work.light) : roomLight(work.layout, withBounce(work.direct, spreadBounce(work.layout, work.coarse)));
}
