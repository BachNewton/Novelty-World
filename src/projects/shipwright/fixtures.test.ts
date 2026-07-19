import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { FIXTURE_KINDS, createFixture } from "./fixtures";

describe("fixtures", () => {
  it("a helm exposes a wheel transform and no engine handles", () => {
    const helm = createFixture("helm");
    expect(helm.kind).toBe("helm");
    expect(helm.wheel).toBeInstanceOf(THREE.Object3D);
    expect(helm.steer).toBeNull();
    expect(helm.prop).toBeNull();
    expect(helm.object.children.length).toBeGreaterThan(0);
    helm.dispose();
  });

  it("an engine exposes steer + prop transforms and no wheel", () => {
    const engine = createFixture("engine");
    expect(engine.kind).toBe("engine");
    expect(engine.wheel).toBeNull();
    expect(engine.steer).toBeInstanceOf(THREE.Object3D);
    expect(engine.prop).toBeInstanceOf(THREE.Object3D);
    // The prop hangs off the swivel mount, so steering carries it — a contract the linkage step relies on.
    expect(engine.prop?.parent).toBe(engine.steer);
    engine.dispose();
  });

  it("every kind builds in the canonical +Z frame and disposes without throwing", () => {
    for (const kind of FIXTURE_KINDS) {
      const fixture = createFixture(kind);
      expect(fixture.object.rotation.y).toBe(0); // built facing +Z; placement rotates it, not this file
      expect(() => fixture.dispose()).not.toThrow();
    }
  });
});
