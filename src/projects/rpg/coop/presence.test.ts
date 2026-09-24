import { describe, expect, it } from "vitest";
import {
  PRESENCE_DIRTY_DIST_PX,
  PRESENCE_KEEPALIVE_MS,
  PRESENCE_SEND_INTERVAL_MS,
  advanceRemoteRender,
  applyPresenceMessage,
  createPresenceSampler,
  prunePresenceRemotes,
  samplerShouldSend,
  shouldSendPos,
  type RemoteAvatar,
  type RemoteAvatarMap,
} from "./presence";
import type { CoopMessage, OutboundMessage, PosPayload } from "./types";
import type { CoopState } from "./transport";

const BASE: PosPayload = { x: 100, y: 100, dir: "front", flip: false, moving: false };

function avatarAt(x: number, y: number): RemoteAvatar {
  return {
    net: { ...BASE, x, y },
    renderX: 0,
    renderY: 0,
    dir: "front",
    flip: false,
    moving: false,
    characterId: "farmer-bob",
    lastSeen: 0,
  };
}

describe("shouldSendPos dirty gate + keepalive", () => {
  it("sends the first sample", () => {
    expect(shouldSendPos(null, 0, BASE, 1000)).toBe(true);
  });

  it("stays quiet when clean and recent", () => {
    expect(shouldSendPos(BASE, 1000, { ...BASE }, 1500)).toBe(false);
  });

  it(`sends when moved more than ${PRESENCE_DIRTY_DIST_PX}px`, () => {
    expect(
      shouldSendPos(BASE, 1000, { ...BASE, x: BASE.x + 2.01 }, 1500),
    ).toBe(true);
    expect(
      shouldSendPos(BASE, 1000, { ...BASE, x: BASE.x + 2 }, 1500),
    ).toBe(false);
  });

  it("sends on facing / flip / moving flips without movement", () => {
    expect(
      shouldSendPos(BASE, 1000, { ...BASE, dir: "side" }, 1500),
    ).toBe(true);
    expect(shouldSendPos(BASE, 1000, { ...BASE, flip: true }, 1500)).toBe(
      true,
    );
    expect(shouldSendPos(BASE, 1000, { ...BASE, moving: true }, 1500)).toBe(
      true,
    );
  });

  it(`resends unchanged pos as a keepalive after ${PRESENCE_KEEPALIVE_MS}ms`, () => {
    expect(shouldSendPos(BASE, 1000, { ...BASE }, 2000)).toBe(true);
    expect(shouldSendPos(BASE, 1000, { ...BASE }, 1999)).toBe(false);
  });
});

describe("applyPresenceMessage join / update / leave", () => {
  it("spawns an avatar on the first received pos (no hello)", () => {
    const remotes: RemoteAvatarMap = new Map();
    const msg: CoopMessage = {
      kind: "pos",
      from: "guest-a",
      pos: { ...BASE, x: 320, y: 240 },
    };
    expect(applyPresenceMessage(remotes, msg, "self")).toBe(true);
    const avatar = remotes.get("guest-a");
    expect(avatar?.net.x).toBe(320);
    expect(avatar?.renderX).toBe(320);
    expect(avatar?.renderY).toBe(240);
  });

  it("updates net in place and snaps discrete facing fields", () => {
    const remotes: RemoteAvatarMap = new Map([["guest-a", avatarAt(0, 0)]]);
    const before = remotes.get("guest-a");
    applyPresenceMessage(
      remotes,
      {
        kind: "pos",
        from: "guest-a",
        pos: { ...BASE, x: 50, y: 60, dir: "side", flip: true, moving: true },
      },
      "self",
    );
    expect(remotes.get("guest-a")).toBe(before);
    expect(before?.net.x).toBe(50);
    expect(before?.dir).toBe("side");
    expect(before?.flip).toBe(true);
    expect(before?.moving).toBe(true);
  });

  it("ignores our own echo", () => {
    const remotes: RemoteAvatarMap = new Map();
    expect(
      applyPresenceMessage(
        remotes,
        { kind: "pos", from: "self", pos: BASE },
        "self",
      ),
    ).toBe(false);
    expect(remotes.size).toBe(0);
  });

  it("despawns on peer-left", () => {
    const remotes: RemoteAvatarMap = new Map([["guest-a", avatarAt(0, 0)]]);
    expect(
      applyPresenceMessage(
        remotes,
        { kind: "peer-left", from: "host", peerId: "guest-a" },
        "self",
      ),
    ).toBe(true);
    expect(remotes.has("guest-a")).toBe(false);
  });

  it("ignores chunk-2 tile kinds", () => {
    const remotes: RemoteAvatarMap = new Map();
    expect(
      applyPresenceMessage(
        remotes,
        {
          kind: "tiles",
          from: "guest-a",
          cells: [{ c: 1, r: 1, tile: null, seq: 1, author: "guest-a" }],
        },
        "self",
      ),
    ).toBe(false);
    expect(remotes.size).toBe(0);
  });
});

