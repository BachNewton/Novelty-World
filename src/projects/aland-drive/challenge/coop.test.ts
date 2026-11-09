import { describe, expect, it } from "vitest";
import type { ChallengeMessage } from "../net/protocol";
import type { CarId } from "../sim/cars";
import { CoopLink, type CoopNotice } from "./coop";
import { COUNTDOWN_S } from "./run";
import { ChallengeSession } from "./session";
import type { Gate, RouteChallenge } from "./types";

/*
 * Two or three clients' co-op links over an in-memory world: every send queues,
 * and `flush` delivers in order, as the relay does. A straight road east along
 * z = 0, the finish 100 m from the start; east is a heading of -π/2.
 */

const EAST = -Math.PI / 2;
const finish: Gate = { x: 100, z: 0, heading: EAST, halfWidthM: 10 };
const ROUTE: RouteChallenge = {
  id: "route",
  title: "",
  car: "sten",
  where: "",
  waypoints: [],
  starts: [{ x: 0, z: 2, heading: EAST }, { x: 0, z: -2, heading: EAST }],
  lengthM: 100,
  kind: "route",
  gates: [finish],
  parS: 60,
  targetS: 60,
  conditions: { date: { year: 2026, month: 7, day: 1 }, hour: 12, weather: "clear" },
};

interface Client {
  id: string;
  link: CoopLink;
  session: () => ChallengeSession | null;
  car: () => CarId;
  /** Where the car was last put, by seat's place. */
  placedAt: () => number | null;
  notices: CoopNotice[];
  overs: number;
  /** Lets a placing that waits for a load land. */
  land: () => void;
  /** Makes this player unable to start one, as the map or a jump does. */
  block: (blocked: boolean) => void;
}

function createWorld() {
  const queue: (() => void)[] = [];
  const clients = new Map<string, Client>();
  const deliver = (from: string, to: string, message: ChallengeMessage) => {
    const copy = structuredClone(message);
    queue.push(() => clients.get(to)?.link.hear(from, copy));
  };

  function add(id: string, { loads = false } = {}): Client {
    let car: CarId = "skerry-gt";
    let session: ChallengeSession | null = null;
    let placedAt: number | null = null;
    const landing: (() => void)[] = [];
    const notices: CoopNotice[] = [];
    let overs = 0;
    let blocked = false;
    const link: CoopLink = new CoopLink({
      send: (to, message) => {
        for (const other of clients.keys()) if (other !== id && (to === null || to === other)) deliver(id, other, message);
      },
      selfId: () => id,
      free: () => session === null && !blocked,
      challengeById: (wanted) => (wanted === ROUTE.id ? ROUTE : null),
      begin: (challenge, seat) => {
        session = new ChallengeSession(
          challenge,
          {
            carId: () => car,
            setCar: (next) => {
              car = next;
            },
            placeAt: (place, done) => {
              const put = () => {
                placedAt = challenge.starts.indexOf(place);
                done();
              };
              if (loads) landing.push(put);
              else put();
            },
            showRoute: () => undefined,
            onOver: () => {
              overs++;
            },
            onRetry: (attempt) => link.retried(attempt),
            onReady: (attempt) => link.ready(attempt),
            onResult: (attempt, result) => link.result(attempt, result),
            onLost: (attempt, results) => link.lost(attempt, results),
          },
          seat,
          2,
        );
        return session;
      },
      end: (notice) => {
        session?.leave();
        session = null;
        notices.push(notice);
      },
      notice: (notice) => notices.push(notice),
    });
    const client: Client = {
      id,
      link,
      session: () => session,
      car: () => car,
      placedAt: () => placedAt,
      notices,
      get overs() {
        return overs;
      },
      land: () => landing.shift()?.(),
      block: (next) => {
        blocked = next;
      },
    };
    clients.set(id, client);
    tellPlayers();
    return client;
  }

  /** Everyone hears the world's list of players, as the online world says it whenever it changes. */
  function tellPlayers(): void {
    for (const client of clients.values()) client.link.players(new Set([...clients.keys()].filter((other) => other !== client.id)));
  }

  return {
    add,
    flush: () => {
      while (queue.length > 0) queue.shift()?.();
    },
    /** A player drops out of the world: everyone else's list no longer has them. */
    drop: (id: string) => {
      clients.delete(id);
      tellPlayers();
    },
  };
}

