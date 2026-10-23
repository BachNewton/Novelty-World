import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CATALOG } from "../../data";
import { PRESENCE } from "../../play/things";
import { CUT_HEIGHT, INNER } from "../room";
import { CARD_MODELS, cardModel, connectionLook, effectLook, floorMark, pileModel, plate, tokenModel } from "./looks";

/** The cards shown by their type's stand-in: a card with a model of its own is checked with the item models (`items/`). */
const STAND_IN_CARDS = Object.values(CATALOG.cards).filter((card) => !(card.id in CARD_MODELS));

const bounds = (object: THREE.Object3D) => {
  object.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(object);
};

describe("the looks of things in rooms", () => {
  it("give every card and token kind something to show", () => {
    for (const card of STAND_IN_CARDS) expect(bounds(cardModel(card.id, card.type).floor()).isEmpty()).toBe(false);
    for (const [token, presence] of Object.entries(PRESENCE)) {
      if (presence.kind === "figure" || presence.kind === "bonus") continue;
      const look = presence.kind === "effect" ? effectLook(token, "moon").object : presence.kind === "connection" ? (presence.on === "edge" ? connectionLook(token, "moon", { edge: "top", along: 0, fits: true, icon: [0, 0] }) : floorMark("moon")) : tokenModel().floor();
      expect(bounds(look).isEmpty(), token).toBe(false);
    }
    expect(bounds(pileModel()).isEmpty()).toBe(false);
  });

  it("keep a stand-in on its plate, standing on the floor", () => {
    const plateSize = bounds(plate("amber").object).getSize(new THREE.Vector3());
    for (const card of STAND_IN_CARDS) {
      const lying = bounds(cardModel(card.id, card.type).floor());
      const size = lying.getSize(new THREE.Vector3());
      expect(Math.max(size.x, size.z), card.id).toBeLessThanOrEqual(plateSize.x);
      expect(lying.min.y, card.id).toBeCloseTo(0, 3);
    }
  });

  it("size a room effect to the tile, and keep a connection's mark on the wall's stub", () => {
    const glow = bounds(effectLook("blessing", "gold").object);
    expect(glow.max.x).toBeCloseTo(INNER);
    expect(glow.min.z).toBeCloseTo(-INNER);
    const passage = bounds(connectionLook("secret-passage", "moonLight", { edge: "top", along: 0, fits: true, icon: [0, 0] }));
    expect(passage.max.y).toBeLessThanOrEqual(CUT_HEIGHT + 0.02);
    expect(passage.min.z).toBeLessThan(-INNER);
  });
});
