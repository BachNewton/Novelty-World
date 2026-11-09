import { describe, expect, it } from "vitest";
import type { ChallengeMessage } from "../net/protocol";
import type { CarId } from "../sim/cars";
import { CoopLink, type CoopNotice } from "./coop";
import { COUNTDOWN_S } from "./run";
import { ChallengeSession } from "./session";
import type { Gate, RouteChallenge } from "./types";

/*
 * Up to five clients' co-op links over an in-memory world: every send queues,
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
  starts: [{ x: 0, z: 2, heading: EAST }, { x: 0, z: -2, heading: EAST }, { x: 10, z: 2, heading: EAST }, { x: 10, z: -2, heading: EAST }],
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
      begin: (challenge, seat, players) => {
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
            onResult: (attempt, result, points) => link.result(attempt, result, points),
            onLost: (attempt, results) => link.lost(attempt, results),
          },
          seat,
          players,
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


/** A team on the route: the first client invites, the others join in order, and the inviter starts it once they have. */
function team(size: number, { loads = [] as string[] } = {}) {
  const world = createWorld();
  const clients = ["a", "b", "c", "d"].slice(0, size).map((id) => world.add(id, { loads: loads.includes(id) }));
  const [inviter, ...joiners] = clients;
  inviter.link.inviteAll(ROUTE);
  world.flush();
  for (const joiner of joiners) joiner.link.accept(inviter.id);
  world.flush();
  // A full room has started by itself.
  if (inviter.link.now.kind === "inviting") inviter.link.start();
  world.flush();
  return { world, clients };
}

const at = (x: number, z = 2) => ({ x, z, speedMS: 20 });
const sessionOf = (client: Client) => client.session() ?? (() => { throw new Error(`${client.id} has no session`); })();
/** Every client's lights go green, each on its own clock. */
const green = (clients: readonly Client[]) => {
  for (const client of clients) sessionOf(client).step(COUNTDOWN_S, at(0));
};

