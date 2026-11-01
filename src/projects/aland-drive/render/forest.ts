import { BufferAttribute, BufferGeometry, DoubleSide, Frustum, IndirectStorageBufferAttribute, Matrix4, Mesh, MeshBasicNodeMaterial, StorageBufferAttribute, Vector2, Vector3, Vector4, type Node, type PerspectiveCamera, type Scene, type WebGPURenderer } from "three/webgpu";
import { atomicAdd, atomicStore, attribute, cos, dot, float, floor, Fn, fract, If, instanceIndex, min, mix, screenCoordinate, select, sin, smoothstep, sqrt, storage, uint, uniform, varying, vec2, vec3, vec4 } from "three/tsl";
import { HEIGHT_RANGE, HEIGHT_ROLL, JITTER, JITTER_ROLLS, NEAR_STEP_M, ROAD_COVERAGE, ROAD_LOOK_M, SHORTEST_M } from "./tree-place";

/*
 * The forest, with no list of trees anywhere: a tree is a place on a lattice of the
 * world. What stands there is worked out from the place, how tall from the tile's
 * canopy image and the rest from rolls, so a tree is the same tree whenever it comes
 * back, and nothing is stored or streamed for one.
 *
 * Each frame a compute pass goes through the places within the forest's reach of the
 * camera and keeps those where a tree stands, clear of roads and in the view, writing
 * them into one list for each model with all a vertex needs. Only the lists are drawn,
 * so a place with no tree and a tree behind the camera cost no vertices, and every
 * tree can stay to the forest's reach.
 *
 * A tree never changes height, and stands on ground chosen by its distance and not its
 * model, so a handover can't move it. It's the turned shape out to `fullReachM`, then
 * a plain cone where it's a few pixels, by a screen-door crossfade: for those metres
 * it's on both lists, and the two take opposite pixels of a fixed pattern, so a tree is
 * always whole. At the far edge trees dissolve, tiny, and by then the terrain has risen
 * by the canopy behind them (`canopyLift`).
 *
 * All three species are one mesh: its rings say where each species' outline goes.
 */

export interface ForestSettings {
  /** How far out every tree is the full shape. */
  fullReachM: number;
  /** How far out there are trees. */
  forestReachM: number;
  /** The share of places that stay past the full shape: below 1 the rest dissolve and those left fill out to cover for them. */
  farDensity: number;
}

/** The buffers are sized for this, so a setting at or below it changes a number and rebuilds nothing. */
export const FOREST_MOST: ForestSettings = { fullReachM: 1000, forestReachM: 2400, farDensity: 1 };

const PLACES_A_GROUP = 64;
/** Each change starts between the first pair, by a roll for each tree, and takes the run. The first two count from the full reach, the last from the forest's. */
const HANDOVER: Band = [0, 68, 24];
const THINNING: Band = [92, 252, 64];
const EDGE: Band = [-220, -90, 90];
/** A triangle's outline is narrower than the turned shape's, for the same radius. */
const CONE_FILL = 1.25;
/** Stood this far into the ground, so the coarser ground a shader reads never shows under a trunk on a slope. */
const SINK_M = 0.5;
/** A tree eases from each ring's ground to the next's over these runs, by its distance, and each run is done before the ring it leaves runs out. */
const GROUND_RUNS: [number, number][] = [
  [200, 340],
  [560, 740],
  [1200, 1450],
];
/** No ground in the world, with the tallest tree the canopy image can hold on it, is outside these, or a tree's crown wider than this. */
const WORLD_HEIGHTS_M = [-10, 225];
const WIDEST_CROWN_M = 15;
/** A share of a tree's height: past this from the middle of its trunk there's none of it, whichever model. */
const TREE_BOUND = 0.6;
/** A tree in a list is two rows of four floats. */
const ROWS_A_TREE = 2;
/** Where each list's draw starts in the buffer of draws, and where in a draw its count of trees is. */
const TURNED_DRAW = 0;
const CONE_DRAW = 5;
const TREES_AT = 1;

type Band = [from: number, to: number, run: number];

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

const CONE_RINGS: Ring[] = [
  [[0.08, 0.17, 1], [0.52, 0.15, 1], [0.32, 0.14, 1]],
  [[1, 0, 1], [1, 0, 1], [1, 0, 1]],
];

const NEAR_SIDES = 5;
const FAR_SIDES = 3;

