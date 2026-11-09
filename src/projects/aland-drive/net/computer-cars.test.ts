import { describe, expect, it } from "vitest";
import type { CarState, Vector3 } from "../sim/car-state";
import { createComputerCars, FIGHT_M, NEARER_FOR_STEPS, type ComputerCars } from "./computer-cars";
import { SEND_EVERY_STEPS } from "./online-world";
import type { ComputerCarMessage } from "./protocol";

const at = (x: number): CarState => ({ position: [x, 0, 0], rotation: [0, 0, 0, 1], velocity: [0, 0, 0], spin: [0, 0, 0], car: "skerry-gt", steer: 0, suspension: [0, 0, 0, 0], roll: [0, 0, 0, 0], lamps: { head: true, brake: false, reverse: false } });

interface Client {
  cars: ComputerCars;
  /** Where each player's car is, as this client has it. */
  places: Map<string, Vector3>;
}

/** Players who hear each other's computer-driven cars once `flush` delivers them, in order. */
function createPlayers(ids: string[], host = ids[0], mayRun?: (car: ComputerCarMessage, peer: string) => boolean | null) {
  const clients = new Map<string, Client>();
  const queue: (() => void)[] = [];
  for (const id of ids) {
    const places = new Map<string, Vector3>();
    const cars = createComputerCars({
      selfId: () => id,
      hosts: () => id === host,
      places: () => places,
      send: (car: ComputerCarMessage) => {
        const copy = structuredClone(car);
        for (const [other, client] of clients) if (other !== id) queue.push(() => client.cars.hear(id, copy));
        return true;
      },
      onHeard: () => undefined,
      onGone: () => undefined,
      mayRun,
    });
    clients.set(id, { cars, places });
  }
  const client = (id: string) => {
    const found = clients.get(id);
    if (!found) throw new Error(`no player ${id}`);
    return found;
  };
  return {
    client,
    /** Every client has every player's car where it's given. */
    place(players: Record<string, number>): void {
      for (const each of clients.values()) for (const [id, x] of Object.entries(players)) each.places.set(id, [x, 0, 0]);
    },
    /** Frames of a send's worth of steps on every client, delivering what each sends. */
    frames(count: number): void {
      for (let frame = 0; frame < count; frame++) {
        for (const each of clients.values()) each.cars.step(SEND_EVERY_STEPS);
        while (queue.length > 0) queue.shift()?.();
      }
    },
    leave(id: string): void {
      clients.delete(id);
    },
  };
}

const runnerOf = (cars: ComputerCars, id = "car") => cars.all().find((car) => car.id === id)?.runner;
const FRAMES_TO_HAND_ON = Math.ceil(NEARER_FOR_STEPS / SEND_EVERY_STEPS);