describe("prunePresenceRemotes on peers-list removal", () => {
  function hostState(peers: string[]): CoopState {
    return { role: "host", status: "connected", peerId: "host", peers };
  }

  it("host drops avatars missing from the peers list", () => {
    const remotes: RemoteAvatarMap = new Map([
      ["guest-a", avatarAt(0, 0)],
      ["guest-b", avatarAt(0, 0)],
    ]);
    expect(prunePresenceRemotes(remotes, hostState(["guest-b"]))).toBe(true);
    expect([...remotes.keys()]).toEqual(["guest-b"]);
  });

  it("guest never prunes (peers list holds only the host id)", () => {
    const remotes: RemoteAvatarMap = new Map([["guest-b", avatarAt(0, 0)]]);
    const state: CoopState = {
      role: "guest",
      status: "connected",
      peerId: "guest-a",
      peers: ["host"],
    };
    expect(prunePresenceRemotes(remotes, state)).toBe(false);
    expect(remotes.has("guest-b")).toBe(true);
  });
});

describe("advanceRemoteRender lerp", () => {
  it("converges render toward net at dt*10 and snaps on large dt", () => {
    const avatar = avatarAt(100, 0);
    advanceRemoteRender(avatar, 0.05);
    expect(avatar.renderX).toBeCloseTo(50, 6);
    advanceRemoteRender(avatar, 10);
    expect(avatar.renderX).toBe(100);
    expect(avatar.renderY).toBe(0);
  });
});

describe("samplerShouldSend frame gate", () => {
  it("sends the first sample immediately regardless of the clock", () => {
    expect(samplerShouldSend(null, 0, BASE, 0)).toBe(true);
  });

  it(`holds dirty samples inside the ${PRESENCE_SEND_INTERVAL_MS}ms interval`, () => {
    const dirty = { ...BASE, x: BASE.x + 50 };
    expect(samplerShouldSend(BASE, 1000, dirty, 1000)).toBe(false);
    expect(
      samplerShouldSend(BASE, 1000, dirty, 1000 + PRESENCE_SEND_INTERVAL_MS - 1),
    ).toBe(false);
    expect(
      samplerShouldSend(BASE, 1000, dirty, 1000 + PRESENCE_SEND_INTERVAL_MS),
    ).toBe(true);
  });

  it("stays quiet when clean even after the interval elapses", () => {
    expect(
      samplerShouldSend(BASE, 1000, { ...BASE }, 1000 + PRESENCE_SEND_INTERVAL_MS),
    ).toBe(false);
  });

  it(`resends unchanged pos as a keepalive after ${PRESENCE_KEEPALIVE_MS}ms`, () => {
    expect(samplerShouldSend(BASE, 1000, { ...BASE }, 1000 + PRESENCE_KEEPALIVE_MS)).toBe(
      true,
    );
  });
});

describe("createPresenceSampler frame driver", () => {
  function drive() {
    const sent: OutboundMessage[] = [];
    let now = 1000;
    let local: PosPayload | null = { ...BASE };
    const sampler = createPresenceSampler(
      () => local,
      (msg) => sent.push(msg),
      () => now,
    );
    return {
      sent,
      sampler,
      setLocal(next: PosPayload | null): void {
        local = next;
      },
      advance(ms: number): void {
        now += ms;
      },
    };
  }

  it("sends on frame-advance with timestamp gating, no timers", () => {
    const { sent, sampler, setLocal, advance } = drive();
    sampler.sample();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual({
      kind: "pos",
      pos: { ...BASE },
    });

    // Clean + recent → quiet.
    advance(10);
    sampler.sample();
    expect(sent).toHaveLength(1);

    // Dirty but inside the send interval → quiet.
    setLocal({ ...BASE, x: BASE.x + 50 });
    advance(10);
    sampler.sample();
    expect(sent).toHaveLength(1);

    // Dirty + interval elapsed → send.
    advance(PRESENCE_SEND_INTERVAL_MS);
    sampler.sample();
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual({
      kind: "pos",
      pos: { ...BASE, x: BASE.x + 50 },
    });
  });

  it("resends unchanged pos as a keepalive and skips null locals", () => {
    const { sent, sampler, setLocal, advance } = drive();
    sampler.sample();
    expect(sent).toHaveLength(1);
    advance(PRESENCE_KEEPALIVE_MS);
    sampler.sample();
    expect(sent).toHaveLength(2);
    setLocal(null);
    advance(PRESENCE_KEEPALIVE_MS * 2);
    sampler.sample();
    expect(sent).toHaveLength(2);
  });
});
