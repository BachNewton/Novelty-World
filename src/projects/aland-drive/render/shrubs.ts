import { BufferAttribute, BufferGeometry, DoubleSide, MeshBasicNodeMaterial, StorageBufferAttribute, type Node, type PerspectiveCamera, type Scene, type Vector3, type WebGPURenderer } from "three/webgpu";
import { abs, attribute, cameraPosition, cos, dot, float, fract, If, int, mix, normalize, positionGeometry, positionWorld, round, screenCoordinate, select, sin, smoothstep, step, storage, uint, uniformArray, varying, vec2, vec3, vec4 } from "three/tsl";
import { outsideCar } from "../art/car-volume";
import { buildBirch, buildBush, buildJuniper, RURAL_PARTS, ruralColours, ruralPaint, type RuralPart } from "../art/rural";
import { flatNormal } from "../art/flat-normal";
import { placeSeed, unitOf } from "../art/hash";
import { crownLeftOf, CROWN_GONE, FALL_SPAN, FRESH_SHARE, HAZE_EDGE, HAZE_LIGHT, hazeByDistance, leavesOf, snowHeldOf, snowOnFace } from "../art/leaves";
import { bareVertex } from "../art/bare-wood";
import { barePlants } from "../art/rural/bare-plants";
import { seasonNodes, type SeasonLook } from "../art/season";
import type { RoadsideInputs, RoadsideModel } from "../art/roadside";
import { groundKinds } from "../art/surfaces";
import { foliageLight } from "./foliage-light";
import { towardsSun } from "../art/sun";
import { bandColours, clearOfBuildings, createPlanting, placesWithin, reachOf, roll, spreadOf, type Lattice, type ListFill } from "./planting";
import { STONE_WALL_HALF_WIDE_M } from "./tile-walls";
import { FAR_CLEARING, onLineReading, type WallDistance } from "./wall-clearing";
import type { LandAt } from "./tile-reads";

/*
 * Bushes, junipers and young birches, a planting (`planting.ts`) like the verge and
 * the reeds: no list, only a rule over images every far tile already has.
 *
 * Hazel and sallow, and birches coming up, stand along forest edges: open ground with
 * the canopy close by, where a field or a meadow meets the trees. Sallow likes water
 * near. Juniper stands on open rock among the trees, as on Åland's grazed outcrops:
 * the photo's stone with forest within about 60 m, because in a spring photo a bare
 * ploughed field is as pale as rock, and fields lie open.
 *
 * The verge's rules for detail hold: nothing changes size, a lattice of bushes and a
 * sparser one of birches each end by dissolving one at a time where they're a few
 * pixels, and far off a plant takes on the photo's colour there. Past its swap each
 * model is the kit's far version, painted band by band in its near version's colours.
 */

const WIDEST_M = 4;
const BUSHES = 0;
const BIRCHES = 1;
const LATTICES: Lattice[] = [
  { stepM: 2.5, ends: [420, 520, 40], salt: 233.9 },
  { stepM: 6, ends: [1100, 1350, 80], salt: 712.4 },
];
/** The farthest any of its plants stands from the camera. */
const REACH_M = Math.max(...LATTICES.map(reachOf));
/** The band each model's near and far versions trade pixels over, either side of the swap its kit gives it. */
const SWAP_BAND = 0.15;

/** A forest edge: open where the place is, and canopy this tall on average within about 32 m. */
const AROUND_MIP = 3;
const NEAR_MIP = 4;
const EDGE = [1, 4] as const;
const OPEN_HERE = [0.5, 2] as const;
/** How much of a whole patch reads as stone, from none to all rock. */
const STONE = [0.5, 0.8] as const;
/** The water mask's 32 m level that says water is near, for sallow. */
const WATER_NEAR = 0.05;
const ROAD_CLEAR = 0.03;
const LEAST_DRY = 0.9;
/** Of a full edge's places, those with a bush; of full rock's, those with a juniper; of an edge's birch places, those with one. */
const EDGE_BUSHES = 0.3;
const ROCK_JUNIPERS = 0.25;
const EDGE_BIRCHES = 0.3;
const SALLOW_NEAR_WATER = 0.6;
/** How far a birch's trunk stands off a wall's line, past what the far clearing can read on the line itself. */
const BIRCH_OFF_WALL_M = onLineReading(FAR_CLEARING) + STONE_WALL_HALF_WIDE_M;

