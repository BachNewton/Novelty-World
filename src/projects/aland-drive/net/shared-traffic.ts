import type { Vector3 } from "../sim/car-state";
import type { LaneCar, LaneTraffic, VehicleKind } from "../traffic/lane-driver";
import { clearlyNearer, NEARER_FOR_STEPS } from "./computer-cars";
import type { TrafficMessage, TrafficVehicle } from "./protocol";

/*
 * Lane traffic in the shared world (piece 14 of `ideas/traffic-and-racers.md`):
 * every car, cyclist and walker on the lanes is run by one player's page, the
 * player nearest it, as a computer-driven car is (`computer-cars.ts`), and
 * every other page near it drives it too, with the same driver, between that
 * page's messages. So a message only puts right what has drifted, and a
 * vehicle needs sending far less often than a simulated car does: its whole
 * record is a place on a lane, a speed and a body, and its choices are its
 * seed's.
 *
 * A vehicle is sent only while another player is near enough to hold it, past
 * their bubble's edge by a margin so they let it go before it stops coming.
 * It changes hands as a computer-driven car does: once another player has been
 * clearly nearer it for a moment, and never while a player's car is in a fight
 * with it. A player who goes leaves their vehicles to whichever player still
 * here is nearest each and holds it; two that claim one at once settle on the
 * lower id. A vehicle hit out of the traffic becomes a computer-driven car run
 * by whoever hit it, and its record is kept, so a message about it sent before
 * the hit was heard is known for stale.
 *
 * Who fills which slot is the bubble's (`traffic/bubble.ts`).
 */

/** How often each kind is sent, in traffic steps of a thirtieth of a second: a car twice a second, a cyclist or walker once. */
const SEND_EVERY: Record<VehicleKind, number> = { car: 15, bike: 30, walker: 30 };
/** A car this near another player's car is sent ten times a second: it's where a touch or a close reaction is. */
const CLOSE_M = 60;
const CLOSE_EVERY = 3;
/** Sent to a player while it's within this much past their bubble's edge, so they let it go before it stops coming. */
const SEND_PAST_EDGE_M = 50;

/** Who runs a vehicle before this player has an id in the world: this player, alone. */
const ALONE = "";

export interface SharedTrafficLink {
  selfId: () => string | null;
  /** Where every player's car is, by their id, this player's own included. */
  places: () => ReadonlyMap<string, Vector3>;
  /** How far from a player a vehicle of a kind is past their bubble's edge. */
  edgeM: (kind: VehicleKind) => number;
  /** To everyone; false when there's no one to send it to. */
  send: (traffic: TrafficMessage) => boolean;
}

interface Known {
  runner: string;
  handovers: number;
  /** Who has been clearly nearer it than this player, and for how many simulation steps. */
  nearer: { peer: string; steps: number } | null;
  /** Whether a player other than this one was near enough to be sent it at its last step. */
  sentTo: boolean;
}

const distance = (car: LaneCar, at: Vector3) => Math.hypot(car.pose.x - at[0], car.pose.z - at[2]);

