import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { inlineBaker } from "./bake";
import { freezeRoom } from "./freeze";
import { stubCanvas } from "./headless";
import { buildHouse, shellRoom } from "./house";
import { HOUSE_FIXTURE } from "./house-layout";
import { MAX_DRAW_CALLS, MAX_LIVE_SHADOWS, MAX_TEXTURE_UNITS } from "./lighting";
import { createLitFloor } from "./lit-floor";
import { TILE, type RoomDefinition } from "./room";
import { BENCH_ROOMS } from "./rooms";
import { buildRoom } from "./stage";

// The house is built while the tests are collected, so the stand-in canvas goes in first.
stubCanvas();

/** Draw calls a scene would make with nothing culled: one per visible mesh and material. */
function drawCalls(root: THREE.Object3D): number {
  let calls = 0;
  root.traverseVisible((object) => {
    if (object instanceof THREE.Mesh) calls += Array.isArray(object.material) ? object.geometry.groups.length : 1;
  });
  return calls;
}

/** Texture units a material's shader samples: its maps, the lightmap and the flicker map that rides with it. */
function textureUnits(material: THREE.Material): number {
  const maps = ["map", "lightMap", "alphaMap", "aoMap", "emissiveMap", "specularMap", "envMap"].filter((key) => (material as unknown as Record<string, unknown>)[key] instanceof THREE.Texture);
  return maps.length + (maps.includes("lightMap") ? 1 : 0);
}

describe("the house's draw budget", () => {
  const house = buildHouse(HOUSE_FIXTURE);
  beforeAll(() => house.ready, 120_000);

  for (const floor of house.floors) {
    it(`${floor} floor: within ${MAX_DRAW_CALLS} draw calls and ${MAX_TEXTURE_UNITS} texture units`, () => {
      house.showFloor(floor);
      const calls = drawCalls(house.root);
      const units = new Set<number>();
      house.root.traverseVisible((object) => {
        if (object instanceof THREE.Mesh) for (const material of [object.material].flat() as THREE.Material[]) units.add(textureUnits(material) + MAX_LIVE_SHADOWS);
      });
      console.info(`${floor}: ${calls} draw calls; bake ${Math.round(house.bakes.get(floor)?.ms ?? 0)} ms`);
      expect(calls).toBeLessThanOrEqual(MAX_DRAW_CALLS);
      expect(Math.max(...units)).toBeLessThanOrEqual(MAX_TEXTURE_UNITS);
    });
  }

  it("re-bakes a room with its neighbours when it is rebuilt", async () => {
    const rebake = await house.rebake("foyer");
    console.info(`re-baking the foyer: ${rebake.rooms.join(", ")} in ${Math.round(rebake.ms)} ms`);
    expect(new Set(rebake.rooms)).toEqual(new Set(["foyer", "grand-staircase", "entrance-hall", "dining-room", "library"]));
  }, 60_000);

  for (const room of BENCH_ROOMS) {
    it(`${room.id} on the bench: within the budget`, async () => {
      const floor = createLitFloor(inlineBaker());
      await floor.place([{ id: room.id, room: freezeRoom(room.id, buildRoom(room)), matrix: new THREE.Matrix4() }]);
      expect(drawCalls(floor.root)).toBeLessThanOrEqual(MAX_DRAW_CALLS / 4);
    }, 60_000);
  }
});

describe("light between rooms", () => {
  /** A lamp in the middle of a hallway, bright enough to reach the next room. */
  const lit: RoomDefinition = { ...shellRoom("creaky-hallway"), lights: [{ at: [0, 1.5, 0], colour: "amber", intensity: 30, range: 12 }] };

  /** The baked light on the floor of the room to the right of the lamp, just inside its left edge. */
  async function lightNextDoor(neighbour: string, turn: number): Promise<number> {
    const floor = createLitFloor(inlineBaker());
    const right = new THREE.Matrix4().compose(new THREE.Vector3(TILE, 0, 0), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), turn), new THREE.Vector3(1, 1, 1));
    const dark = freezeRoom(neighbour, buildRoom(shellRoom(neighbour), { explorer: null }));
    await floor.place([
      { id: lit.id, room: freezeRoom(lit.id, buildRoom(lit, { explorer: null })), matrix: new THREE.Matrix4() },
      { id: neighbour, room: dark, matrix: right },
    ]);
    const baked = floor.rooms.get(neighbour)?.light;
    if (!baked) throw new Error("The neighbour was not baked");
    // The floor texel nearest a point just inside the neighbour's left edge, in the scene.
    const target = new THREE.Vector3(TILE / 2 + 0.5, 0, 0);
    const { position, normal, index } = dark.texels;
    let best = -1;
    let bestDistance = Infinity;
    const point = new THREE.Vector3();
    for (let n = 0; n < index.length; n++) {
      if (normal[n * 3 + 1] < 0.99) continue;
      point.fromArray(position, n * 3).applyMatrix4(right);
      if (Math.abs(point.y) > 1e-3) continue;
      const distance = point.distanceTo(target);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index[n];
      }
    }
    return THREE.DataUtils.fromHalfFloat(baked.irradiance[best * 4 + 1]);
  }

  it("spills through an open doorway onto the floor beyond", async () => {
    expect(await lightNextDoor("panic-room", 0)).toBeGreaterThan(0.1);
  });

  it("is stopped by a solid wall", async () => {
    expect(await lightNextDoor("panic-room", Math.PI)).toBe(0);
  });
});