/** Two clients paired on the route, the first the inviter. */
function paired({ aLoads = false, bLoads = false } = {}) {
  const world = createWorld();
  const a = world.add("a", { loads: aLoads });
  const b = world.add("b", { loads: bLoads });
  a.link.inviteAll(ROUTE);
  world.flush();
  b.link.accept("a");
  world.flush();
  return { world, a, b };
}

const at = (x: number, z = 2) => ({ x, z, speedMS: 20 });
const sessionOf = (client: Client) => client.session() ?? (() => { throw new Error(`${client.id} has no session`); })();

describe("pairing", () => {
  it("puts the inviter in seat 0 and the one who joins in seat 1, each on their own place in the challenge's car", () => {
    const { a, b } = paired();
    expect(sessionOf(a).seat).toBe(0);
    expect(sessionOf(b).seat).toBe(1);
    expect([a.placedAt(), b.placedAt()]).toEqual([0, 1]);
    expect([a.car(), b.car()]).toEqual(["sten", "sten"]);
  });

  it("asks everyone in the world, and whoever arrives while the invite is open", () => {
    const world = createWorld();
    const a = world.add("a");
    const b = world.add("b");
    const c = world.add("c");
    a.link.inviteAll(ROUTE);
    world.flush();
    for (const client of [b, c]) expect(client.link.invite).toEqual({ peer: "a", challenge: ROUTE });
    const d = world.add("d");
    world.flush();
    expect(d.link.invite).toEqual({ peer: "a", challenge: ROUTE });
  });

  it("gives the seat to the first accept heard, withdraws every other invite at once, and tells a second joiner it was taken", () => {
    const world = createWorld();
    const a = world.add("a");
    const b = world.add("b");
    const c = world.add("c");
    const d = world.add("d");
    a.link.inviteAll(ROUTE);
    world.flush();
    // b and c both join before either hears of the other; d lets it pass.
    b.link.accept("a");
    c.link.accept("a");
    world.flush();
    expect(sessionOf(a).seat).toBe(0);
    expect(sessionOf(b).seat).toBe(1);
    expect(c.session()).toBeNull();
    expect(c.link.now.kind).toBe("free");
    expect(c.notices).toEqual([{ kind: "taken", peer: "a", partner: "b" }]);
    for (const client of [c, d]) {
      expect(client.link.invite).toBeNull();
      expect(client.link.busy("a")).toBe(true);
      expect(client.link.busy("b")).toBe(true);
    }
    // d never answered: its invite goes without anything to tell.
    expect(d.notices).toEqual([{ kind: "expired", peer: "a" }]);
  });

  it("holds an invite unseen while paired, to answer once that challenge is over", () => {
    const { world, a, b } = paired();
    const c = world.add("c");
    c.link.inviteAll(ROUTE);
    world.flush();
    expect(a.link.now.kind).toBe("paired");
    expect(a.link.invite).toEqual({ peer: "c", challenge: ROUTE });
    a.link.leave();
    world.flush();
    for (const client of [a, b]) expect(client.link.invite).toEqual({ peer: "c", challenge: ROUTE });
    expect(c.link.busy("a")).toBe(false);
    b.link.accept("c");
    world.flush();
    expect(sessionOf(c).seat).toBe(0);
    expect(sessionOf(b).seat).toBe(1);
  });

  it("drops an invite everywhere once its inviter takes it back or leaves the world", () => {
    const world = createWorld();
    const a = world.add("a");
    const b = world.add("b");
    const c = world.add("c");
    a.link.inviteAll(ROUTE);
    world.flush();
    a.link.withdraw();
    world.flush();
    for (const client of [b, c]) expect(client.link.invite).toBeNull();
    c.link.inviteAll(ROUTE);
    world.flush();
    expect(b.link.invite).toEqual({ peer: "c", challenge: ROUTE });
    world.drop("c");
    expect(b.link.invite).toBeNull();
  });

  it("answers the newest of several invites, and an older one stays until it's let pass", () => {
    const world = createWorld();
    const a = world.add("a");
    const b = world.add("b");
    const c = world.add("c");
    a.link.inviteAll(ROUTE);
    c.link.inviteAll(ROUTE);
    world.flush();
    expect(b.link.invite?.peer).toBe("c");
    b.link.decline("c");
    expect(b.link.invite?.peer).toBe("a");
    // The inviter isn't told of a decline: it asks on.
    expect(c.link.now.kind).toBe("inviting");
  });

  it("starts nothing for an invite taken back while its accept was on the way", () => {
    const world = createWorld();
    const a = world.add("a");
    const b = world.add("b");
    a.link.inviteAll(ROUTE);
    world.flush();
    b.link.accept("a");
    a.link.withdraw();
    world.flush();
    expect(a.session()).toBeNull();
    expect(b.session()).toBeNull();
    expect(b.link.now.kind).toBe("free");
    expect(b.notices).toEqual([{ kind: "withdrawn", peer: "a" }]);
  });

  it("withdraws the invite from everyone when an accept comes while the inviter can't start", () => {
    const world = createWorld();
    const a = world.add("a");
    const b = world.add("b");
    const c = world.add("c");
    a.link.inviteAll(ROUTE);
    world.flush();
    // a has opened the map by the time b's accept lands.
    b.link.accept("a");
    a.block(true);
    world.flush();
    expect(a.link.now.kind).toBe("free");
    expect(a.notices).toEqual([{ kind: "withdrawn", peer: "b" }]);
    expect(b.link.now.kind).toBe("free");
    expect(b.notices).toEqual([{ kind: "withdrawn", peer: "a" }]);
    expect(c.link.invite).toBeNull();
  });
});