/** How much of a plant is the photo's own colour, near. */
const GROUND_SHARE = 0.1;
/** A plant turns from its own colour towards the photo's between these. */
const MATCHES = [250, 700] as const;

/*
 * A plant's light is the forest's (`foliage-light.ts`), from its direction as a whole:
 * out from its middle, so a bush turns from light to shade as one mass. Then it shades
 * itself, darker at its foot than its top, as a tree standing alone does, and each
 * rolls its own brightness and a touch of its hue. Leaves that let the sun through glow
 * at their edges looking towards it; a juniper's needles don't. On the whole a plant is
 * as bright as under the old flat shading, so it still meets the photo it turns to far off.
 */
const MIDDLE = 0.45;
const ROUNDNESS = 1.4;
const FOOT_LIGHT = 0.87;
const TOP_LIGHT = 1.05;
const BRIGHTNESS_ROLL = [0.86, 1.12] as const;
const HUE_ROLL = 0.07;

/*
 * Through the year hazel, sallow and birch turn and lose their leaves as the forest's broadleaves do (`art/leaves.ts`),
 * each on a threshold rolled from its place: the leafy plant shrinks away into its middle as clumps of leaves grow out
 * on its bare stems (`art/rural/bare-plants.ts`), which then fall one by one; near, a bare plant is its stems and twigs,
 * and further off, where those are under a pixel, a see-through haze of its twigs. A juniper stays green. Snow lies on
 * what faces up, a juniper's whole and a bare plant's stems lightly.
 */
const LEAF_PARTS: readonly RuralPart[] = ["bush-lit", "sallow-lit", "birch-leaf"];
/** When each kind's leaves go, as a span of the season's shares, and their autumn colour; a juniper keeps its needles. */
const LEAVES_GO: readonly ({ goes: [number, number]; autumn: string } | null)[] = [
  { goes: [0.1, 0.8], autumn: "autumn-birch" },
  { goes: [0.1, 0.8], autumn: "autumn-birch" },
  { goes: [0.3, 0.95], autumn: "autumn-ash" },
  null,
  null,
  { goes: [0, 0.85], autumn: "autumn-birch" },
  { goes: [0, 0.85], autumn: "autumn-birch" },
];
const LEAF_ROLL = 21;
const SNOW_ROLL = 22;
const TWIG_SNOW = 0.4;
/** Each kind's bare form in `bare-plants.ts`, by its place in `shrubKinds`; a juniper has none. */
const BARE_FORM_OF: readonly (number | null)[] = [0, 0, 1, null, null, 2, 3];
/** A bare plant's stems are drawn out to this many of its own heights from the camera, where they're under a pixel, dissolving over the last share of that. */
const BARE_REACH_HEIGHTS = 30;
const BARE_LEAVE_SHARE = 0.25;
/** A plant's twigs' haze comes in as a tree's does (`hazeByDistance`) at its own size: a 2 m bush's twigs go below a pixel far sooner than a 15 m tree's limbs. */
const HAZE_TREE_M = 10;
/** How dense a bush's twigs stand against a tree crown's, and how much of the leafy plant's outline its haze fills. */
const HAZE_DENSITY = 0.8;
const HAZE_SPREAD = 0.9;
/** How bright each bare kind's bark is, before it darkens to its twigs: a birch's white, a hazel's and sallow's grey-brown. */
const BARK: readonly string[] = ["tree-upright-bark", "tree-upright-bark", "tree-upright-bark", "tree-bark", "tree-bark", "tree-birch-bark", "tree-birch-bark"];

const ROWS = 3;
const BANDS = 5;
/** Edges and rock are a small part of what's in reach: lists hold this share of its places. */
const MOST_PLANTS = 0.08;

