import { BufferAttribute, DoubleSide, InstancedBufferGeometry, Mesh, MeshBasicNodeMaterial, Vector2, type Node, type Scene, type Vector3 } from "three/webgpu";
import { attribute, cos, dot, float, floor, fract, instanceIndex, mix, select, sin, smoothstep, uniform, vec2, vec3 } from "three/tsl";

/*
 * The forest: two fixed grids of trees that follow the camera, like the terrain,
 * with no list of trees anywhere. An instance is only a place on a lattice of the
 * world, and the shader reads there how tall a tree stands (the tile's canopy
 * image, nothing if there's none) and rolls the rest from the place, so a tree
 * is the same tree whenever it comes back, and moving costs nothing at all.
 *
 * Near the camera trees are turned shapes. Further out every other place goes on
 * as a few triangles of the same outline, opaque, so they need no alpha test and
 * shimmer no worse than any edge. Past those the terrain itself rises by the
 * canopy (`clipmap.ts`).
 *
 * All three species are one mesh: its rings say where each species' outline goes.
 */

const NEAR_STEP_M = 6;
const NEAR_REACH_M = 150;
const FAR_STEP_M = 12;
export const FOREST_REACH_M = 1100;
/** How far a tree moves off its lattice place, as a share of a near cell. */
const JITTER = 0.8;
const FAR_WIDEN = 1.35;
/** Stood this far into the ground, so the coarser ground a shader reads never shows under a trunk on a slope. */
const SINK_M = 0.5;
const SHORTEST_M = 3;

/** How far up, then how wide, as shares of the tree's height, then 0 for bark and 1 for leaves. */
type Point = [up: number, wide: number, leaves: number];
type Ring = [spruce: Point, pine: Point, birch: Point];

const NEAR_RINGS: Ring[] = [
  [[0, 0.016, 0], [0, 0.016, 0], [0, 0.014, 0]],
  [[0.1, 0.014, 0], [0.52, 0.012, 0], [0.32, 0.01, 0]],
  [[0.11, 0.21, 1], [0.54, 0.13, 1], [0.34, 0.1, 1]],
  [[0.34, 0.12, 1], [0.64, 0.17, 1], [0.5, 0.15, 1]],
  [[0.36, 0.17, 1], [0.74, 0.16, 1], [0.66, 0.16, 1]],
  [[0.58, 0.08, 1], [0.82, 0.17, 1], [0.8, 0.13, 1]],
  [[0.6, 0.12, 1], [0.9, 0.12, 1], [0.9, 0.08, 1]],
  [[0.8, 0.04, 1], [0.96, 0.06, 1], [0.97, 0.04, 1]],
  [[1, 0, 1], [1, 0, 1], [1, 0, 1]],
];

const FAR_RINGS: Ring[] = [
  [[0, 0.17, 1], [0.45, 0.12, 1], [0.2, 0.11, 1]],
  [[0.5, 0.1, 1], [0.8, 0.15, 1], [0.6, 0.15, 1]],
  [[1, 0, 1], [1, 0, 1], [1, 0, 1]],
];

const NEAR_SIDES = 5;
const FAR_SIDES = 3;

/** A spun outline: per vertex, each species' height and width and whether it's leaves, and its way round. */
function turned(rings: Ring[], sides: number): InstancedBufferGeometry {
  const positions: number[] = [];
  const heights: number[] = [];
  const radii: number[] = [];
  const leaves: number[] = [];
  const indices: number[] = [];
  const across = sides + 1;
  rings.forEach((ring, level) => {
    for (let side = 0; side < across; side++) {
      // Each ring turns a little from the last and swells unevenly, so a tree isn't a lathe's.
      const angle = ((side % sides) + level * 0.37) * ((2 * Math.PI) / sides);
      const swell = 1 + 0.16 * Math.sin(side * 2.4 + level * 1.7);
      positions.push(Math.sin(angle) * swell, level, Math.cos(angle) * swell);
      heights.push(ring[0][0], ring[1][0], ring[2][0]);
      radii.push(ring[0][1], ring[1][1], ring[2][1]);
      leaves.push(ring[0][2], ring[1][2], ring[2][2]);
      if (level > 0 && side < sides) {
        const here = level * across + side;
        indices.push(here - across, here - across + 1, here, here, here - across + 1, here + 1);
      }
    }
  });
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(Float32Array.from(positions), 3));
  geometry.setAttribute("heights", new BufferAttribute(Float32Array.from(heights), 3));
  geometry.setAttribute("radii", new BufferAttribute(Float32Array.from(radii), 3));
  geometry.setAttribute("leaves", new BufferAttribute(Float32Array.from(leaves), 3));
  geometry.setIndex(indices);
  return geometry;
}

const roll = (cell: Node<"vec2">, a: number, b: number) => fract(sin(dot(cell, vec2(a, b))).mul(43758.5453));

export interface ForestInputs {
  canopyAt: (place: Node<"vec2">) => Node<"float">;
  /** The ground at a place: the terrain's own heights near the camera, read coarser further out. */
  groundNear: (place: Node<"vec2">) => Node<"float">;
  groundFar: (place: Node<"vec2">) => Node<"float">;
  colour: (name: string) => Node<"vec3">;
  hazed: (color: Node<"vec3">) => Node<"vec3">;
  sun: { azimuthDeg: number; elevationDeg: number };
}