describe("the synced start", () => {
  it("holds the lights until both cars are on their places, and the countdown runs from that moment on each client", () => {
    const { world, a, b } = paired({ bLoads: true });
    // a is on its place; b's start is still loading, so a waits on the line with its clock still.
    sessionOf(a).step(COUNTDOWN_S, at(0));
    expect(sessionOf(a).phase).toBe("waiting");
    expect(sessionOf(a).holdsCar()).toBe(true);
    expect(sessionOf(a).run.clockS).toBe(-COUNTDOWN_S);
    // b's car lands. b has heard a's ready already, so its own lights start at once; a's once b's ready reaches it.
    b.land();
    expect(sessionOf(b).phase).toBe("countdown");
    expect(sessionOf(a).phase).toBe("waiting");
    world.flush();
    expect(sessionOf(a).phase).toBe("countdown");
    sessionOf(a).step(COUNTDOWN_S, at(0));
    expect(sessionOf(a).phase).toBe("running");
  });
});

describe("the synced retry", () => {
  it("takes both cars back for the attempt either player asks for", () => {
    const { world, a, b } = paired();
    world.flush();
    sessionOf(a).step(COUNTDOWN_S + 5, at(0));
    expect(sessionOf(a).retry()).toBe(true);
    world.flush();
    expect(sessionOf(a).run.attempt).toBe(2);
    expect(sessionOf(b).run.attempt).toBe(2);
    expect(sessionOf(b).phase).toBe("countdown");
    expect(sessionOf(a).phase).toBe("countdown");
  });

  it("gives one attempt for two retries at once, and drops a retry for an attempt already under way", () => {
    const { world, a, b } = paired();
    world.flush();
    // Both press before either hears the other.
    expect(sessionOf(a).retry()).toBe(true);
    expect(sessionOf(b).retry()).toBe(true);
    world.flush();
    expect([sessionOf(a).run.attempt, sessionOf(b).run.attempt]).toEqual([2, 2]);
    expect([sessionOf(a).phase, sessionOf(b).phase]).toEqual(["countdown", "countdown"]);
    expect(sessionOf(a).follow(2)).toBe(false);
    expect(sessionOf(a).follow(1)).toBe(false);
  });

  it("puts the car down once for a retry heard while it's still on its way to the line, ready for the newer attempt", () => {
    const { world, a, b } = paired({ aLoads: true });
    world.flush();
    a.land();
    world.flush();
    // b retries, and a's car goes back by a load; b retries again before it's down.
    expect(sessionOf(b).retry()).toBe(true);
    world.flush();
    expect(sessionOf(a).phase).toBe("placing");
    expect(sessionOf(b).retry()).toBe(true);
    world.flush();
    expect(sessionOf(a).run.attempt).toBe(3);
    expect(sessionOf(a).phase).toBe("placing");
    expect(sessionOf(b).phase).toBe("waiting");
    // One landing, and it serves attempt 3: both count down.
    a.land();
    expect(sessionOf(a).phase).toBe("countdown");
    world.flush();
    expect(sessionOf(b).phase).toBe("countdown");
    expect(sessionOf(b).run.attempt).toBe(3);
  });
});