/** A blob one unit tall and a unit across its middle, standing on its foot: the shape a bare plant's twigs' haze fills. */
function hazeBlob(): BufferGeometry {
  const sides = 6;
  const positions = [0, 1, 0];
  for (const [up, wide] of [[0.68, 0.85], [0.32, 1]]) {
    for (let side = 0; side < sides; side++) {
      const angle = ((side + up) / sides) * 2 * Math.PI;
      positions.push(Math.sin(angle) * wide * 0.5, up, Math.cos(angle) * wide * 0.5);
    }
  }
  positions.push(0, 0.02, 0);
  const indices: number[] = [];
  const bottom = 1 + 2 * sides;
  for (let side = 0; side < sides; side++) {
    const next = (side + 1) % sides;
    indices.push(0, 1 + side, 1 + next, 1 + side, 1 + sides + side, 1 + next, 1 + next, 1 + sides + side, 1 + sides + next, 1 + sides + side, bottom, 1 + sides + next);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(Float32Array.from(positions), 3));
  geometry.setIndex(indices);
  return geometry;
}

/** How high a shape reaches above its own foot. */
function tallest(shape: BufferGeometry): number {
  const position = shape.getAttribute("position");
  let top = 0;
  for (let at = 0; at < position.count; at++) top = Math.max(top, position.getY(at));
  return top;
}

interface Kind {
  model: RoadsideModel;
  lattice: number;
  sizes: readonly [number, number];
}

/** The bushes, junipers and birches, every one of which the LOD check measures. */
export const shrubKinds = (): Kind[] => [
  { model: buildBush(1, "hazel"), lattice: BUSHES, sizes: [0.7, 1.4] },
  { model: buildBush(2, "hazel"), lattice: BUSHES, sizes: [0.7, 1.4] },
  { model: buildBush(1, "sallow"), lattice: BUSHES, sizes: [0.7, 1.3] },
  { model: buildJuniper(1, "column"), lattice: BUSHES, sizes: [0.7, 1.15] },
  { model: buildJuniper(2, "spreading"), lattice: BUSHES, sizes: [0.8, 1.3] },
  { model: buildBirch(1, "young"), lattice: BIRCHES, sizes: [3.5, 7] },
  { model: buildBirch(2, "clump"), lattice: BIRCHES, sizes: [3.5, 6.5] },
];

export interface ShrubInputs {
  canopyAt: (place: Node<"vec2">, mip: number) => Node<"float">;
  waterAt: (place: Node<"vec2">, mip: number) => Node<"float">;
  landAt: LandAt;
  roadsAt: (place: Node<"vec2">, mip: number) => Node<"float">;
  groundAt: (place: Node<"vec2">) => Node<"float">;
  /** Metres from the drawn waterline, out into the water and below zero on land, at a place no farther than `reachM` from the camera. */
  shoreAt: (place: Node<"vec2">, reachM: number) => Node<"float">;
  /** Metres from the nearest stone wall's line, to the bushes' reach and to the birches', for none to stand up through one. */
  wallDistanceAt: WallDistance;
  wallDistanceFarAt: WallDistance;
  /** Metres from a place to the nearest building (`pipeline/clearing.py`): a plant stands only where its whole spread clears it. */
  clearanceAt: (place: Node<"vec2">) => Node<"float">;
  /** The ground's baked shade as the light on it. */
  lightOf: (shade: Node<"float">) => Node<"float">;
  linear: (name: string) => Vector3;
  hazed: (color: Node<"vec3">) => Node<"vec3">;
  sun: RoadsideInputs["sun"];
  /** The season the bushes turn and fall by and the snow lies in; summer if none. */
  season?: SeasonLook;
}

export interface ShrubsDrawn {
  near: number;
  far: number;
  triangles: number;
  /** Each kind's far list, then each kind's near list, then the bare forms' and the hazes'. */
  lists: ListFill[];
}

export interface Shrubs {
  update: (spot: Vector3, camera: PerspectiveCamera) => void;
  compile: () => Promise<void>;
  show: (shown: boolean) => void;
  drawn: () => ShrubsDrawn;
  dispose: () => void;
}

