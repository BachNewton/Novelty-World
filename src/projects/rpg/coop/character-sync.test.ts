import { describe, expect, it } from "vitest";
import {
  applyPresenceMessage,
  createPresenceSampler,
  shouldSendPos,
  type RemoteAvatarMap,
} from "./presence";
import { isCoopMessage, type OutboundMessage, type PosPayload } from "./types";

const BASE: PosPayload = {
  x: 100,
  y: 100,
  dir: "front",
  flip: false,
  moving: false,
  characterId: "farmer-bob",
};

describe("characterId network sync", () => {
  it("the sampler carries characterId on the wire when set", () => {
    const sent: OutboundMessage[] = [];
    const sampler = createPresenceSampler(
      () => ({ ...BASE, characterId: "miner-mike" }),
      (msg) => sent.push(msg),
      () => 1000,
    );
    sampler.sample();
    expect(sent).toHaveLength(1);
    const first = sent.at(0);
    if (first?.kind !== "pos") throw new Error("expected a pos message");
    expect(first.pos.characterId).toBe("miner-mike");
  });

  it("the sampler omits characterId when the local pos has none", () => {
    const { characterId: _dropped, ...legacy } = BASE;
    const sent: OutboundMessage[] = [];
    const sampler = createPresenceSampler(
      () => ({ ...legacy }),
      (msg) => sent.push(msg),
      () => 1000,
    );
    sampler.sample();
    expect(sent).toHaveLength(1);
    const first = sent.at(0);
    if (first?.kind !== "pos") throw new Error("expected a pos message");
    expect("characterId" in first.pos).toBe(false);
  });

  it("a character switch alone marks the sample dirty", () => {
    expect(
      shouldSendPos(BASE, 1000, { ...BASE, characterId: "chef-chloe" }, 1500),
    ).toBe(true);
    expect(shouldSendPos(BASE, 1000, { ...BASE }, 1500)).toBe(false);
  });

  it("spawn stores the sender's character", () => {
    const remotes: RemoteAvatarMap = new Map();
    applyPresenceMessage(
      remotes,
      {
        kind: "pos",
        from: "guest-a",
        pos: { ...BASE, characterId: "fisherman-fin" },
      },
      "self",
    );
    expect(remotes.get("guest-a")?.characterId).toBe("fisherman-fin");
  });

  it("updates switch the stored character", () => {
    const remotes: RemoteAvatarMap = new Map();
    applyPresenceMessage(
      remotes,
      { kind: "pos", from: "guest-a", pos: { ...BASE } },
      "self",
    );
    applyPresenceMessage(
      remotes,
      {
        kind: "pos",
        from: "guest-a",
        pos: { ...BASE, characterId: "lumberjack-jack" },
      },
      "self",
    );
    expect(remotes.get("guest-a")?.characterId).toBe("lumberjack-jack");
  });

  it("missing or unknown ids fall back to the default", () => {
    const remotes: RemoteAvatarMap = new Map();
    const { characterId: _dropped, ...legacy } = BASE;
    applyPresenceMessage(
      remotes,
      { kind: "pos", from: "guest-a", pos: { ...legacy } },
      "self",
    );
    expect(remotes.get("guest-a")?.characterId).toBe("farmer-bob");
    applyPresenceMessage(
      remotes,
      {
        kind: "pos",
        from: "guest-b",
        pos: { ...BASE, characterId: "nope" },
      },
      "self",
    );
    expect(remotes.get("guest-b")?.characterId).toBe("farmer-bob");
  });

  it("the wire validator accepts the field and rejects non-strings", () => {
    expect(
      isCoopMessage({
        kind: "pos",
        from: "guest-a",
        pos: { ...BASE, characterId: "miner-mike" },
      }),
    ).toBe(true);
    expect(
      isCoopMessage({
        kind: "pos",
        from: "guest-a",
        pos: { ...BASE, characterId: 42 },
      }),
    ).toBe(false);
  });
});