export function createSharedTraffic(traffic: LaneTraffic, link: SharedTrafficLink, stepsPerTrafficStep: number) {
  const known = new Map<string, Known>();
  /** Every vehicle hit out of the traffic, by the handovers it was hit at: a message from before the hit is stale. */
  const hits = new Map<string, number>();
  let gone: TrafficMessage["gone"] = [];
  let steps = 0;

  const self = () => link.selfId() ?? ALONE;

  function knownOf(car: LaneCar): Known {
    let each = known.get(car.id);
    if (!each) {
      each = { runner: self(), handovers: 0, nearer: null, sentTo: false };
      known.set(car.id, each);
    }
    return each;
  }

  const vehicleOf = (car: LaneCar, each: Known, runner: string | null): TrafficVehicle => ({ record: traffic.record(car), handovers: each.handovers, runner });

  /** Whether a message saying a vehicle has this runner after this many handovers is news. */
  function news(id: string, runner: string, handovers: number): boolean {
    const hit = hits.get(id);
    if (hit !== undefined && handovers <= hit) return false;
    const each = known.get(id);
    if (!each) return true;
    if (handovers !== each.handovers) return handovers > each.handovers;
    // Two players who took it at once: the lower id keeps it.
    return runner === each.runner || runner < each.runner;
  }

  function handOn(car: LaneCar, each: Known, places: ReadonlyMap<string, Vector3>, me: string): boolean {
    const peer = clearlyNearer([car.pose.x, car.pose.y, car.pose.z], me, places, []);
    each.nearer = peer === null ? null : { peer, steps: each.nearer?.peer === peer ? each.nearer.steps + stepsPerTrafficStep : stepsPerTrafficStep };
    if (each.nearer === null || each.nearer.steps < NEARER_FOR_STEPS) return false;
    const handed = { ...each, runner: each.nearer.peer, handovers: each.handovers + 1, nearer: null };
    if (!link.send({ vehicles: [vehicleOf(car, handed, handed.runner)], gone: [] })) return false;
    known.set(car.id, handed);
    traffic.elsewhere.add(car.id);
    return true;
  }

  return {
    /** Whether this player runs a vehicle. */
    runsHere(car: LaneCar): boolean {
      return knownOf(car).runner === self();
    },

    /**
     * After each traffic step: the vehicles this player runs are handed on to a player clearly nearer, and sent to
     * whoever is near enough to hold them, each kind at its own pace; and those taken away since are said to be gone.
     */
    step(): void {
      steps++;
      const me = self();
      const places = link.places();
      for (const [id, each] of known) {
        if (each.runner === ALONE) each.runner = me;
        if (traffic.get(id)) continue;
        if (each.runner === me) gone.push({ id, handovers: each.handovers, hit: false });
        known.delete(id);
      }
      const vehicles: TrafficVehicle[] = [];
      for (const car of traffic.all()) {
        const each = knownOf(car);
        if (each.runner !== me || handOn(car, each, places, me)) continue;
        let nearest = Infinity;
        for (const [peer, at] of places) if (peer !== me) nearest = Math.min(nearest, distance(car, at));
        const near = nearest < link.edgeM(car.kind) + SEND_PAST_EDGE_M;
        // A player who has just come near it has it at once.
        const due = !each.sentTo || (steps + car.seed) % (car.kind === "car" && nearest < CLOSE_M ? CLOSE_EVERY : SEND_EVERY[car.kind]) === 0;
        each.sentTo = near;
        if (near && due) vehicles.push(vehicleOf(car, each, null));
      }
      if (vehicles.length === 0 && gone.length === 0) return;
      link.send({ vehicles, gone });
      // With no one to send it to, no one holds a copy to take away.
      gone = [];
    },

    /** Traffic another player sent. */
    hear(from: string, message: TrafficMessage): void {
      const me = self();
      const here = link.places().get(me);
      for (const { record, handovers, runner: named } of message.vehicles) {
        const runner = named ?? from;
        if (!news(record.id, runner, handovers)) continue;
        const held = traffic.get(record.id);
        // One past this player's edge is someone else's to hold.
        if (!held && runner !== me && here && Math.hypot(record.body.x - here[0], record.body.z - here[2]) > link.edgeM(record.kind)) continue;
        if (!traffic.restore(record)) {
          if (held) traffic.remove(record.id);
          known.delete(record.id);
          continue;
        }
        hits.delete(record.id);
        known.set(record.id, { runner, handovers, nearer: null, sentTo: false });
        if (runner === me) traffic.elsewhere.delete(record.id);
        else traffic.elsewhere.add(record.id);
      }
      for (const { id, handovers, hit } of message.gone) {
        if (hit) hits.set(id, Math.max(handovers, hits.get(id) ?? 0));
        const each = known.get(id);
        if (!each || handovers < each.handovers) continue;
        traffic.remove(id);
        known.delete(id);
      }
    },

    /**
     * Whenever the players in the world change, with every one's id, this player's own included: of the vehicles a
     * player who has gone ran, this player takes those it is nearest of everyone still here who could hold them.
     */
    players(present: ReadonlySet<string>): void {
      const me = self();
      const places = link.places();
      const claimed: TrafficVehicle[] = [];
      for (const [id, each] of known) {
        if (each.runner === me || each.runner === ALONE || present.has(each.runner)) continue;
        const car = traffic.get(id);
        if (!car) continue;
        let nearest = { peer: me, off: places.has(me) ? distance(car, places.get(me) ?? [0, 0, 0]) : Infinity };
        for (const [peer, at] of places) {
          const off = distance(car, at);
          if (peer !== me && present.has(peer) && off < link.edgeM(car.kind) && off < nearest.off) nearest = { peer, off };
        }
        if (nearest.peer !== me) continue;
        each.runner = me;
        each.handovers++;
        each.nearer = null;
        traffic.elsewhere.delete(id);
        claimed.push(vehicleOf(car, each, null));
      }
      if (claimed.length > 0) link.send({ vehicles: claimed, gone: [] });
    },

    /**
     * A vehicle this player's car hit, as it's taken out of the traffic: gone from everyone's, and the handovers its
     * computer-driven car starts from, which its record carries if it comes back.
     */
    hit(id: string): number {
      const handovers = (known.get(id)?.handovers ?? 0) + 1;
      known.delete(id);
      hits.set(id, handovers);
      link.send({ vehicles: [], gone: [{ id, handovers, hit: true }] });
      return handovers;
    },

    /** A hit car this player ran back on its lane, with the handovers it was hit at: newer than any message from before. */
    rejoined(car: LaneCar, hitAt: number): void {
      const each: Known = { runner: self(), handovers: Math.max(hitAt, hits.get(car.id) ?? 0) + 1, nearer: null, sentTo: false };
      hits.delete(car.id);
      known.set(car.id, each);
      link.send({ vehicles: [vehicleOf(car, each, null)], gone: [] });
    },

    /** Sends every vehicle this player runs at once, for a test to compare pages by; how many. */
    flush(): number {
      const me = self();
      const vehicles = [...traffic.all()].filter((car) => knownOf(car).runner === me).map((car) => vehicleOf(car, knownOf(car), null));
      link.send({ vehicles, gone: [] });
      return vehicles.length;
    },

    /** Who runs each vehicle, for the probe. */
    runners(): Map<string, { runner: string; handovers: number }> {
      return new Map([...known].map(([id, { runner, handovers }]) => [id, { runner, handovers }]));
    },
  };
}

export type SharedTraffic = ReturnType<typeof createSharedTraffic>;

/**
 * A traffic car hit out of the traffic, as a computer-driven car's driver's record: the world car it was, how long it
 * has stood still, and the handovers it was hit at, which its record carries back into the traffic.
 */
export interface HitDriver {
  kind: "hit";
  model: number;
  seed: number;
  stoppedS: number;
  hitAt: number;
}

export function parseHitDriver(value: Record<string, unknown>): HitDriver {
  const { kind, model, seed, stoppedS, hitAt } = value;
  const whole = (each: unknown): each is number => typeof each === "number" && Number.isInteger(each) && each >= 0;
  if (kind !== "hit" || !whole(model) || !whole(seed) || !whole(hitAt) || typeof stoppedS !== "number" || !Number.isFinite(stoppedS) || stoppedS < 0) {
    throw new Error(`not a hit car's driver's record: ${JSON.stringify(value)}`);
  }
  return { kind, model, seed, stoppedS, hitAt };
}