/** A spun outline: per vertex, each species' height and width and whether it's leaves, and its way round. */
function turned(rings: Ring[], sides: number): BufferGeometry {
  const positions: number[] = [];
  const heights: number[] = [];
  const radii: number[] = [];
  const leaves: number[] = [];
  const indices: number[] = [];
  const across = sides + 1;
  rings.forEach((ring, level) => {
    const tip = ring.every(([, wide]) => wide === 0);
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
        indices.push(here - across, here - across + 1, here);
        if (!tip) indices.push(here, here - across + 1, here + 1);
      }
    }
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(Float32Array.from(positions), 3));
  geometry.setAttribute("heights", new BufferAttribute(Float32Array.from(heights), 3));
  geometry.setAttribute("radii", new BufferAttribute(Float32Array.from(radii), 3));
  geometry.setAttribute("leaves", new BufferAttribute(Float32Array.from(leaves), 3));
  geometry.setIndex(indices);
  return geometry;
}

const roll = (cell: Node<"vec2">, a: number, b: number) => fract(sin(dot(cell, vec2(a, b))).mul(43758.5453));

/** The most lattice places in a circle, with room for a tree's jitter and the lattice's edge, so a list can't overrun. */
const placesWithin = (metres: number) => Math.ceil(Math.PI * (metres / NEAR_STEP_M + 2) ** 2);

const bandEnd = ([, to, run]: Band) => to + run;

/** The settings as a shader reads them. The terrain's canopy rise reads the same reach, so the two can't part. */
export interface ForestKnobs {
  fullReach: Node<"float">;
  forestReach: Node<"float">;
  farDensity: Node<"float">;
  get: () => ForestSettings;
  set: (settings: ForestSettings) => void;
}

export function forestKnobs(settings: ForestSettings): ForestKnobs {
  const fullReach = uniform(0);
  const forestReach = uniform(0);
  const farDensity = uniform(0);
  const knobs: ForestKnobs = {
    fullReach,
    forestReach,
    farDensity,
    get: () => ({ fullReachM: fullReach.value, forestReachM: forestReach.value, farDensity: farDensity.value }),
    set({ fullReachM, forestReachM, farDensity: density }) {
      fullReach.value = Math.min(fullReachM, FOREST_MOST.fullReachM);
      forestReach.value = Math.min(forestReachM, FOREST_MOST.forestReachM);
      farDensity.value = Math.min(density, FOREST_MOST.farDensity);
    },
  };
  knobs.set(settings);
  return knobs;
}

/** Where each change of detail starts and has finished by, for the lab to mark on the ground: the handover, the thinning and the edge. */
export function forestBands({ fullReachM, forestReachM, farDensity }: ForestSettings): [number, number][] {
  return [
    [fullReachM + HANDOVER[0], fullReachM + bandEnd(HANDOVER)],
    farDensity < 1 ? [fullReachM + THINNING[0], fullReachM + bandEnd(THINNING)] : [0, 0],
    [forestReachM + EDGE[0], forestReachM + bandEnd(EDGE)],
  ];
}

export interface ForestInputs {
  knobs: ForestKnobs;
  canopyAt: (place: Node<"vec2">) => Node<"float">;
  /** The ground at a place on one of the terrain's rings. */
  groundAt: (ring: number, place: Node<"vec2">) => Node<"float">;
  /** How much road the mask holds at a place, and the size of a tile: a tree stands clear of roads, and of a neighbour's over a tile's edge. */
  roads?: { at: (place: Node<"vec2">) => Node<"float">; tileM: number };
  colour: (name: string) => Node<"vec3">;
  hazed: (color: Node<"vec3">) => Node<"vec3">;
  sun: { azimuthDeg: number; elevationDeg: number };
  /** The forest lab's colours in place of a tree's own. The game passes none, and its shaders hold none of this. */
  paint?: (tree: PaintedTree) => Node<"vec3">;
}

export type ForestModel = "turned" | "cone";

export interface PaintedTree {
  model: ForestModel;
  /** The tree's own colour. */
  natural: Node<"vec3">;
  /** Part way through a handover, or dissolving. */
  changing: Node<"bool">;
  /** How far the ground under a tree moves between two rings. */
  groundGap: Node<"float">;
}

/** How many trees each list drew, and their triangles. */
export interface ForestDrawn {
  turned: number;
  cone: number;
  triangles: number;
}

