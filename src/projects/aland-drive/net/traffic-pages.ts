import type { Vector3 } from "../sim/car-state";
import { Bubble, type BubbleKind } from "../traffic/bubble";
import { LaneTraffic, type LaneCar, type VehicleKind } from "../traffic/lane-driver";
import type { TileLanes } from "../traffic/lane-map";
import { LaneNet } from "../traffic/lane-net";
import { parseTraffic, wireTraffic } from "./protocol";
import { createSharedTraffic, type SharedTraffic } from "./shared-traffic";

/*
 * Several pages sharing the lane traffic, with no browser and no relay: each
 * page its own lane net, traffic, bubble and shared traffic, a player standing
 * or moving somewhere, and a wire between them that carries each message as
 * the JSON a real one is, a step late, counting its bytes. For the tests of
 * shared traffic and for measuring what it sends (`tools/traffic-bandwidth.ts`).
 * Sight is distance alone: a vehicle is seen within its kind's reach.
 */

/** Traffic steps a second, as the game's: every fourth of the simulation's 120. */
export const TRAFFIC_HZ = 30;
const STEPS_PER_TRAFFIC_STEP = 4;

export interface TrafficPage {
  id: string;
  at: { x: number; z: number };
  traffic: LaneTraffic;
  bubble: Bubble;
  shared: SharedTraffic;
  /** Bytes this page sent, by kind of vehicle, and in all, with the messages' own. */
  sent: { bytes: number; messages: number; vehicles: Record<VehicleKind, number> };
}

interface InFlight {
  to: string;
  from: string;
  json: string;
}

export function createTrafficPages(tiles: ReadonlyMap<string, TileLanes>, kinds: () => Record<VehicleKind, BubbleKind>, carHalves: readonly (readonly [number, number])[]) {
  const pages = new Map<string, TrafficPage>();
  let wire: InFlight[] = [];

  const places = (): ReadonlyMap<string, Vector3> => new Map([...pages.values()].map(({ id, at }): [string, Vector3] => [id, [at.x, 0, at.z]]));

  function add(id: string, at: { x: number; z: number }): TrafficPage {
    const net = new LaneNet();
    for (const [name, lanes] of tiles) net.add(name, lanes);
    const traffic = new LaneTraffic(net, carHalves);
    let made = 0;
    const bubble = new Bubble(net, traffic, kinds(), (slot) => `${slot}~${id}${made++}`);
    const sent: TrafficPage["sent"] = { bytes: 0, messages: 0, vehicles: { car: 0, bike: 0, walker: 0 } };
    const shared = createSharedTraffic(
      traffic,
      {
        selfId: () => id,
        places,
        edgeM: (kind) => bubble.edgeM(kind),
        send: (message) => {
          const json = JSON.stringify(wireTraffic(message));
          const others = [...pages.keys()].filter((other) => other !== id);
          if (others.length === 0) return false;
          sent.bytes += json.length;
          sent.messages++;
          for (const { record } of message.vehicles) sent.vehicles[record.kind]++;
          for (const to of others) wire.push({ to, from: id, json });
          return true;
        },
      },
      STEPS_PER_TRAFFIC_STEP,
    );
    const page = { id, at: { ...at }, traffic, bubble, shared, sent };
    pages.set(id, page);
    for (const each of pages.values()) each.shared.players(new Set(pages.keys()));
    return page;
  }

  function leave(id: string): void {
    pages.delete(id);
    wire = wire.filter(({ from, to }) => from !== id && to !== id);
    for (const each of pages.values()) each.shared.players(new Set(pages.keys()));
  }

  /** One traffic step everywhere: what was sent last step arrives, then every page steps its bubble and traffic and sends. */
  function step(): void {
    const arriving = wire;
    wire = [];
    for (const { to, from, json } of arriving) {
      const message = parseTraffic(JSON.parse(json));
      if (!message) throw new Error(`traffic from ${from} that doesn't parse`);
      pages.get(to)?.shared.hear(from, message);
    }
    for (const page of pages.values()) {
      const others = [...pages.values()].filter((other) => other !== page).map((other) => other.at);
      const seen = (vehicle: Pick<LaneCar, "kind" | "pose">) => Math.hypot(vehicle.pose.x - page.at.x, vehicle.pose.z - page.at.z) < kinds()[vehicle.kind].reachM;
      page.bubble.update(page.at, seen, { others, runsHere: (vehicle) => page.shared.runsHere(vehicle), ready: true });
      page.traffic.step(1 / TRAFFIC_HZ);
      page.shared.step();
    }
  }

  return { pages, add, leave, step };
}