describe("forming a team", () => {
  it("seats the inviter first and each joiner in the order the inviter heard them, each on their own place in the challenge's car", () => {
    const { clients } = team(3);
    expect(clients.map((client) => sessionOf(client).seat)).toEqual([0, 1, 2]);
    expect(clients.map((client) => client.placedAt())).toEqual([0, 1, 2]);
    expect(clients.map((client) => client.car())).toEqual(["sten", "sten", "sten"]);
    expect(clients.map((client) => sessionOf(client).run.players.length)).toEqual([3, 3, 3]);
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

  it("keeps the invite open after an accept, until the inviter starts it, and then tells a joiner too late it was taken", () => {
    const world = createWorld();
    const [a, b, c, d] = ["a", "b", "c", "d"].map((id) => world.add(id));
    a.link.inviteAll(ROUTE);
    world.flush();
    b.link.accept("a");
    world.flush();
    expect(a.link.now).toMatchObject({ kind: "inviting", joined: ["b"] });
    expect(b.session()).toBeNull();
    expect(c.link.invite?.peer).toBe("a");
    // c's accept is on its way as a starts.
    c.link.accept("a");
    a.link.start();
    world.flush();
    expect(sessionOf(a).run.players.length).toBe(2);
    expect(sessionOf(b).seat).toBe(1);
    expect(c.session()).toBeNull();
    expect(c.link.now.kind).toBe("free");
    expect(c.notices).toEqual([{ kind: "taken", peer: "a" }]);
    for (const client of [c, d]) {
      expect(client.link.invite).toBeNull();
      expect(client.link.busy("a")).toBe(true);
      expect(client.link.busy("b")).toBe(true);
    }
    // d never answered: its invite goes without anything to tell.
    expect(d.notices).toEqual([{ kind: "expired", peer: "a" }]);
  });

  it("starts at once when the room is full, four players, and seats no fifth", () => {
    const world = createWorld();
    const [a, b, c, d, e] = ["a", "b", "c", "d", "e"].map((id) => world.add(id));
    a.link.inviteAll(ROUTE);
    world.flush();
    for (const joiner of [b, c, d, e]) joiner.link.accept("a");
    world.flush();
    expect([a, b, c, d].map((client) => sessionOf(client).seat)).toEqual([0, 1, 2, 3]);
    expect(e.session()).toBeNull();
    expect(e.notices).toEqual([{ kind: "taken", peer: "a" }]);
  });

  it("gives a seat taken back to whoever accepts next", () => {
    const world = createWorld();
    const [a, b, c] = ["a", "b", "c"].map((id) => world.add(id));
    a.link.inviteAll(ROUTE);
    world.flush();
    b.link.accept("a");
    world.flush();
    b.link.withdraw();
    c.link.accept("a");
    world.flush();
    expect(a.link.now).toMatchObject({ kind: "inviting", joined: ["c"] });
    a.link.start();
    world.flush();
    expect(sessionOf(c).seat).toBe(1);
    expect(b.session()).toBeNull();
  });

  it("forgets a joiner who drops out of the world before the start", () => {
    const world = createWorld();
    const [a, b, c] = ["a", "b", "c"].map((id) => world.add(id));
    a.link.inviteAll(ROUTE);
    world.flush();
    b.link.accept("a");
    c.link.accept("a");
    world.flush();
    world.drop("b");
    expect(a.link.now).toMatchObject({ kind: "inviting", joined: ["c"] });
  });

  it("holds an invite unseen while in a team, to answer once that challenge is over", () => {
    const {
      world,
      clients: [a, b],
    } = team(2);
    const c = world.add("c");
    c.link.inviteAll(ROUTE);
    world.flush();
    expect(a.link.now.kind).toBe("playing");
    expect(a.link.invite).toEqual({ peer: "c", challenge: ROUTE });
    a.link.leave();
    world.flush();
    for (const client of [a, b]) expect(client.link.invite).toEqual({ peer: "c", challenge: ROUTE });
    expect(c.link.busy("a")).toBe(false);
    b.link.accept("c");
    world.flush();
    c.link.start();
    world.flush();
    expect(sessionOf(c).seat).toBe(0);
    expect(sessionOf(b).seat).toBe(1);
  });

  it("drops an invite everywhere once its inviter takes it back, telling those who had joined, or leaves the world", () => {
    const world = createWorld();
    const [a, b, c] = ["a", "b", "c"].map((id) => world.add(id));
    a.link.inviteAll(ROUTE);
    world.flush();
    b.link.accept("a");
    world.flush();
    a.link.withdraw();
    world.flush();
    expect(b.link.now.kind).toBe("free");
    expect(b.notices).toEqual([{ kind: "withdrawn", peer: "a" }]);
    for (const client of [b, c]) expect(client.link.invite).toBeNull();
    c.link.inviteAll(ROUTE);
    world.flush();
    expect(b.link.invite).toEqual({ peer: "c", challenge: ROUTE });
    world.drop("c");
    expect(b.link.invite).toBeNull();
  });

  it("answers the newest of several invites, and an older one stays until it's let pass", () => {
    const world = createWorld();
    const [a, b, c] = ["a", "b", "c"].map((id) => world.add(id));
    a.link.inviteAll(ROUTE);
    c.link.inviteAll(ROUTE);
    world.flush();
    expect(b.link.invite?.peer).toBe("c");
    b.link.decline("c");
    expect(b.link.invite?.peer).toBe("a");
    // The inviter isn't told of a decline: it asks on.
    expect(c.link.now.kind).toBe("inviting");
  });

  it("withdraws the invite from everyone when the room fills while the inviter can't start", () => {
    const world = createWorld();
    const [a, b, c, d, e] = ["a", "b", "c", "d", "e"].map((id) => world.add(id));
    a.link.inviteAll(ROUTE);
    world.flush();
    // a has opened the map by the time the last seat's accept lands.
    a.block(true);
    for (const joiner of [b, c, d]) joiner.link.accept("a");
    world.flush();
    expect(a.link.now.kind).toBe("free");
    expect(a.notices).toEqual([{ kind: "withdrawn", peer: "d" }]);
    for (const joiner of [b, c, d]) {
      expect(joiner.link.now.kind).toBe("free");
      expect(joiner.notices).toEqual([{ kind: "withdrawn", peer: "a" }]);
    }
    expect(e.link.invite).toBeNull();
  });

  it("goes on without a joiner who can't make the start, who tells the rest", () => {
    const world = createWorld();
    const [a, b, c] = ["a", "b", "c"].map((id) => world.add(id));
    a.link.inviteAll(ROUTE);
    world.flush();
    b.link.accept("a");
    c.link.accept("a");
    world.flush();
    // c is on the map as the start lands.
    c.block(true);
    a.link.start();
    world.flush();
    expect(c.session()).toBeNull();
    expect(c.notices).toEqual([{ kind: "withdrawn", peer: "a" }]);
    for (const client of [a, b]) {
      expect(sessionOf(client).run.players[2].gone).toBe(true);
      expect(sessionOf(client).phase).toBe("countdown");
    }
  });
});

describe("the ready gate", () => {
  it("holds the lights until every car is on its place, and the countdown runs from that moment on each client", () => {
    const { world, clients } = team(3, { loads: ["c"] });
    const [a, b, c] = clients;
    // a and b are on their places; c's start is still loading, so they wait on the line with their clocks still.
    sessionOf(a).step(COUNTDOWN_S, at(0));
    expect(sessionOf(a).phase).toBe("waiting");
    expect(sessionOf(a).holdsCar()).toBe(true);
    expect(sessionOf(a).run.clockS).toBe(-COUNTDOWN_S);
    expect(sessionOf(b).phase).toBe("waiting");
    // c's car lands. c has heard the others' ready already, so its own lights start at once; theirs once c's ready reaches them.
    c.land();
    expect(sessionOf(c).phase).toBe("countdown");
    expect(sessionOf(a).phase).toBe("waiting");
    world.flush();
    for (const client of clients) expect(sessionOf(client).phase).toBe("countdown");
    sessionOf(a).step(COUNTDOWN_S, at(0));
    expect(sessionOf(a).phase).toBe("running");
  });
});

describe("the shared retry", () => {
  it("takes every car back for the attempt any player asks for", () => {
    const { world, clients } = team(4);
    green(clients);
    expect(sessionOf(clients[2]).retry()).toBe(true);
    world.flush();
    for (const client of clients) {
      expect(sessionOf(client).run.attempt).toBe(2);
      expect(sessionOf(client).phase).toBe("countdown");
    }
  });

  it("gives one attempt for retries at once, and drops a retry for an attempt already under way", () => {
    const { world, clients } = team(3);
    const [a, b, c] = clients;
    // a and c press before either hears the other.
    expect(sessionOf(a).retry()).toBe(true);
    expect(sessionOf(c).retry()).toBe(true);
    world.flush();
    expect(clients.map((client) => sessionOf(client).run.attempt)).toEqual([2, 2, 2]);
    expect(clients.map((client) => sessionOf(client).phase)).toEqual(["countdown", "countdown", "countdown"]);
    expect(sessionOf(b).follow(2)).toBe(false);
    expect(sessionOf(b).follow(1)).toBe(false);
  });

  it("puts the car down once for a retry heard while it's still on its way to the line, ready for the newer attempt", () => {
    const { world, clients } = team(2, { loads: ["a"] });
    const [a, b] = clients;
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
  it("pass on the average of everyone, each client measuring only its own car and telling the rest", () => {
    const { world, clients } = team(3);
    const [a, b, c] = clients;
    green(clients);
    // a finishes in 40 s and b in 50; c, slower than the target alone, in 85: an average of 58.3.
    sessionOf(a).step(40, at(100.01));
    sessionOf(b).step(50, at(100.01));
    world.flush();
    expect(sessionOf(c).run.players.map(({ result }) => result)).toEqual([expect.closeTo(40, 1), expect.closeTo(50, 1), null]);
    sessionOf(c).step(85, at(100.01));
    world.flush();
    for (const client of clients) {
      expect(sessionOf(client).run.outcome?.passed).toBe(true);
      expect(sessionOf(client).run.outcome?.average).toBeCloseTo(58.33, 1);
      expect(client.overs).toBe(1);
    }
  });

  it("is lost by a client still timing a player, and ends the same way on the rest", () => {
    const { world, clients } = team(3);
    const [a, b, c] = clients;
    green(clients);
    sessionOf(a).step(50, at(100.01));
    world.flush();
    // a has finished, so a's own clock says nothing about the others: a waits however long it runs.
    sessionOf(a).step(100, at(120));
    expect(sessionOf(a).run.outcome).toBeNull();
    // On b's clock, (50 + 66 + 66) / 3 is over 60.
    sessionOf(b).step(66, at(60));
    expect(sessionOf(b).run.outcome?.passed).toBe(false);
    world.flush();
    expect(sessionOf(a).run.outcome).toEqual(sessionOf(b).run.outcome);
    expect(sessionOf(c).run.outcome).toEqual(sessionOf(b).run.outcome);
  });
});

describe("leaving", () => {
  it("by one of three leaves the rest playing, the average theirs alone, and a car back for the one who left", () => {
    const { world, clients } = team(3);
    const [a, b, c] = clients;
    green(clients);
    sessionOf(a).step(40, at(100.01));
    world.flush();
    c.link.leave();
    sessionOf(c).leave();
    world.flush();
    expect(c.car()).toBe("skerry-gt");
    for (const client of [a, b]) expect(client.notices).toEqual([{ kind: "left", peer: "c" }]);
    // b's 70 and a's 40 pass on their own average, 55; c's is in no one's.
    sessionOf(b).step(70, at(100.01));
    world.flush();
    for (const client of [a, b]) expect(sessionOf(client).run.outcome).toMatchObject({ passed: true, average: expect.closeTo(55, 1) });
    // The next attempt waits for no one who has gone.
    expect(sessionOf(a).retry()).toBe(true);
    world.flush();
    for (const client of [a, b]) expect(sessionOf(client).phase).toBe("countdown");
  });

  it("settles the attempt at once when the one who leaves was the last still driving", () => {
    const { world, clients } = team(3);
    const [a, b] = clients;
    green(clients);
    sessionOf(a).step(40, at(100.01));
    sessionOf(b).step(50, at(100.01));
    world.flush();
    world.drop("c");
    for (const client of [a, b]) expect(sessionOf(client).run.outcome).toMatchObject({ passed: true, average: expect.closeTo(45, 1) });
  });

  it("ends it for the last one left, with their car back", () => {
    const { world, clients } = team(3);
    const [a, b, c] = clients;
    a.link.leave();
    sessionOf(a).leave();
    world.flush();
    expect(sessionOf(b).playing).toBe(2);
    world.drop("b");
    expect(c.session()).toBeNull();
    expect(c.notices).toEqual([{ kind: "left", peer: "a" }, { kind: "left", peer: "b" }]);
    expect(c.car()).toBe("skerry-gt");
  });
});
