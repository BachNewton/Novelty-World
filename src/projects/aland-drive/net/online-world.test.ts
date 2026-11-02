import { describe, expect, it } from "vitest";
import type { Player, RoomEvents, RoomState } from "@/shared/lib/peer";
import type { CarState } from "../sim/car-state";
import { createOnlineWorld, SEND_EVERY_STEPS, type OnlineWorld } from "./online-world";
import type { GuestMessage, HostMessage } from "./protocol";

type Events = RoomEvents<HostMessage, GuestMessage>;

const STATE: CarState = { position: [10, 2, -30], rotation: [0, 0, 0, 1], velocity: [5, 0, -12], spin: [0, 0.3, 0], steer: 0.1, suspension: [0.1, 0.1, 0.1, 0.1], roll: 3 };
const player = (peerId: string): Player => ({ id: `profile-${peerId}`, name: peerId, peerId });

interface Client {
  world: OnlineWorld;
  /** What this client heard: each other car's last state, by peer id. */
  cars: Map<string, CarState>;
  others: string[];
}

/** An in-memory star: sends queue up and are delivered in order by `flush`, as over the relay. */
function createStar() {
  const nodes = new Map<string, Events>();
  const clients = new Map<string, Client>();
  let host = "";
  const guests: string[] = [];
  const queue: (() => void)[] = [];
  let sent = 0;

  const state = (id: string): RoomState => ({ status: "connected", role: id === host ? "host" : "guest", code: "island", selfId: id, players: [host, ...guests].map(player) });
  const announce = () => {
    for (const id of [host, ...guests]) nodes.get(id)?.onState?.(state(id));
  };

  function add(id: string): Client {
    const client: Client = { world: null as unknown as OnlineWorld, cars: new Map(), others: [] };
    client.world = createOnlineWorld(
      (events) => {
        nodes.set(id, events);
        return {
          start() {},
          stop() {},
          sendToHost(message) {
            sent++;
            const copy = structuredClone(message);
            queue.push(() => nodes.get(host)?.onGuestMessage?.(player(id), copy));
          },
          broadcast(message, except) {
            sent++;
            for (const guest of guests.filter((g) => g !== except && g !== id)) {
              const copy = structuredClone(message);
              queue.push(() => nodes.get(guest)?.onHostMessage?.(copy));
            }
          },
        };
      },
      {
        onCar: (peerId, _car, carState) => client.cars.set(peerId, carState),
        onGone: (peerId) => client.cars.delete(peerId),
        onPlayers: (others) => {
          client.others = others.map((other) => other.peerId);
        },
      },
    );
    clients.set(id, client);
    return client;
  }

  return {
    join(id: string): Client {
      const client = add(id);
      if (host === "") host = id;
      else guests.push(id);
      announce();
      return client;
    },
    leave(id: string): void {
      guests.splice(guests.indexOf(id), 1);
      nodes.delete(id);
      announce();
    },
    /** The host goes: its guests reconnect, and the first claims the room again. */
    loseHost(): void {
      nodes.delete(host);
      queue.length = 0;
      for (const id of guests) nodes.get(id)?.onState?.({ status: "reconnecting", role: null, code: "island", selfId: null, players: [] });
      host = guests.shift() ?? "";
      announce();
    },
    flush(): void {
      while (queue.length > 0) queue.shift()?.();
    },
    sent: () => sent,
  };
}

/** A frame in which the car stepped this many times. */
const drive = (client: Client, steps = SEND_EVERY_STEPS, at: CarState = STATE) => client.world.send(steps, "Skerry GT", at);

describe("the online world", () => {
  it("hands every car to everyone else through the host, and nobody hears their own", () => {
    const star = createStar();
    const host = star.join("h");
    const a = star.join("a");
    const b = star.join("b");
    for (const client of [host, a, b]) drive(client);
    star.flush();
    expect([...host.cars.keys()].sort()).toEqual(["a", "b"]);
    expect([...a.cars.keys()].sort()).toEqual(["b", "h"]);
    expect([...b.cars.keys()].sort()).toEqual(["a", "h"]);
    expect(a.cars.get("b")?.position).toEqual(STATE.position);
  });

  it("sends 20 times a second, and once when paused, with the car standing still", () => {
    const star = createStar();
    star.join("h");
    const a = star.join("a");
    drive(a);
    const before = star.sent();
    for (let frame = 0; frame < SEND_EVERY_STEPS; frame++) drive(a, 1);
    expect(star.sent()).toBe(before + 1);

    drive(a, 0);
    drive(a, 0);
    expect(star.sent()).toBe(before + 2);
  });

  it("a player who arrives while someone is paused still sees their car", () => {
    const star = createStar();
    const host = star.join("h");
    drive(host, 0);
    const late = star.join("a");
    drive(host, 0);
    star.flush();
    expect(late.cars.get("h")?.velocity).toEqual([0, 0, 0]);
  });

  it("a player who leaves is gone for everyone", () => {
    const star = createStar();
    const host = star.join("h");
    const a = star.join("a");
    const b = star.join("b");
    for (const client of [host, a, b]) drive(client);
    star.flush();
    star.leave("a");
    expect(host.cars.has("a")).toBe(false);
    expect(b.cars.has("a")).toBe(false);
    expect(b.others).toEqual(["h"]);
  });

  it("when the host goes, the rest keep the world and carry on seeing each other", () => {
    const star = createStar();
    const host = star.join("h");
    const a = star.join("a");
    const b = star.join("b");
    for (const client of [host, a, b]) drive(client);
    star.flush();
    star.loseHost();
    expect([...a.cars.keys()]).toEqual(["b"]);
    expect([...b.cars.keys()]).toEqual(["a"]);

    b.world.send(1, "Skerry GT", { ...STATE, position: [99, 2, -30] });
    star.flush();
    expect(a.cars.get("b")?.position).toEqual([99, 2, -30]);
  });
});
