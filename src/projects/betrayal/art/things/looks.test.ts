import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CATALOG } from "../../data";
import { PRESENCE } from "../../play/things";
import { CUT_HEIGHT, INNER } from "../room";
import { cardModel, connectionLook, effectLook, floorMark, pileModel, plate, tokenModel } from "./looks";

const bounds = (object: THREE.Object3D) => {
  object.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(object);
};

describe("the looks of things in rooms", () => {
  it("give every card and token kind something to show", () => {
    for (const card of Object.values(CATALOG.cards)) expect(bounds(cardModel(card.id, card.type).floor()).isEmpty()).toBe(false);
    for (const [token, presence] of Object.entries(PRESENCE)) {
      if (presence.kind === "figure" || presence.kind === "bonus") continue;
      const look = presence.kind === "effect" ? effectLook(token, "moon").object : presence.kind === "connection" ? (presence.on === "edge" ? connectionLook(token, "moon", { edge: "top", along: 0 }) : floorMark("moon")) : tokenModel().floor();
      expect(bounds(look).isEmpty(), token).toBe(false);
    }
    expect(bounds(pileModel()).isEmpty()).toBe(false);
  });

  it("keep an object small enough to sit on its plate, and held smaller than on the floor", () => {
    const { object } = plate("amber");
    const plateSize = bounds(object).getSize(new THREE.Vector3());
    const model = cardModel("revolver", "item");
    const lying = bounds(model.floor()).getSize(new THREE.Vector3());
    expect(Math.max(lying.x, lying.z)).toBeLessThanOrEqual(plateSize.x);
    expect(bounds(model.held()).getSize(new THREE.Vector3()).x).toBeLessThan(lying.x);
  });

  it("size a room effect to the tile, and keep a connection's mark on the wall's stub", () => {
    const glow = bounds(effectLook("blessing", "gold").object);
    expect(glow.max.x).toBeCloseTo(INNER);
    expect(glow.min.z).toBeCloseTo(-INNER);
    const passage = bounds(connectionLook("secret-passage", "moonLight", { edge: "top", along: 0 }));
    expect(passage.max.y).toBeLessThanOrEqual(CUT_HEIGHT + 0.02);
    expect(passage.min.z).toBeLessThan(-INNER);
  });
});