export function createShrubs(scene: Scene, renderer: WebGPURenderer, { canopyAt, waterAt, landAt, roadsAt, groundAt, shoreAt, wallDistanceAt, wallDistanceFarAt, clearanceAt, lightOf, linear, hazed, sun, season }: ShrubInputs): Shrubs {
  const kinds = shrubKinds();
  const [HAZEL, , SALLOW, JUNIPER, , BIRCH] = [0, 1, 2, 3, 4, 5];

  const toSun = towardsSun(sun);
  const pattern = fract(fract(dot(screenCoordinate.xy, vec2(0.06711056, 0.00583715))).mul(52.9829189));
  const colours = ruralColours(linear);
  const paint = ruralPaint(uniformArray(colours));
  const tallOf = kinds.map(({ model }) => tallest(model.near));
  const seasons = seasonNodes(season);
  const leafParts = LEAF_PARTS.map((part) => RURAL_PARTS.indexOf(part));
  // A far version's bands in its near version's colours, with its leaves as they are in summer, autumn, bare and spring.
  const bandsAs = (leafAs: (kind: number) => Vector3 | null) =>
    uniformArray(
      kinds.flatMap(({ model }, index) => {
        const leaf = leafAs(index);
        const painted = colours.map((colour, part) => (leaf !== null && LEAVES_GO[index] !== null && leafParts.includes(part) ? leaf : colour));
        return bandColours(model.near, painted, Array.from({ length: BANDS }, (_, band) => (tallOf[index] * (band + 1)) / BANDS + (band === BANDS - 1 ? 100 : 0)));
      }),
    );
  const bandsOf = bandsAs(() => null);
  const autumnBandsOf = bandsAs((kind) => linear(LEAVES_GO[kind]?.autumn ?? "autumn-birch"));
  const freshBandsOf = bandsAs(() => linear("tree-fresh"));
  const tallsOf = uniformArray(tallOf, "float");
  const lowOf = uniformArray(kinds.map(({ sizes }) => sizes[0]), "float");
  const highOf = uniformArray(kinds.map(({ sizes }) => sizes[1]), "float");
  const spreadOfKind = uniformArray(kinds.map(({ model }) => spreadOf(model.near)), "float");
  // A bare plant's own tables: its form's vertices, when its leaves go, its leaves' colours and its bark.
  const bare = barePlants();
  const bareTable = new StorageBufferAttribute(bare.table, 4);
  const bareShape = new BufferGeometry();
  bareShape.setAttribute("position", new BufferAttribute(Float32Array.from({ length: bare.vertices * 3 }, (_, at) => (at % 3 === 0 ? at / 3 : 0)), 3));
  bareShape.setIndex(bare.indices);
  const formOfKind = uniformArray(BARE_FORM_OF.map((form) => form ?? 0), "float");
  const goesFrom = uniformArray(LEAVES_GO.map((leafy) => leafy?.goes[0] ?? 0), "float");
  const goesTo = uniformArray(LEAVES_GO.map((leafy) => leafy?.goes[1] ?? 1), "float");
  const leafOfKind = uniformArray(kinds.map((_, index) => colours[leafParts[index === 2 ? 1 : index >= 5 ? 2 : 0]]));
  const autumnOfKind = uniformArray(LEAVES_GO.map((leafy) => linear(leafy?.autumn ?? "autumn-birch")));
  const barkOfKind = uniformArray(BARK.map((name) => linear(name)));
  const BARE_LIST = kinds.length * 2;
  const [FAMILY_FAR, FAMILY_NEAR, FAMILY_BARE, FAMILY_HAZE] = [0, 1, 2, 3];
  const deciduousOf = uniformArray(LEAVES_GO.map((leafy) => (leafy === null ? 0 : 1)), "float");
  const HAZE_LIST = BARE_LIST + 1;
  const bareReachOf = (index: number) => tallOf[index] * BARE_REACH_HEIGHTS;
  const bareCapacity = LATTICES.reduce((sum, lattice, at) => sum + placesWithin(Math.max(...kinds.map((kind, index) => (kind.lattice === at && BARE_FORM_OF[index] !== null ? bareReachOf(index) * kind.sizes[1] : 0))) + WIDEST_M, lattice.stepM), 0);

  const fars = kinds.map(({ model }) => {
    if (model.far === null) throw new Error("A shrub kit model has no far version");
    return model.far;
  });
  const capacityOf = (lattice: number) => Math.ceil(placesWithin(reachOf(LATTICES[lattice]), LATTICES[lattice].stepM) * MOST_PLANTS);
  // A model's swap is for its own size, and a plant is drawn at its own: its change on screen grows with it.
  const nearOf = ({ model, lattice, sizes }: Kind) => placesWithin(model.swapM * sizes[1] * (1 + SWAP_BAND) + WIDEST_M, LATTICES[lattice].stepM);

  /** A plant's leaves as its kind has them, from its place: the share of them it has, and how far they've turned and how fresh they are. */
  const leavesHere = (standing: Node<"vec4">, kind: Node<"int">) => leavesOf(seasons, mix(goesFrom.element(kind) as unknown as Node<"float">, goesTo.element(kind) as unknown as Node<"float">, unitOf(placeSeed(standing.xz), LEAF_ROLL)), FALL_SPAN);
  const placedAt = (standing: Node<"vec4">, size: Node<"float">, local: Node<"vec3">) => {
    const [yawCos, yawSin] = [cos(standing.w), sin(standing.w)];
    return vec3(standing.x.add(local.x.mul(yawCos).add(local.z.mul(yawSin)).mul(size)), standing.y.add(local.y.mul(size)), standing.z.add(local.z.mul(yawCos).sub(local.x.mul(yawSin)).mul(size)));
  };
  const turnedOut = (standing: Node<"vec4">, way: Node<"vec3">) => vec3(way.x.mul(cos(standing.w)).add(way.z.mul(sin(standing.w))), way.y, way.z.mul(cos(standing.w)).sub(way.x.mul(sin(standing.w))));

  /** A bare plant near: its form's stems, twigs and clumps, lit as the trees' trunks and leaves are. */
  const bareMaterial = (standing: Node<"vec4">, look: Node<"vec4">, live: Node<"vec4">, camera: Node<"vec2">) => {
    const kind = int(round(live.w)).toVar();
    const rows = storage(bareTable, "vec4", bareTable.count).toReadOnly();
    const slot = (formOfKind.element(kind) as unknown as Node<"float">).mul(bare.vertices).add(positionGeometry.x).mul(2).toVar();
    const [point, carried] = [rows.element(uint(slot)), rows.element(uint(slot.add(1)))];
    const leaves = leavesHere(standing, kind);
    const plantRoll = fract(standing.w.mul(7.31));
    const vertex = bareVertex(point.xyz, carried, leaves.inLeaf, plantRoll);
    const material = new MeshBasicNodeMaterial();
    material.name = "shrubs-bare";
    material.positionNode = placedAt(standing, live.z, vertex.position);
    const isClump = varying(vertex.isClump);
    const tall = tallsOf.element(kind) as unknown as Node<"float">;
    const up = vertex.position.y.div(tall).clamp(0, 1);
    // Wood looks out along its sides; a clump out from the plant's middle.
    const out = mix(carried.xyz, vertex.position.sub(vec3(0, tall.mul(MIDDLE), 0)), vertex.isClump);
    const rounded = varying(turnedOut(standing, out));
    const leaf = mix(mix(vec3(leafOfKind.element(kind) as unknown as Node<"vec3">), vec3(linear("tree-fresh")), leaves.fresh.mul(FRESH_SHARE)), vec3(autumnOfKind.element(kind) as unknown as Node<"vec3">), leaves.turned);
    // A birch's bark is dark at its foot, and every bark darkens to its twigs.
    const foot = smoothstep(float(0.03), float(0.12), up);
    const bark = mix(mix(vec3(linear("tree-bark")), vec3(barkOfKind.element(kind) as unknown as Node<"vec3">), foot), vec3(linear("tree-twig")), smoothstep(float(0.35), float(1), vertex.thin));
    const painted = varying(mix(bark, leaf, vertex.isClump));
    const snow = varying(snowHeldOf(seasons, unitOf(placeSeed(standing.xz), SNOW_ROLL)).mul(TWIG_SNOW * 2)).mul(snowOnFace(flatNormal().y)).mul(float(1).sub(isClump)).clamp(0, 1);
    const ownShade = varying(mix(float(FOOT_LIGHT), float(TOP_LIGHT), up).mul(mix(float(BRIGHTNESS_ROLL[0]), float(BRIGHTNESS_ROLL[1]), plantRoll)));
    const lit = foliageLight(toSun, rounded, isClump).mul(ownShade);
    const matched = smoothstep(float(MATCHES[0]), float(MATCHES[1]), standing.xz.sub(camera).length());
    const coloured = mix(mix(painted, vec3(linear("tree-snow")), snow).mul(lit), look.rgb.mul(look.w), mix(float(GROUND_SHARE), float(1), matched));
    material.colorNode = hazed(coloured);
    material.maskNode = pattern.lessThan(varying(live.y)).and(outsideCar());
    material.side = DoubleSide;
    return material;
  };

  /** A bare plant's twigs' haze: its leafy self's outline, blended see-through, none near and denser as it shrinks on screen. */
  const hazeMaterial = (standing: Node<"vec4">, live: Node<"vec4">) => {
    const kind = int(round(live.w)).toVar();
    const tall = (tallsOf.element(kind) as unknown as Node<"float">).toVar();
    const wide = (spreadOfKind.element(kind) as unknown as Node<"float">).mul(2 * HAZE_SPREAD);
    const local = vec3(positionGeometry.x.mul(wide), positionGeometry.y.mul(tall), positionGeometry.z.mul(wide));
    const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    material.name = "shrubs-haze";
    material.positionNode = placedAt(standing, live.z, local);
    const rounded = varying(turnedOut(standing, positionGeometry.sub(vec3(0, 0.5, 0))));
    const fromCamera = positionWorld.sub(cameraPosition);
    const thickness = smoothstep(float(0), float(HAZE_EDGE), abs(dot(normalize(rounded), normalize(fromCamera))));
    const bareness = varying(float(1).sub(leavesHere(standing, kind).inLeaf));
    const asTree = varying(float(HAZE_TREE_M).div(tall.mul(live.z)));
    material.colorNode = hazed(vec3(linear("tree-twig")).mul(foliageLight(toSun, rounded, float(0)).mul(HAZE_LIGHT)));
    material.opacityNode = bareness.mul(hazeByDistance(fromCamera.length().mul(asTree))).mul(thickness).mul(HAZE_DENSITY).min(1);
    material.maskNode = pattern.lessThan(varying(live.y)).and(outsideCar());
    material.side = DoubleSide;
    return material;
  };

  const hazeCapacity = kinds.reduce((sum, { lattice }, index) => sum + (BARE_FORM_OF[index] === null ? 0 : capacityOf(lattice)), 0);

  const planting = createPlanting(scene, renderer, {
    lattices: LATTICES,
    byLattice: true,
    widestM: WIDEST_M,
    shapes: [...fars, ...kinds.map(({ model }) => model.near), bareShape, hazeBlob()],
    capacities: [...kinds.map(({ lattice }) => capacityOf(lattice)), ...kinds.map(nearOf), bareCapacity, hazeCapacity],
    rows: ROWS,
    visit({ seed, place, distance, lattice, seenOn, left, write }) {
      const isBushes = lattice === LATTICES[BUSHES];
      const chance = roll(seed, 4).toVar();
      const land = landAt(place);
      If(land.dry.greaterThan(LEAST_DRY).and(roadsAt(place, 1).lessThan(ROAD_CLEAR)).and(shoreAt(place, REACH_M).lessThanEqual(0)), () => {
        const here = canopyAt(place, 0);
        const edge = smoothstep(float(EDGE[0]), float(EDGE[1]), canopyAt(place, AROUND_MIP)).mul(float(1).sub(smoothstep(float(OPEN_HERE[0]), float(OPEN_HERE[1]), here))).toVar();
        const bushes = edge.mul(isBushes ? EDGE_BUSHES : EDGE_BIRCHES).toVar();
        const rock = isBushes
          ? smoothstep(float(STONE[0]), float(STONE[1]), groundKinds(land.wide.pow(vec3(2.2))).stoneShare).mul(select(here.lessThan(OPEN_HERE[0]), float(1), float(0))).mul(smoothstep(float(EDGE[0]), float(EDGE[1]), canopyAt(place, NEAR_MIP)))
          : float(0);
        const junipers = rock.mul(ROCK_JUNIPERS);
        If(chance.lessThan(bushes.add(junipers)), () => {
          const ground = groundAt(place).toVar();
          If(seenOn(ground), () => {
            const pick = roll(seed, 9);
            const near = waterAt(place, AROUND_MIP).greaterThan(WATER_NEAR);
            const bush = select(near.and(pick.lessThan(SALLOW_NEAR_WATER)), float(SALLOW), select(pick.lessThan(0.5), float(HAZEL), float(HAZEL + 1)));
            const kind = (isBushes ? select(chance.lessThan(bushes), bush, select(pick.lessThan(0.5), float(JUNIPER), float(JUNIPER + 1))) : select(pick.lessThan(0.5), float(BIRCH), float(BIRCH + 1))).toVar();
            const size = mix(lowOf.element(int(round(kind))) as unknown as Node<"float">, highOf.element(int(round(kind))) as unknown as Node<"float">, roll(seed, 10)).toVar();
            const spread = size.mul(spreadOfKind.element(int(round(kind))) as unknown as Node<"float">).toVar();
            const clearOfWalls = (isBushes ? wallDistanceAt(place).greaterThan(spread.add(STONE_WALL_HALF_WIDE_M)) : wallDistanceFarAt(place).greaterThan(BIRCH_OFF_WALL_M)).and(clearOfBuildings(clearanceAt, place, spread));
            const remaining = left().toVar();
            const standing = vec4(place.x, ground, place.y, roll(seed, 11).mul(6.283)).toVar();
            const look = vec4(land.broad.pow(vec3(2.2)), lightOf(land.shade)).toVar();
            kinds.forEach((each, index) => {
              if (LATTICES[each.lattice] !== lattice) return;
              If(kind.equal(index), () => {
                const swap = smoothstep(size.mul(each.model.swapM * (1 - SWAP_BAND)), size.mul(each.model.swapM * (1 + SWAP_BAND)), distance).toVar();
                const leafy = LEAVES_GO[index];
                // A plant short of its leaves is its bare stems near and its twigs' haze far; its leafy self stays only while it shrinks away inside them.
                const share = (leafy === null ? float(1) : leavesOf(seasons, mix(float(leafy.goes[0]), float(leafy.goes[1]), unitOf(placeSeed(place), LEAF_ROLL)), FALL_SPAN).inLeaf).toVar();
                const leafed = share.greaterThan(CROWN_GONE);
                If(clearOfWalls.and(leafed).and(swap.greaterThan(0)).and(remaining.greaterThan(0)), () => {
                  write(index, [standing, look, vec4(float(1).sub(swap), remaining, size, kind)]);
                });
                If(clearOfWalls.and(leafed).and(swap.lessThan(1)), () => {
                  write(kinds.length + index, [standing, look, vec4(0, float(1).sub(swap), size, kind)]);
                });
                if (BARE_FORM_OF[index] === null) return;
                const bareReach = size.mul(bareReachOf(index));
                const kept = float(1).sub(smoothstep(bareReach.mul(1 - BARE_LEAVE_SHARE), bareReach, distance)).toVar();
                const short = clearOfWalls.and(share.lessThan(1));
                If(short.and(kept.greaterThan(0)), () => {
                  write(BARE_LIST, [standing, look, vec4(0, kept, size, kind)]);
                });
                If(short.and(remaining.greaterThan(0)), () => {
                  write(HAZE_LIST, [standing, look, vec4(0, remaining, size, kind)]);
                });
              });
            });
          });
        });
      });
    },
    // The leafy far versions, the leafy near ones, the bare plants and their hazes: each family one material, so one
    // pipeline, whatever kind each mesh draws, every kind's own numbers read from tables by the plant's kind.
    familyOf: (shape) => (shape === BARE_LIST ? FAMILY_BARE : shape === HAZE_LIST ? FAMILY_HAZE : shape < kinds.length ? FAMILY_FAR : FAMILY_NEAR),
    materialOf(family, [standing, look, live], camera) {
      if (family === FAMILY_BARE) return bareMaterial(standing, look, live, camera);
      if (family === FAMILY_HAZE) return hazeMaterial(standing, live);
      const local = positionGeometry;
      const size = live.z;
      const [yawCos, yawSin] = [cos(standing.w), sin(standing.w)];
      const material = new MeshBasicNodeMaterial();
      const isFar = family === FAMILY_FAR;
      material.name = isFar ? "shrubs-far" : "shrubs-near";
      const kind = varying(int(round(live.w)));
      // 1 for a plant that loses its leaves, 0 for a juniper, which keeps its needles and holds snow.
      const deciduous = deciduousOf.element(kind) as unknown as Node<"float">;
      const tint = attribute<"vec4">("tint", "vec4");
      const part = round(tint.r.mul(255));
      const isLeaf = leafParts.reduce<Node<"float">>((is, at) => select(part.equal(at), float(1), is), float(0)).mul(deciduous);
      const seasonRoll = (salt: number) => unitOf(placeSeed(standing.xz), salt);
      const leaves = leavesHere(standing, kind);
      const inLeaf = mix(float(1), leaves.inLeaf, deciduous).toVar();
      // As its leaves go a plant's leaves draw in on its middle, while its own stems give way at once to its bare ones.
      const left = mix(step(float(1), inLeaf), crownLeftOf(inLeaf), isLeaf);
      const middle = (tallsOf.element(kind) as unknown as Node<"float">).mul(0.55);
      const [x, y, z] = [local.x.mul(left), mix(middle, local.y, left), local.z.mul(left)];
      material.positionNode = vec3(standing.x.add(x.mul(yawCos).add(z.mul(yawSin)).mul(size)), standing.y.add(y.mul(size)), standing.z.add(z.mul(yawCos).sub(x.mul(yawSin)).mul(size)));
      // The model's own height, before the plant's size, picks the band, as it did when the bands were measured.
      const band = local.y.div(tallsOf.element(kind) as unknown as Node<"float">).mul(BANDS).floor().clamp(0, BANDS - 1);
      const turned = leaves.turned.mul(deciduous);
      const fresh = leaves.fresh.mul(FRESH_SHARE).mul(deciduous);
      const asNow = (summer: Node<"vec3">, autumn: Node<"vec3">, spring: Node<"vec3">) => mix(mix(summer, spring, fresh), autumn, turned);
      const shadeOf = tint.g.mul(255 / 128);
      const bandOf = (bands: typeof bandsOf) => bands.element(int(round(live.w.mul(BANDS).add(band)))) as unknown as Node<"vec3">;
      const autumnHere = vec3(autumnOfKind.element(kind) as unknown as Node<"vec3">).mul(shadeOf);
      const painted = varying(isFar ? asNow(bandOf(bandsOf), bandOf(autumnBandsOf), bandOf(freshBandsOf)) : mix(paint, asNow(paint, autumnHere, vec3(linear("tree-fresh")).mul(shadeOf)), isLeaf));
      const snowHeld = varying(snowHeldOf(seasons, seasonRoll(SNOW_ROLL)).mul(float(1).sub(deciduous)));
      const matched = smoothstep(float(MATCHES[0]), float(MATCHES[1]), standing.xz.sub(camera).length());
      const radial = normalize(vec2(local.x.mul(yawCos).add(local.z.mul(yawSin)), local.z.mul(yawCos).sub(local.x.mul(yawSin))).add(vec2(1e-4, 0)));
      const up = local.y.div(tallsOf.element(kind) as unknown as Node<"float">).clamp(0, 1);
      const rounded = varying(vec3(radial.x, up.sub(MIDDLE).mul(ROUNDNESS), radial.y));
      const seeThrough = select(kind.equal(JUNIPER).or(kind.equal(JUNIPER + 1)), float(0), float(1));
      const plantRoll = fract(standing.w.mul(7.31));
      const ownShade = varying(mix(float(FOOT_LIGHT), float(TOP_LIGHT), up).mul(mix(float(BRIGHTNESS_ROLL[0]), float(BRIGHTNESS_ROLL[1]), plantRoll)));
      const hue = varying(fract(plantRoll.mul(3.17)).sub(0.5).mul(2 * HUE_ROLL));
      const lit = foliageLight(toSun, rounded, seeThrough).mul(ownShade);
      const snowed = mix(painted.mul(vec3(float(1).add(hue), 1, float(1).sub(hue))), vec3(linear("tree-snow")), snowHeld.mul(snowOnFace(flatNormal().y)));
      const coloured = mix(snowed.mul(lit), look.rgb.mul(look.w), mix(float(GROUND_SHARE), float(1), matched));
      material.colorNode = hazed(coloured);
      const pixels = varying(vec2(live.x, live.y));
      material.maskNode = pattern.greaterThanEqual(pixels.x).and(pattern.lessThan(pixels.y)).and(outsideCar());
      material.side = DoubleSide;
      return material;
    },
  });

  return {
    update: planting.update,
    compile: planting.compile,
    show: planting.show,
    drawn() {
      const counts = planting.counts();
      return { far: counts.slice(0, kinds.length).reduce((sum, count) => sum + count, 0), near: counts.slice(kinds.length).reduce((sum, count) => sum + count, 0), triangles: planting.triangles(counts), lists: planting.lists() };
    },
    dispose: planting.dispose,
  };
}