export interface Forest {
  update: (camera: Vector3) => void;
  dispose: () => void;
}

export function createForest(scene: Scene, { canopyAt, groundNear, groundFar, colour, hazed, sun }: ForestInputs): Forest {
  const cameraSpot = uniform(new Vector2());
  const sunWay = (sun.azimuthDeg * Math.PI) / 180;
  const toSun = vec2(Math.sin(sunWay), -Math.cos(sunWay));
  const parts: { mesh: Mesh; anchor: { value: Vector2 }; step: number; cells: number }[] = [];

  const grid = (rings: Ring[], sides: number, step: number, reach: number, isNear: boolean) => {
    const cells = Math.ceil((2 * reach) / step);
    const geometry = turned(rings, sides);
    geometry.instanceCount = cells * cells;
    const anchor = uniform(new Vector2());
    const index = float(instanceIndex);
    const lattice = vec2(index.mod(cells), floor(index.div(cells)));
    // The world's own cell, counted in the near lattice's steps, so a far tree is the same tree as the near one at its place.
    const cell = lattice.add(anchor).mul(step / NEAR_STEP_M);
    const jitter = vec2(roll(cell, 12.9898, 78.233), roll(cell, 39.346, 11.135)).sub(0.5).mul(JITTER * NEAR_STEP_M);
    const place = cell.mul(NEAR_STEP_M).add(jitter);
    const height = canopyAt(place).mul(mix(float(0.78), float(1.02), roll(cell, 93.989, 67.345)));
    const offset = place.sub(cameraSpot).length();
    // Each tree changes form at its own distance, so there's no line where they all do.
    const swap = float(NEAR_REACH_M).mul(mix(float(0.78), float(0.98), roll(cell, 21.17, 5.71)));
    const here = height.greaterThanEqual(SHORTEST_M).and(isNear ? offset.lessThan(swap) : offset.greaterThanEqual(swap).and(offset.lessThan(reach)));
    const scale = select(here, height, float(0));

    // Mostly spruce and pine, in stands rather than salt and pepper; birch at a share of it.
    const stand = fract(sin(dot(floor(place.div(70)), vec2(7.13, 3.77))).mul(9173.31));
    const mixRoll = roll(cell, 3.11, 47.3).mul(0.55).add(stand.mul(0.45));
    const isBirch = smoothstep(float(0.74), float(0.75), mixRoll);
    const isPine = smoothstep(float(0.45), float(0.46), mixRoll).mul(float(1).sub(isBirch));
    const isSpruce = float(1).sub(isPine).sub(isBirch);
    const pick = (values: Node<"vec3">) => values.x.mul(isSpruce).add(values.y.mul(isPine)).add(values.z.mul(isBirch));

    const widen = isNear ? 1 : FAR_WIDEN;
    const yaw = roll(cell, 54.1, 18.7).mul(6.283);
    const unit = attribute<"vec3">("position", "vec3");
    const radial = vec2(unit.x.mul(cos(yaw)).sub(unit.z.mul(sin(yaw))), unit.x.mul(sin(yaw)).add(unit.z.mul(cos(yaw))));
    const rise = pick(attribute<"vec3">("heights", "vec3"));
    const width = pick(attribute<"vec3">("radii", "vec3")).mul(widen);
    const ground = (isNear ? groundNear : groundFar)(place);
    const material = new MeshBasicNodeMaterial();
    material.positionNode = vec3(place.x.add(radial.x.mul(width).mul(scale)), ground.sub(SINK_M).add(rise.mul(scale)), place.y.add(radial.y.mul(width).mul(scale)));

    // Sharp at once, or a crown's underside takes the colour of the trunk it spreads from.
    const leafy = smoothstep(float(0), float(0.08), pick(attribute<"vec3">("leaves", "vec3")));
    const leaf = colour("tree-spruce").mul(isSpruce).add(colour("tree-pine").mul(isPine)).add(colour("tree-birch").mul(isBirch));
    const bark = colour("tree-bark").mul(isSpruce.add(isPine)).add(colour("tree-birch-bark").mul(isBirch));
    const sunSide = dot(radial, toSun).mul(0.2).add(1);
    const shaded = rise.mul(0.5).add(0.62).mul(sunSide).mul(mix(float(0.84), float(1.14), roll(cell, 17.3, 91.1)));
    material.colorNode = hazed(mix(bark, leaf, leafy).mul(shaded));
    material.side = DoubleSide;
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    scene.add(mesh);
    parts.push({ mesh, anchor, step, cells });
  };

  grid(NEAR_RINGS, NEAR_SIDES, NEAR_STEP_M, NEAR_REACH_M, true);
  grid(FAR_RINGS, FAR_SIDES, FAR_STEP_M, FOREST_REACH_M, false);

  return {
    update(camera) {
      cameraSpot.value.set(camera.x, camera.z);
      for (const { anchor, step, cells } of parts) anchor.value.set(Math.floor(camera.x / step) - cells / 2, Math.floor(camera.z / step) - cells / 2);
    },
    dispose() {
      for (const { mesh } of parts) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as MeshBasicNodeMaterial).dispose();
      }
    },
  };
}