describe("computer-driven cars online", () => {
  it("are handed on to a player clearly nearer, once they've been nearer for a moment, and everyone hears who runs them", () => {
    const players = createPlayers(["a", "b"]);
    players.place({ a: -60, b: 20 });
    players.client("a").cars.add("car", at(0), { along: 0 });
    players.frames(FRAMES_TO_HAND_ON - 1);
    expect(runnerOf(players.client("b").cars)).toBe("a");

    players.frames(1);
    for (const id of ["a", "b"]) expect(runnerOf(players.client(id).cars)).toBe("b");
    expect(players.client("b").cars.running().map((car) => [car.id, car.handovers, car.driver])).toEqual([["car", 1, { along: 0 }]]);
    expect(players.client("a").cars.running()).toEqual([]);
  });

  it("stay with whoever runs them when another player is only a little nearer", () => {
    const players = createPlayers(["a", "b"]);
    players.place({ a: -22, b: 20 });
    players.client("a").cars.add("car", at(0), {});
    players.frames(FRAMES_TO_HAND_ON * 3);
    expect(runnerOf(players.client("b").cars)).toBe("a");
  });

  it("stay with whoever runs them in a fight, and pass on once it's over", () => {
    const players = createPlayers(["a", "b"]);
    players.place({ a: -60, b: FIGHT_M - 1 });
    players.client("a").cars.add("car", at(0), {});
    players.frames(FRAMES_TO_HAND_ON * 3);
    expect(runnerOf(players.client("b").cars)).toBe("a");

    players.place({ a: -60, b: FIGHT_M + 1 });
    players.frames(FRAMES_TO_HAND_ON);
    expect(runnerOf(players.client("b").cars)).toBe("b");
  });

  it("count a fight with another computer-driven car", () => {
    const players = createPlayers(["a", "b"]);
    players.place({ a: -60, b: 20 });
    players.client("a").cars.add("car", at(0), {});
    players.client("a").cars.add("rival", at(FIGHT_M - 1), {});
    players.frames(FRAMES_TO_HAND_ON * 3);
    expect(runnerOf(players.client("b").cars)).toBe("a");
  });

  it("ignore a state sent before a handover that arrives after it", () => {
    const players = createPlayers(["a", "b"]);
    const b = players.client("b").cars;
    b.hear("a", { id: "car", runner: "b", handovers: 1, state: at(5), driver: {} });
    b.hear("a", { id: "car", runner: "a", handovers: 0, state: at(-30), driver: {} });
    expect(b.running().map((car) => car.state.position[0])).toEqual([5]);
  });

  it("taken by two players at once, as when both hit one traffic car, stay with the lower id on both", () => {
    const players = createPlayers(["a", "b"]);
    players.place({ a: -3, b: 3 });
    players.client("b").cars.add("car", at(0), {});
    players.client("a").cars.add("car", at(0.5), {});
    players.frames(1);
    for (const id of ["a", "b"]) expect(runnerOf(players.client(id).cars)).toBe("a");
    expect(players.client("b").cars.running()).toEqual([]);
  });

  it("taken out of the world by whoever runs them, go for everyone", () => {
    const players = createPlayers(["a", "b"]);
    players.place({ a: 0, b: 30 });
    players.client("a").cars.add("car", at(10), {});
    players.frames(1);
    expect(players.client("b").cars.all()).toHaveLength(1);
    players.client("a").cars.remove("car");
    players.frames(1);
    expect(players.client("b").cars.all()).toEqual([]);
  });

  it("are handed on by the host to the player nearest them when their runner leaves", () => {
    const players = createPlayers(["h", "a", "b"]);
    players.place({ h: -200, a: 0, b: 30 });
    players.client("a").cars.add("car", at(10), {});
    players.frames(1);
    players.leave("a");
    players.client("h").cars.players(new Set(["h", "b"]));
    players.frames(1);
    for (const id of ["h", "b"]) expect(runnerOf(players.client(id).cars)).toBe("b");
    expect(players.client("b").cars.running().map((car) => car.handovers)).toEqual([1]);
  });

  describe("that only some players may run, as a race's racers", () => {
    /** Who is in the race, as every client has heard it; anyone else is out of it. */
    const inRace = (racing: Set<string>, unknown = new Set<string>()) => (_car: ComputerCarMessage, peer: string) => (unknown.has(peer) ? null : racing.has(peer));

    it("are handed only to a player who may run them, never to a nearer one driving past", () => {
      const players = createPlayers(["a", "b", "c"], "a", inRace(new Set(["a", "b"])));
      players.place({ a: -60, b: 30, c: 15 });
      players.client("a").cars.add("car", at(0), {});
      players.frames(FRAMES_TO_HAND_ON * 3);
      for (const id of ["a", "b", "c"]) expect(runnerOf(players.client(id).cars)).toBe("b");
    });

    it("pass from a runner who left the race to the nearest player still in it", () => {
      const racing = new Set(["a", "b", "c"]);
      const players = createPlayers(["h", "a", "b", "c"], "h", inRace(racing));
      players.place({ h: 5, a: 0, b: 30, c: 60 });
      players.client("h").cars.players(new Set(["h", "a", "b", "c"]));
      players.client("a").cars.add("car", at(10), {});
      players.frames(1);
      racing.delete("a");
      players.frames(1);
      for (const id of ["h", "a", "b", "c"]) expect(runnerOf(players.client(id).cars)).toBe("b");
    });

    it("stay with a runner whose word on the race is still on the wire", () => {
      const players = createPlayers(["h", "a"], "h", inRace(new Set(), new Set(["a"])));
      players.place({ h: 0, a: 0 });
      players.client("h").cars.players(new Set(["h", "a"]));
      players.client("a").cars.add("car", at(10), {});
      players.frames(3);
      expect(runnerOf(players.client("h").cars)).toBe("a");
    });

    it("go out of the world when no one left may run them, and a state still on the wire doesn't bring them back", () => {
      const racing = new Set(["a"]);
      const players = createPlayers(["h", "a"], "h", inRace(racing));
      players.place({ h: 0, a: 0 });
      players.client("h").cars.players(new Set(["h", "a"]));
      const a = players.client("a").cars;
      a.add("car", at(10), {});
      players.frames(1);
      const late = structuredClone(a.all()[0]);
      racing.delete("a");
      players.frames(2);
      for (const id of ["h", "a"]) expect(players.client(id).cars.all()).toEqual([]);
      players.client("h").cars.hear("a", late);
      expect(players.client("h").cars.all()).toEqual([]);
    });

    it("let go by a runner leaving the race, go at once to the nearest player still in it", () => {
      const racing = new Set(["a", "b", "c"]);
      const players = createPlayers(["a", "b", "c"], "a", inRace(racing));
      players.place({ a: 0, b: 50, c: 20 });
      players.client("a").cars.add("car", at(10), {});
      racing.delete("a");
      players.client("a").cars.letGo("car");
      players.frames(1);
      for (const id of ["a", "b", "c"]) expect(runnerOf(players.client(id).cars)).toBe("c");
    });
  });
});
