import { describe, expect, it } from "vitest";
import { flickerOf, MAX_FLICKER } from "../lighting";
import * as THREE from "three";
import { batchFlames, fire, flame, FLAME_PRESETS, flameLight, flameSway, MAX_TONGUES, momentAtSignal, signalFlame, unsignalledFlames, type FlamePresetName } from "./flame";

const NAMES = Object.keys(FLAME_PRESETS) as FlamePresetName[];

describe("flame presets", () => {
  it.each(NAMES)("%s flickers within the flicker map and draws a tongue count the shader takes", (name) => {
    const preset = FLAME_PRESETS[name];
    expect(preset.light.flicker).toBeLessThanOrEqual(MAX_FLICKER);
    expect(preset.tongues).toBeGreaterThanOrEqual(1);
    expect(preset.tongues).toBeLessThanOrEqual(MAX_TONGUES);
  });

  it("gives a flame's light the signal its flame dips with", () => {
    expect(flameLight("candle", 2)).toMatchObject({ ...FLAME_PRESETS.candle.light, signal: 2 });
  });
});

describe("flameSway", () => {
  it("stands at rest on a signal of 0, and dips and rises with it, deeper than its light", () => {
    const preset = FLAME_PRESETS.candle;
    expect(flameSway(preset, 0)).toEqual({ brightness: 1, height: 1 });
    const low = flameSway(preset, -1);
    const high = flameSway(preset, 1);
    expect(low.brightness).toBeLessThan(1 - preset.light.flicker);
    expect(low.height).toBeLessThan(1);
    expect(high.brightness).toBeGreaterThan(1 + preset.light.flicker);
    expect(high.height).toBeGreaterThan(1);
  });

  it("never goes dark or flat at the deepest dip", () => {
    for (const name of NAMES) {
      const { brightness, height } = flameSway(FLAME_PRESETS[name], -1);
      expect(brightness).toBeGreaterThan(0);
      expect(height).toBeGreaterThan(0);
    }
  });
});

describe("momentAtSignal", () => {
  it.each([-0.8, 0, 0.6])("finds a moment the signal stands near %s", (target) => {
    expect(flickerOf(momentAtSignal(target, 0), 0)).toBeCloseTo(target, 1);
  });
});

describe("fire", () => {
  it("lays narrow flames across and into its bed, tallest in the middle, all on its signal", () => {
    const bed = fire({ width: 0.5, depth: 0.2, height: 0.45, signal: 3 });
    const cards = bed.children as THREE.Mesh[];
    expect(cards.length).toBeGreaterThanOrEqual(5);
    for (const card of cards) {
      expect(Math.abs(card.position.x)).toBeLessThanOrEqual(0.25);
      expect(Math.abs(card.position.z)).toBeLessThanOrEqual(0.1);
    }
    const middle = cards[Math.floor(cards.length / 2)];
    expect(middle.scale.y).toBeGreaterThan(cards[0].scale.y);
    expect(unsignalledFlames(bed)).toEqual([]);
  });
});

describe("flame signals", () => {
  it("lists a flame that names no signal until it is given one", () => {
    const holder = new THREE.Group().add(flame("candle"), flame("candle", { signal: 1 }));
    const [unnamed] = unsignalledFlames(holder);
    expect(unsignalledFlames(holder)).toHaveLength(1);
    signalFlame(unnamed, 2);
    expect(unsignalledFlames(holder)).toEqual([]);
    expect(Array.from(unnamed.geometry.getAttribute("signalMask").array.slice(0, 4))).toEqual([0, 0, 1, 0]);
  });
});

describe("batchFlames", () => {
  it("draws flames sharing a material as one mesh, each keeping its foot and size, and keeps a hung piece's apart", () => {
    const room = new THREE.Group();
    const a = flame("candle", { signal: 0 });
    a.position.set(1, 0.5, 0);
    const b = flame("candle", { signal: 1 });
    b.position.set(-1, 0.5, 0);
    b.scale.setScalar(2);
    const hung = new THREE.Group().add(flame("candle", { signal: 2 }));
    room.add(a, b, flame("torch", { signal: 0 }), hung);
    batchFlames(room, [hung]);
    const own = room.children.filter((child) => child instanceof THREE.Mesh);
    expect(own).toHaveLength(2);
    expect(hung.children).toHaveLength(1);
    const candles = own.find((mesh) => mesh.geometry.getAttribute("foot").count === 8);
    const foot = candles?.geometry.getAttribute("foot");
    const extent = candles?.geometry.getAttribute("extent");
    expect([foot?.getX(0), foot?.getX(4)]).toEqual([1, -1]);
    expect(extent?.getY(4)).toBeCloseTo(2 * FLAME_PRESETS.candle.height);
  });
});
