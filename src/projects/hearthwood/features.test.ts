import { describe, expect, it, vi } from "vitest";
import { allOn, applyFeatureParam, FEATURE_GROUPS, featureDefine, FEATURES, FeatureSwitches, restoreToggles, type FeatureToggles } from "./features";

const BASE = allOn();
const ids = FEATURES.map((f) => f.id);
const [first, second] = ids;

describe("the features", () => {
  it("each have their own camelCase id, define and a group the panel shows", () => {
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(ids.map(featureDefine)).size).toBe(ids.length);
    for (const f of FEATURES) {
      expect(f.id).toMatch(/^[a-z][a-zA-Z0-9]*$/);
      expect(FEATURE_GROUPS.map((g) => g.id)).toContain(f.group);
      expect(f.name.length).toBeGreaterThan(0);
      expect(f.description.length).toBeGreaterThan(0);
    }
  });

  it("are all on unless switched off", () => {
    expect(Object.values(BASE).every(Boolean)).toBe(true);
  });
});

describe("featureDefine", () => {
  it("names a feature's define in upper snake case", () => {
    expect(featureDefine("ssr")).toBe("HW_SSR");
    expect(featureDefine("godRays")).toBe("HW_GOD_RAYS");
    expect(featureDefine("cloudShadows2")).toBe("HW_CLOUD_SHADOWS_2");
  });

  it("refuses an id that isn't camelCase", () => {
    expect(() => featureDefine("god-rays")).toThrow();
    expect(() => featureDefine("GodRays")).toThrow();
  });
});

describe("?features=", () => {
  it("switches features off and on, in order", () => {
    const off = applyFeatureParam(`-${first}`, BASE);
    expect(off[first]).toBe(false);
    expect(off[second]).toBe(true);
    expect(applyFeatureParam(`-${first},+${first}`, BASE)[first]).toBe(true);
    expect(applyFeatureParam(` ${first} `, { ...BASE, [first]: false })[first]).toBe(true);
  });

  it("can switch everything off and then one back on", () => {
    const only = applyFeatureParam(`none,+${second}`, BASE);
    expect(ids.filter((id) => only[id])).toEqual([second]);
    expect(Object.values(applyFeatureParam("none,all", BASE)).every(Boolean)).toBe(true);
  });

  it("leaves the switches as they are when absent or empty", () => {
    expect(applyFeatureParam(null, BASE)).toEqual(BASE);
    expect(applyFeatureParam("", BASE)).toEqual(BASE);
  });

  it("throws on a feature that doesn't exist", () => {
    expect(() => applyFeatureParam("-nope", BASE)).toThrow(/nope/);
  });
});

describe("restoreToggles", () => {
  it("keeps what was kept, and passes over anything else", () => {
    const restored = restoreToggles({ [first]: false, gone: false, [second]: "yes" }, BASE);
    expect(restored[first]).toBe(false);
    expect(restored[second]).toBe(true);
    expect("gone" in restored).toBe(false);
    expect(restoreToggles(null, BASE)).toEqual(BASE);
    expect(restoreToggles("junk", BASE)).toEqual(BASE);
  });
});

describe("FeatureSwitches", () => {
  it("tells its listeners, and keeps what is flipped, only on a change", () => {
    const keep = vi.fn();
    const switches = new FeatureSwitches(BASE, keep);
    const heard = vi.fn();
    const stop = switches.subscribe(heard);
    const before: FeatureToggles = switches.toggles();
    switches.set(first, true);
    expect(heard).not.toHaveBeenCalled();
    switches.set(first, false);
    expect(switches.isOn(first)).toBe(false);
    expect(switches.toggles()).not.toBe(before);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(keep).toHaveBeenCalledWith(first, false);
    stop();
    switches.set(first, true);
    expect(heard).toHaveBeenCalledTimes(1);
  });
});