export interface Forest {
  /** Picks this frame's trees: distance is measured from a spot and the view is a camera's, which the map's flight keeps apart. */
  update: (spot: Vector3, camera: PerspectiveCamera) => void;
  /** Builds the compute pipelines, which would otherwise stall the first frame that uses them. */
  compile: () => Promise<void>;
  show: (model: ForestModel, shown: boolean) => void;
  /** The GPU's counts, read back without holding a frame up, so a few frames old, and nothing at first. */
  drawn: () => ForestDrawn;
  dispose: () => void;
}

export function createForest(scene: Scene, renderer: WebGPURenderer, { knobs, canopyAt, groundAt, roads, colour, hazed, sun, paint }: ForestInputs): Forest {
  const cameraSpot = uniform(new Vector2());
  const anchor = uniform(new Vector2());
  const placesAcross = uniform(1, "uint");
  const sides = [0, 1, 2, 3].map(() => ({ plane: uniform(new Vector4()), rough: uniform(0) }));
  const sunWay = (sun.azimuthDeg * Math.PI) / 180;
  const toSun = vec2(Math.sin(sunWay), -Math.cos(sunWay));
  // Interleaved gradient noise: a fixed pattern on the screen, with no clumps for a crossfade to show as.
  const pattern = fract(fract(dot(screenCoordinate.xy, vec2(0.06711056, 0.00583715))).mul(52.9829189));

  const turnedShape = turned(NEAR_RINGS, NEAR_SIDES);
  const coneShape = turned(CONE_RINGS, FAR_SIDES);
  const indicesOf = (shape: BufferGeometry) => shape.getIndex()?.count ?? 0;
  const draws = new IndirectStorageBufferAttribute(Uint32Array.from([indicesOf(turnedShape), 0, 0, 0, 0, indicesOf(coneShape), 0, 0, 0, 0]), 5);
  const counters = storage(draws, "uint", draws.array.length).toAtomic();
  const turnedRows = placesWithin(FOREST_MOST.fullReachM + bandEnd(HANDOVER)) * ROWS_A_TREE;
  const coneRows = placesWithin(FOREST_MOST.forestReachM) * ROWS_A_TREE;
  const turnedList = new StorageBufferAttribute(turnedRows, 4);
  const coneList = new StorageBufferAttribute(coneRows, 4);

  const shareLeft = (distance: Node<"float">, tree: Node<"float">, reach: Node<"float">, [from, to, run]: Band) => {
    const starts = mix(reach.add(from), reach.add(to), tree);
    return float(1).sub(smoothstep(starts, starts.add(run), distance));
  };

  const roadsAround = (place: Node<"vec2">) => {
    if (!roads) return float(0);
    // The mask stops at a tile's edge, so close to one a tree looks over it too.
    const inTile = fract(place.div(roads.tileM)).mul(roads.tileM).toVar();
    const over = (spot: Node<"float">) => select(spot.lessThan(ROAD_LOOK_M), float(-ROAD_LOOK_M), select(spot.greaterThan(roads.tileM - ROAD_LOOK_M), float(ROAD_LOOK_M), float(0)));
    return roads.at(place).max(roads.at(place.add(vec2(over(inTile.x), over(inTile.y)))));
  };

  const reset = Fn(() => {
    atomicStore(counters.element(TURNED_DRAW + TREES_AT), uint(0));
    atomicStore(counters.element(CONE_DRAW + TREES_AT), uint(0));
  })().compute(1);

  const writeTurned = storage(turnedList, "vec4", turnedRows);
  const writeCone = storage(coneList, "vec4", coneRows);
  const cull = Fn(() => {
    const cell = vec2(instanceIndex.mod(placesAcross), instanceIndex.div(placesAcross)).add(anchor).toVar();
    const jitter = vec2(roll(cell, ...JITTER_ROLLS[0]), roll(cell, ...JITTER_ROLLS[1])).sub(0.5).mul(JITTER * NEAR_STEP_M);
    const place = cell.mul(NEAR_STEP_M).add(jitter).toVar();
    const distance = place.sub(cameraSpot).length().toVar();
    // The world's heights stand in for the ground at first, so a place behind the camera costs no read of any image.
    const perhapsSeen = sides.map(({ plane, rough }) => dot(plane.xz, place).add(rough).greaterThanEqual(0)).reduce((all, side) => all.and(side));

    If(distance.lessThan(knobs.forestReach).and(perhapsSeen), () => {
      const height = canopyAt(place).mul(mix(float(HEIGHT_RANGE[0]), float(HEIGHT_RANGE[1]), roll(cell, ...HEIGHT_ROLL))).toVar();
      If(height.greaterThanEqual(SHORTEST_M), () => {
        If(roadsAround(place).lessThanEqual(ROAD_COVERAGE), () => {
          const ground = float(0).toVar();
          const between = (ring: number) => {
            const [from, to] = GROUND_RUNS[ring];
            ground.assign(mix(groundAt(ring, place), groundAt(ring + 1, place), smoothstep(float(from), float(to), distance)));
          };
          If(distance.lessThan(GROUND_RUNS[0][1]), () => between(0))
            .ElseIf(distance.lessThan(GROUND_RUNS[1][1]), () => between(1))
            .Else(() => between(2));

          const middle = vec3(place.x, ground.add(height.mul(0.5)), place.y).toVar();
          const seen = sides.map(({ plane }) => dot(plane.xyz, middle).add(plane.w).add(height.mul(TREE_BOUND)).greaterThanEqual(0)).reduce((all, side) => all.and(side));
          If(seen, () => {
            const tree = roll(cell, 21.17, 5.71).toVar();
            const edgeShare = shareLeft(distance, tree, knobs.forestReach, EDGE);
            const stays = roll(cell, 73.31, 29.47).lessThan(knobs.farDensity);
            const coneTo = select(stays, edgeShare, min(edgeShare, shareLeft(distance, tree, knobs.fullReach, THINNING))).toVar();
            const turnedShare = shareLeft(distance, tree, knobs.fullReach, HANDOVER).toVar();
            const turnedTo = min(turnedShare, coneTo).toVar();

            // Mostly spruce and pine, in stands rather than salt and pepper; birch at a share of it.
            const stand = fract(sin(dot(floor(place.div(70)), vec2(7.13, 3.77))).mul(9173.31));
            const mixRoll = roll(cell, 3.11, 47.3).mul(0.55).add(stand.mul(0.45)).toVar();
            const species = select(mixRoll.greaterThanEqual(0.745), float(2), select(mixRoll.greaterThanEqual(0.455), float(1), float(0)));
            const look = species.add(roll(cell, 17.3, 91.1).mul(0.99)).toVar();
            const yaw = roll(cell, 54.1, 18.7).mul(6.283).toVar();
            const standing = vec4(place.x, ground.sub(SINK_M), place.y, height).toVar();

            const list = (rows: typeof writeTurned, draw: number, from: Node<"float">, to: Node<"float">) => {
              const row = atomicAdd(counters.element(draw + TREES_AT), uint(1)).mul(ROWS_A_TREE).toVar();
              rows.element(row).assign(standing);
              rows.element(row.add(1)).assign(vec4(yaw, look, from, to));
            };
            If(turnedTo.greaterThan(0), () => list(writeTurned, TURNED_DRAW, float(0), turnedTo));
            If(coneTo.greaterThan(turnedShare), () => list(writeCone, CONE_DRAW, turnedShare, coneTo));
          });
        });
      });
    });
  })().computeKernel([PLACES_A_GROUP]);

  const meshes: { model: ForestModel; mesh: Mesh }[] = [];
  const model = (name: ForestModel, geometry: BufferGeometry, list: StorageBufferAttribute, rows: number, draw: number) => {
    geometry.setIndirect(draws, draw * Uint32Array.BYTES_PER_ELEMENT);
    const trees = storage(list, "vec4", rows).toReadOnly();
    const standing = trees.element(instanceIndex.mul(ROWS_A_TREE)).toVar();
    const carried = trees.element(instanceIndex.mul(ROWS_A_TREE).add(1)).toVar();
    const place = standing.xz;
    const height = standing.w;
    const species = floor(carried.y);
    const isSpecies = (which: number) => float(1).sub(species.sub(which).abs().min(1));
    const [isSpruce, isPine, isBirch] = [isSpecies(0), isSpecies(1), isSpecies(2)];
    const pick = (values: Node<"vec3">) => values.x.mul(isSpruce).add(values.y.mul(isPine)).add(values.z.mul(isBirch));

    const yaw = carried.x;
    const unit = attribute<"vec3">("position", "vec3");
    const radial = vec2(unit.x.mul(cos(yaw)).sub(unit.z.mul(sin(yaw))), unit.x.mul(sin(yaw)).add(unit.z.mul(cos(yaw))));
    const rise = pick(attribute<"vec3">("heights", "vec3"));
    // Those left past the thinning fill out to cover for the rest, so the forest keeps its weight.
    const filling = smoothstep(knobs.fullReach.add(THINNING[0]), knobs.fullReach.add(bandEnd(THINNING)), place.sub(cameraSpot).length());
    const fill = name === "cone" ? mix(float(1), sqrt(float(1).div(knobs.farDensity)), filling).mul(CONE_FILL) : float(1);
    const width = pick(attribute<"vec3">("radii", "vec3")).mul(fill);
    const material = new MeshBasicNodeMaterial();
    material.positionNode = vec3(place.x.add(radial.x.mul(width).mul(height)), standing.y.add(rise.mul(height)), place.y.add(radial.y.mul(width).mul(height)));

    const live = varying(carried.zw);
    const same = varying(vec4(isSpruce, isPine, isBirch, fract(carried.y).div(0.99)));
    // Sharp at once, or a crown's underside takes the colour of the trunk it spreads from.
    const leafy = smoothstep(float(0), float(0.08), varying(pick(attribute<"vec3">("leaves", "vec3"))));
    const leaf = colour("tree-spruce").mul(same.x).add(colour("tree-pine").mul(same.y)).add(colour("tree-birch").mul(same.z));
    const bark = colour("tree-bark").mul(same.x.add(same.y)).add(colour("tree-birch-bark").mul(same.z));
    const sunSide = dot(varying(radial), toSun).mul(0.2).add(1);
    const shaded = varying(rise).mul(0.5).add(0.62).mul(sunSide).mul(mix(float(0.84), float(1.14), same.w));
    const natural = mix(bark, leaf, leafy);
    const painted = paint ? paint({ model: name, natural, changing: live.x.greaterThan(0).or(live.y.lessThan(1)), groundGap: varying(groundAt(1, place).sub(groundAt(2, place)).abs()) }) : natural;
    material.colorNode = hazed(painted.mul(shaded));
    material.maskNode = pattern.greaterThanEqual(live.x).and(pattern.lessThan(live.y));
    material.side = DoubleSide;
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    scene.add(mesh);
    meshes.push({ model: name, mesh });
  };
  model("turned", turnedShape, turnedList, turnedRows, TURNED_DRAW);
  model("cone", coneShape, coneList, coneRows, CONE_DRAW);

  const frustum = new Frustum();
  const viewProjection = new Matrix4();
  const aim = (spot: Vector3) => {
    const across = Math.ceil((2 * knobs.get().forestReachM) / NEAR_STEP_M) + 2;
    placesAcross.value = across;
    anchor.value.set(Math.floor(spot.x / NEAR_STEP_M) - across / 2, Math.floor(spot.z / NEAR_STEP_M) - across / 2);
    cameraSpot.value.set(spot.x, spot.z);
    cull.dispatchSize = [Math.ceil((across * across) / PLACES_A_GROUP), 1, 1];
  };

  aim(new Vector3());

  let counts: ForestDrawn = { turned: 0, cone: 0, triangles: 0 };
  let reading = false;
  return {
    update(spot, camera) {
      aim(spot);
      camera.updateMatrixWorld();
      frustum.setFromProjectionMatrix(viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      sides.forEach(({ plane, rough }, side) => {
        const { normal, constant } = frustum.planes[side];
        plane.value.set(normal.x, normal.y, normal.z, constant);
        rough.value = constant + Math.max(normal.y * WORLD_HEIGHTS_M[0], normal.y * WORLD_HEIGHTS_M[1]) + WIDEST_CROWN_M;
      });
      void renderer.compute([reset, cull]);
    },
    async compile() {
      await renderer.computeAsync([reset, cull]);
    },
    show(shown, visible) {
      for (const { model: entry, mesh } of meshes) {
        if (entry === shown) mesh.visible = visible;
      }
    },
    drawn() {
      if (!reading) {
        reading = true;
        void renderer.getArrayBufferAsync(draws).then((bytes) => {
          const read = new Uint32Array(bytes as ArrayBuffer);
          const [turnedTrees, coneTrees] = [read[TURNED_DRAW + TREES_AT], read[CONE_DRAW + TREES_AT]];
          counts = { turned: turnedTrees, cone: coneTrees, triangles: (turnedTrees * indicesOf(turnedShape) + coneTrees * indicesOf(coneShape)) / 3 };
          reading = false;
        });
      }
      return counts;
    },
    dispose() {
      for (const { mesh } of meshes) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as MeshBasicNodeMaterial).dispose();
      }
      reset.dispose();
      cull.dispose();
      draws.dispose();
      turnedList.dispose();
      coneList.dispose();
    },
  };
}
