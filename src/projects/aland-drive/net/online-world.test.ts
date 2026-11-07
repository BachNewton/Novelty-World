import { describe, expect, it } from "vitest";
import type { Player, RoomEvents, RoomState } from "@/shared/lib/peer";
import type { CarState } from "../sim/car-state";
import { createOnlineWorld, SEND_EVERY_STEPS, type OnlineWorld } from "./online-world";
import type { ChallengeMessage, ComputerCarMessage, GuestMessage, HostMessage, SharedDestination } from "./protocol";

type Events = RoomEvents<HostMessage, GuestMessage>;

const STATE: CarState = { position: [10, 2, -30], rotation: [0, 0, 0, 1], velocity: [5, 0, -12], spin: [0, 0.3, 0], car: "skerry-gt", steer: 0.1, suspension: [0.1, 0.1, 0.1, 0.1], roll: 3, lamps: { head: true, brake: true, reverse: false } };
const player = (peerId: string): Player => ({ id: `profile-${peerId}`, name: peerId, peerId });

interface Client {
  world: OnlineWorld;
  /** What this client heard: each other car's last state, by peer id. */
  cars: Map<string, CarState>;
  others: string[];
  /** Challenge messages heard, each with who sent it. */
  challenges: { from: string; message: ChallengeMessage }[];
  /** Computer-driven cars heard, each with who sent it. */
  computerCars: { from: string; car: ComputerCarMessage }[];
  /** The room's destination as last heard. */
  destination: SharedDestination | null;
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
    const client: Client = { world: null as unknown as OnlineWorld, cars: new Map(), others: [], challenges: [], computerCars: [], destination: null };
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
          sendTo(to, message) {
            sent++;
            const copy = structuredClone(message);
            queue.push(() => nodes.get(to)?.onHostMessage?.(copy));
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
        onCar: (peerId, carState) => client.cars.set(peerId, carState),
        onGone: (peerId) => client.cars.delete(peerId),
        onPlayers: (others) => {
          client.others = others.map((other) => other.peerId);
        },
        onChallenge: (from, message) => client.challenges.push({ from, message }),
        onComputerCar: (from, car) => client.computerCars.push({ from, car }),
        onDestination: (destination) => {
          client.destination = destination;
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
    /** The host goes and its guests are reconnecting: `reclaim` ends it. */
    loseHostQuietly(): void {
      nodes.delete(host);
      queue.length = 0;
      for (const id of guests) nodes.get(id)?.onState?.({ status: "reconnecting", role: null, code: "island", selfId: null, players: [] });
    },
    reclaim(): void {
      host = guests.shift() ?? "";
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
const drive = (client: Client, steps = SEND_EVERY_STEPS, at: CarState = STATE) => client.world.send(steps, at);

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

    // Put somewhere while paused, it's sent again where it is now.
    a.world.send(0, { ...STATE, position: [40, 2, -30] }, true);
    expect(star.sent()).toBe(before + 3);
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

    b.world.send(1, { ...STATE, position: [99, 2, -30] });
    star.flush();
    expect(a.cars.get("b")?.position).toEqual([99, 2, -30]);
  });

  it("hands a challenge message to the one player it's for, through the host, naming who it's from", () => {
    const star = createStar();
    const host = star.join("h");
    const a = star.join("a");
    const b = star.join("b");
    const retry: ChallengeMessage = { type: "retry", challenge: "c", attempt: 2 };
    a.world.sendChallenge("b", retry);
    b.world.sendChallenge("h", { ...retry, type: "ready" });
    host.world.sendChallenge("a", { ...retry, type: "ready" });
    star.flush();
    expect(b.challenges).toEqual([{ from: "a", message: retry }]);
    expect(host.challenges).toEqual([{ from: "b", message: { ...retry, type: "ready" } }]);
    expect(a.challenges).toEqual([{ from: "h", message: { ...retry, type: "ready" } }]);
  });

  it("hands one for everyone to everyone else", () => {
    const star = createStar();
    const host = star.join("h");
    const a = star.join("a");
    const b = star.join("b");
    const start: ChallengeMessage = { type: "start", challenge: "c", attempt: 1, partner: "b" };
    a.world.sendChallenge(null, start);
    star.flush();
    for (const client of [host, b]) expect(client.challenges).toEqual([{ from: "a", message: start }]);
    expect(a.challenges).toEqual([]);
  });

  it("hands a computer-driven car's state from the player running it to everyone else, naming who sent it", () => {
    const star = createStar();
    const host = star.join("h");
    const a = star.join("a");
    const b = star.join("b");
    const car = { id: "car", runner: "a", handovers: 2, state: STATE, driver: { along: 4 } };
    expect(a.world.sendComputerCar(car)).toBe(true);
    star.flush();
    for (const client of [host, b]) expect(client.computerCars).toEqual([{ from: "a", car }]);
    expect(a.computerCars).toEqual([]);
  });

  it("keeps a challenge message sent while the world reconnects, and sends it once it's back", () => {
    const star = createStar();
    star.join("h");
    const a = star.join("a");
    const b = star.join("b");
    star.flush();
    // The host goes, and before the room is claimed again b retries.
    star.loseHostQuietly();
    b.world.sendChallenge("a", { type: "retry", challenge: "c", attempt: 4 });
    star.reclaim();
    star.flush();
    expect(a.challenges).toEqual([{ from: "b", message: { type: "retry", challenge: "c", attempt: 4 } }]);
  });

  it("settles two destinations picked at once on the same one for everyone, the one the host heard last", () => {
    const star = createStar();
    const host = star.join("h");
    const a = star.join("a");
    const b = star.join("b");
    a.world.sendDestination({ x: 1, z: 2 });
    b.world.sendDestination({ x: 3, z: 4 });
    star.flush();
    const settled = { point: { x: 3, z: 4 }, setter: "b", name: "b" };
    for (const client of [host, a, b]) expect(client.destination).toEqual(settled);
    host.world.sendDestination(null);
    star.flush();
    for (const client of [host, a, b]) expect(client.destination).toEqual({ point: null, setter: "h", name: "h" });
  });

  it("hands the destination to a player who arrives later, even after the host who settled it has gone", () => {
    const star = createStar();
    star.join("h");
    const a = star.join("a");
    star.join("b");
    a.world.sendDestination({ x: 5, z: 6 });
    star.flush();
    const late = star.join("late");
    star.flush();
    expect(late.destination).toEqual({ point: { x: 5, z: 6 }, setter: "a", name: "a" });
    star.loseHost();
    const later = star.join("later");
    star.flush();
    expect(later.destination).toEqual({ point: { x: 5, z: 6 }, setter: "a", name: "a" });
  });
});