describe("results", () => {
  it("pass on the average for both, each client measuring only its own car", () => {
    const { world, a, b } = paired();
    world.flush();
    for (const client of [a, b]) sessionOf(client).step(COUNTDOWN_S, at(0, client === a ? 2 : -2));
    // a finishes in 40 s; b, slower than the target alone, in 75.
    sessionOf(a).step(40, at(100.01));
    world.flush();
    expect(sessionOf(b).run.players[0].result).toBeCloseTo(40, 1);
    sessionOf(b).step(75, at(100.01, -2));
    world.flush();
    for (const client of [a, b]) {
      expect(sessionOf(client).run.outcome?.passed).toBe(true);
      expect(sessionOf(client).run.outcome?.average).toBeCloseTo(57.5, 1);
      expect(client.overs).toBe(1);
    }
  });

  it("is lost by the client still timing a player, and ends the same way on the other", () => {
    const { world, a, b } = paired();
    world.flush();
    for (const client of [a, b]) sessionOf(client).step(COUNTDOWN_S, at(0));
    sessionOf(a).step(50, at(100.01));
    world.flush();
    // a has finished, so a's own clock says nothing about b: a waits however long it runs.
    sessionOf(a).step(100, at(120));
    expect(sessionOf(a).run.outcome).toBeNull();
    // On b's clock, (50 + 71) / 2 is over 60.
    sessionOf(b).step(71, at(60, -2));
    expect(sessionOf(b).run.outcome?.passed).toBe(false);
    world.flush();
    expect(sessionOf(a).run.outcome).toEqual(sessionOf(b).run.outcome);
  });
});

describe("leaving", () => {
  it("by either player ends it for the other, and both have their cars back", () => {
    const { world, a, b } = paired();
    a.link.leave();
    sessionOf(a).leave();
    world.flush();
    expect(b.session()).toBeNull();
    expect(b.notices).toEqual([{ kind: "left", peer: "a" }]);
    expect([a.car(), b.car()]).toEqual(["skerry-gt", "skerry-gt"]);
  });

  it("dropping out of the world ends it for the one left", () => {
    const { world, b } = paired();
    world.drop("a");
    expect(b.session()).toBeNull();
    expect(b.notices).toEqual([{ kind: "left", peer: "a" }]);
    expect(b.car()).toBe("skerry-gt");
  });
});
