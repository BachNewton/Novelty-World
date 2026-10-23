import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { paletteHex, type PaletteKey } from "../palette";
import { CUT_HEIGHT, FLOOR_RINGS, onWall, WALL_HEIGHT, WALL_THICKNESS, wallTurn } from "../room";
import { box, cylinder, flat, group, lathe, lightMaterial } from "../shapes";
import { SKIRTING } from "../stage";
import { glowing, plate } from "./looks";
import type { EdgeSpot } from "./mark-spot";

/*
 * The connection marks: every connection a card can put in any room (the
 * Secret Passage, the Secret Stairs, the Wall Switch of the Revolving Wall,
 * the Mystic Slide) and the Below Collapsed Room landing share one mark, an
 * upright icon of their kind on a softly glowing plate, in a neutral ink or
 * bone with an edge of violet, as these come from cards. The icon carries
 * the meaning and always shows; the stub art beside it tells the story, and
 * is built against the shared stage's walls, never one room's: under the cut
 * height, standing off the skirting, its footprint (`mark-spot.ts`) the
 * stretch of wall it needs. Where a wall has no clear stretch the art gives
 * way and the icon stays.
 *
 * Under review on the marks bench (`?bench=marks`); the game still shows the
 * stand-ins in `looks.ts` until the owner approves these.
 */

/** The kinds of connection mark, by token id: those on a wall, and those on the floor. */
export const WALL_MARKS = ["secret-passage", "secret-stairs", "wall-switch"] as const;
export const FLOOR_MARKS = ["slide", "below-collapsed-room"] as const;
export type WallMarkKind = (typeof WALL_MARKS)[number];
export type FloorMarkKind = (typeof FLOOR_MARKS)[number];
export type MarkKind = WallMarkKind | FloorMarkKind;

/** The icon's plate: ink with a bone icon, or bone with an ink one, both edged in violet. */
export type MarkFace = "ink" | "bone";
const FACES: Record<MarkFace, { ground: PaletteKey; icon: PaletteKey }> = { ink: { ground: "soot", icon: "bone" }, bone: { ground: "boneDark", icon: "soot" } };
/** The edge every mark's plate and icon share: violet, magic from a card, kept clear of every other meaning. */
const EDGE: PaletteKey = "violet";

/** How far a floor mark's art reaches from its middle, in metres: what the placement solver keeps clear for it. */
export const FLOOR_MARK_REACH: Record<FloorMarkKind, number> = { slide: 0.5, "below-collapsed-room": 0.75 };

// ---- The icon ----

/** The upright icon: a medallion standing over its plate, turned to the camera and never smaller on screen than `pixels`. Sizes in metres. */
const MEDALLION = { radius: 0.17, edge: 0.025, lift: 0.12, pixels: 30, segments: 40 };

type Glyph = THREE.Shape[];

/** A band of a circle, from angle `a0` to `a1`, radians anticlockwise from +x. */
function arcBand(r0: number, r1: number, a0: number, a1: number, cx = 0, cy = 0): THREE.Shape {
  const shape = new THREE.Shape();
  shape.absarc(cx, cy, r1, a0, a1, false);
  shape.absarc(cx, cy, r0, a1, a0, true);
  return shape;
}

function polygon(points: readonly (readonly [number, number])[]): THREE.Shape {
  return new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
}

/** An arrowhead at the end `a` of an arc of radius `r`, pointing on round it (`way` +1 anticlockwise, −1 clockwise). */
function arcHead(r: number, a: number, way: 1 | -1, size: number, cx = 0, cy = 0): THREE.Shape {
  const [x, y] = [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const [tx, ty] = [-Math.sin(a) * way, Math.cos(a) * way];
  const [nx, ny] = [Math.cos(a), Math.sin(a)];
  return polygon([
    [x + tx * size, y + ty * size],
    [x + nx * size * 0.8, y + ny * size * 0.8],
    [x - nx * size * 0.8, y - ny * size * 0.8],
  ]);
}

/** Each kind's icon, drawn in a square from −1 to 1. */
const GLYPHS: Record<MarkKind, () => Glyph> = {
  // A hatch: a frame with its panel swung ajar.
  "secret-passage": () => {
    const frame = polygon([
      [-0.75, -0.8],
      [0.75, -0.8],
      [0.75, 0.8],
      [-0.75, 0.8],
    ]);
    frame.holes.push(
      new THREE.Path([new THREE.Vector2(-0.57, -0.62), new THREE.Vector2(-0.57, 0.62), new THREE.Vector2(0.57, 0.62), new THREE.Vector2(0.57, -0.62)]),
    );
    const leaf = polygon([
      [-0.57, -0.62],
      [0.3, -0.85],
      [0.3, 0.45],
      [-0.57, 0.62],
    ]);
    return [frame, leaf];
  },
  // A flight of steps.
  "secret-stairs": () => [
    polygon([
      [-0.8, -0.75],
      [0.8, -0.75],
      [0.8, 0.75],
      [0.32, 0.75],
      [0.32, 0.27],
      [-0.16, 0.27],
      [-0.16, -0.21],
      [-0.8, -0.21],
    ]),
  ],
  // Two arrows turning round each other.
  "wall-switch": () => [
    arcBand(0.48, 0.72, Math.PI * 0.12, Math.PI * 0.82),
    arcHead(0.6, Math.PI * 0.82, 1, 0.36),
    arcBand(0.48, 0.72, Math.PI * 1.12, Math.PI * 1.82),
    arcHead(0.6, Math.PI * 1.82, 1, 0.36),
  ],
  // A chute curving down, and the way down it.
  slide: () => [arcBand(1.0, 1.28, Math.PI * 1.02, Math.PI * 1.42, 0.7, 0.75), arcHead(1.14, Math.PI * 1.42, 1, 0.38, 0.7, 0.75)],
  // Falling through broken boards.
  "below-collapsed-room": () => [
    polygon([
      [-0.13, 0.25],
      [0.13, 0.25],
      [0.13, -0.3],
      [0.38, -0.3],
      [0, -0.8],
      [-0.38, -0.3],
      [-0.13, -0.3],
    ]),
    polygon([
      [-0.85, 0.55],
      [-0.3, 0.72],
      [-0.36, 0.86],
      [-0.85, 0.72],
    ]),
    polygon([
      [0.85, 0.55],
      [0.3, 0.72],
      [0.36, 0.86],
      [0.85, 0.72],
    ]),
  ],
};

/** A geometry painted one colour, for merging. */
function painted(geometry: THREE.BufferGeometry, colour: PaletteKey, z: number): THREE.BufferGeometry {
  const flatGeometry = geometry.index ? geometry.toNonIndexed() : geometry;
  flatGeometry.deleteAttribute("uv");
  flatGeometry.deleteAttribute("normal");
  flatGeometry.translate(0, 0, z);
  const tint = new THREE.Color(paletteHex(colour));
  const count = flatGeometry.getAttribute("position").count;
  flatGeometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(Array.from({ length: count }, () => [tint.r, tint.g, tint.b]).flat()), 3));
  return flatGeometry;
}

/**
 * The icon of a kind, upright: a medallion in the plate's ground, edged in
 * violet, the kind's glyph on it. Before each draw it turns to face the
 * camera and grows so it never shows smaller than `MEDALLION.pixels` across,
 * standing on its foot `lift` over where it is placed: readable at any
 * zoom, from any side, from eye level to straight down.
 */
export function markIcon(kind: MarkKind, face: MarkFace, lift = MEDALLION.lift): THREE.Mesh {
  const { radius, edge, segments } = MEDALLION;
  const { ground, icon } = FACES[face];
  const inner = radius - edge;
  const glyph = GLYPHS[kind]().map((shape) => painted(new THREE.ShapeGeometry(shape, 12).scale(inner * 0.66, inner * 0.66, 1), icon, 0.002));
  const geometry = mergeGeometries([painted(new THREE.CircleGeometry(inner, segments), ground, 0), painted(new THREE.RingGeometry(inner, radius, segments), EDGE, 0), ...glyph]);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, toneMapped: false, side: THREE.DoubleSide }));
  // It is moved and sized for the camera as it draws, so its bounds can't be culled by.
  mesh.frustumCulled = false;
  mesh.renderOrder = FLOOR_RINGS.order;
  mesh.userData.faces = "camera";
  const foot = new THREE.Vector3();
  const toCamera = new THREE.Vector3();
  const facing = new THREE.Quaternion();
  const size = new THREE.Vector2();
  mesh.onBeforeRender = (renderer, _scene, camera) => {
    foot.set(0, lift, 0).applyMatrix4(mesh.matrixWorld);
    const eye = toCamera.setFromMatrixPosition(camera.matrixWorld).sub(foot);
    const distance = eye.length();
    renderer.getSize(size);
    const fov = camera instanceof THREE.PerspectiveCamera ? THREE.MathUtils.degToRad(camera.fov) : Math.PI / 4;
    const shown = ((2 * radius) / (2 * distance * Math.tan(fov / 2))) * size.y;
    const scale = Math.max(1, MEDALLION.pixels / shown);
    mesh.matrixWorld.compose(foot.setY(foot.y + radius * scale), facing.setFromRotationMatrix(camera.matrixWorld), new THREE.Vector3(scale, scale, scale));
  };
  return mesh;
}

/** The icon on its plate on the floor, softly glowing violet. */
function plated(kind: MarkKind, face: MarkFace): THREE.Group {
  const { object } = plate(EDGE, { disc: FACES[face].ground });
  return group(object, markIcon(kind, face));
}

// ---- The art ----

const dark = () => new THREE.MeshBasicMaterial({ color: paletteHex("void"), fog: false });

/** A glow lying on the floor, between the choice marks' planes, drawn after the room. */
function floorGlow(geometry: THREE.BufferGeometry, material: THREE.Material, y = 0.04): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry.rotateX(-Math.PI / 2), material);
  mesh.position.y = y;
  mesh.renderOrder = 1;
  return mesh;
}

/** Light spilling onto the floor from a gap in the wall: a sheet `width` wide, fading out to `depth` from the wall. */
function spill(colour: PaletteKey, width: number, depth: number, opacity: number, from: number): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(width, depth, 6, 6);
  const uv = geometry.getAttribute("uv");
  const tint = new THREE.Color(paletteHex(colour));
  const colours = new Float32Array(uv.count * 3);
  for (let i = 0; i < uv.count; i++) {
    const across = 1 - Math.abs(2 * uv.getX(i) - 1);
    const strength = uv.getY(i) ** 2 * Math.min(1, across * 2.5);
    colours.set([tint.r * strength, tint.g * strength, tint.b * strength], i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  const material = lightMaterial(opacity, { vertexColors: true });
  material.toneMapped = false;
  const sheet = floorGlow(geometry, material, 0.012);
  sheet.position.z = from + depth / 2;
  return sheet;
}

/** A dark slot across a stub's cap, so the way through reads from above: lying on the wall's own cap (indoors the dressing
 *  stands in front of it, cut with the wall), or outdoors on the coping, on the room's side of what the edging stands on
 *  it, from `copingClear` (`copingClear` in `stage.ts`) out. */
function capSlot(width: number, copingClear: number | null): THREE.Mesh {
  const [back, front] = copingClear === null ? [-WALL_THICKNESS, 0] : [copingClear - WALL_THICKNESS / 2, 0.03];
  return box([width, 0.012, front - back], dark(), [0, CUT_HEIGHT, (back + front) / 2]);
}

/** A panel of wood with a raised field, `width` by `height`, its back on z = 0, facing +z. */
function panel(width: number, height: number, thickness: number): THREE.Group {
  return group(box([width, height, thickness], flat("wood"), [0, 0, thickness / 2]), box([width - 0.1, height - 0.1, 0.012], flat("woodMid"), [0, 0.05, thickness + 0.006]));
}

/** How far the art stands off a wall's face: clear of its skirting. */
const OFF = SKIRTING.depth + 0.02;

/** The Secret Passage: a panel at the wall's foot swung ajar into the room
 *  on its hinge, a dark gap behind it with light at its seams, light spilling
 *  out over the floor, the arc it swept in the dust, and a slot across the
 *  stub's cap. */
function passage(colour: PaletteKey, copingClear: number | null): THREE.Object3D {
  const width = 0.8;
  const height = CUT_HEIGHT - 0.03;
  const open = THREE.MathUtils.degToRad(35);
  const seam = 0.014;
  const gap = box([width, height, 0.02], dark(), [0, 0, OFF - 0.01]);
  const light = glowing(colour, 0.9);
  const seams = group(box([seam, height, 0.006], light, [width / 2 - seam / 2, 0, OFF + 0.003]), box([width, seam, 0.006], light, [0, height - seam, OFF + 0.003]));
  const leaf = panel(width, height, 0.035);
  leaf.position.x = width / 2;
  const hinge = group(leaf);
  hinge.position.set(-width / 2, 0, OFF);
  hinge.rotation.y = -open;
  const swept = floorGlow(new THREE.RingGeometry(width - 0.025, width, 24, 1, -open, open), glowing("bone", 0.4));
  swept.position.set(-width / 2, swept.position.y, OFF);
  return group(gap, seams, hinge, swept, spill(colour, width, 0.5, 0.5, OFF), capSlot(width, copingClear));
}

/** The Secret Stairs: a narrow stair going down at the wall's foot, its
 *  treads stepping along the wall into the dark, in a stone lip with a
 *  newel post at its head. */
function stairs(colour: PaletteKey): THREE.Object3D {
  const [width, depth, lip] = [1.0, 0.5, 0.06];
  const front = OFF + depth;
  const hole = floorGlow(new THREE.PlaneGeometry(width, depth), dark(), 0.02);
  hole.position.z = OFF + depth / 2;
  const stone = flat("stone");
  const rim = group(
    box([width + 2 * lip, 0.065, lip], stone, [0, 0, front + lip / 2]),
    box([lip, 0.065, depth], stone, [-width / 2 - lip / 2, 0, OFF + depth / 2]),
    box([lip, 0.065, depth], stone, [width / 2 + lip / 2, 0, OFF + depth / 2]),
  );
  // The treads step down from the head of the stair, by the post, into the dark: each a little darker.
  const steps: PaletteKey[] = ["stone", "stoneDark", "ash", "sootLight"];
  const tread = width / (steps.length + 1);
  const treads = steps.map((shade, i) => {
    const step = floorGlow(new THREE.PlaneGeometry(tread - 0.025, depth - 0.04), flat(shade), 0.022 + 0.003 * (steps.length - i));
    step.position.set(width / 2 - tread * (i + 0.5), step.position.y, OFF + depth / 2);
    return step;
  });
  const deep = spill(colour, tread * 1.5, depth, 0.35, OFF);
  deep.position.x = -width / 2 + tread * 0.75;
  const post = cylinder(0.035, CUT_HEIGHT - 0.06, flat("woodDark"), [width / 2 + lip / 2, 0, front + lip / 2], { sides: 6 });
  const knob = cylinder(0.05, 0.04, flat("woodMid"), [width / 2 + lip / 2, CUT_HEIGHT - 0.06, front + lip / 2], { top: 0.03, sides: 6 });
  return group(hole, rim, ...treads, deep, post, knob);
}

/** The Wall Switch: a section of the wall's foot turned on a pivot through
 *  its middle, standing out at an angle with the dark behind it showing at
 *  both ends, the arcs its ends swept on the floor, the brass switch beside
 *  it, and a slot across the stub's cap. */
function wallSwitch(colour: PaletteKey, copingClear: number | null): THREE.Object3D {
  const width = 1.0;
  const height = CUT_HEIGHT - 0.03;
  const turn = THREE.MathUtils.degToRad(20);
  const pivot = OFF + 0.2;
  const opening = box([width, height, 0.02], dark(), [0, 0, OFF - 0.01]);
  const light = glowing(colour, 0.9);
  const seams = group(box([0.014, height, 0.006], light, [-width / 2 + 0.007, 0, OFF + 0.003]), box([0.014, height, 0.006], light, [width / 2 - 0.007, 0, OFF + 0.003]));
  const section = panel(width, height, 0.05);
  section.position.z = -0.025;
  const pin = cylinder(0.014, height + 0.02, flat("brass"), [0, -0.005, 0], { sides: 6 });
  const turned = group(section, pin);
  turned.position.z = pivot;
  turned.rotation.y = turn;
  const swept = [-1, 1].map((end) => {
    const arc = floorGlow(new THREE.RingGeometry(width / 2 - 0.025, width / 2, 16, 1, end > 0 ? 0 : Math.PI, turn), glowing("bone", 0.4));
    arc.position.z = pivot;
    return arc;
  });
  const plateAt = width / 2 + 0.1;
  const lever = box([0.02, 0.09, 0.02], flat("brass"), [0, 0, 0.02]);
  lever.rotation.z = THREE.MathUtils.degToRad(-35);
  lever.position.set(plateAt, 0.2, OFF);
  const switchPlate = box([0.07, 0.11, 0.015], flat("brass"), [plateAt, 0.17, OFF - 0.0075]);
  return group(opening, seams, turned, ...swept, switchPlate, lever, capSlot(width, copingClear));
}

/** The Mystic Slide: the mouth of a chute in the floor, a dark hole in a
 *  polished collar, the chute's lip curving down into it, lit from below in
 *  its card's colour. */
function slide(colour: PaletteKey): THREE.Object3D {
  const hole = floorGlow(new THREE.CircleGeometry(0.34, 32), dark(), 0.02);
  const collar = lathe(
    [
      [0.34, 0],
      [0.45, 0],
      [0.45, 0.04],
      [0.41, 0.065],
      [0.34, 0.065],
      [0.34, 0],
    ],
    flat("woodLight"),
    32,
  );
  const tongue = new THREE.Shape();
  tongue.absarc(0, 0, 0.32, Math.PI * 0.62, Math.PI * 1.38, false);
  tongue.absarc(-0.1, 0, 0.2, Math.PI * 1.38, Math.PI * 0.62, true);
  const lip = floorGlow(new THREE.ShapeGeometry(tongue, 12), new THREE.MeshBasicMaterial({ color: paletteHex("woodMid"), fog: false }), 0.022);
  const ring = new THREE.RingGeometry(0.05, 0.3, 32, 4);
  const position = ring.getAttribute("position");
  const tint = new THREE.Color(paletteHex(colour));
  const colours = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const strength = Math.max(0, 1 - Math.hypot(position.getX(i) - 0.08, position.getY(i)) / 0.3) ** 1.5;
    colours.set([tint.r * strength, tint.g * strength, tint.b * strength], i * 3);
  }
  ring.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  const below = lightMaterial(0.8, { vertexColors: true });
  below.toneMapped = false;
  return group(hole, collar, lip, floorGlow(ring, below, 0.024));
}

/** A stand-in random number from a seed, so the rubble lies the same every time. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/** Where the Collapsed Room's floor gave way above: a heap of rubble and
 *  plaster, broken boards fallen across it, and a dusty shaft of the
 *  light from the hole above, pooling on the floor. */
function landing(colour: PaletteKey): THREE.Object3D {
  const random = seeded(7);
  const heap = group();
  const shades: PaletteKey[] = ["stone", "stoneLight", "boneDark", "stoneDark", "bone"];
  for (let i = 0; i < 24; i++) {
    const out = 0.55 * Math.sqrt(random());
    const angle = random() * Math.PI * 2;
    const size = 0.07 + 0.1 * random() * (1 - out / 0.7);
    const chunk = new THREE.Mesh(i % 3 === 0 ? new THREE.BoxGeometry(size * 1.6, size, size * 1.2) : new THREE.DodecahedronGeometry(size), flat(shades[i % shades.length]));
    // Heaped: the chunks in the middle lie on those under them.
    chunk.position.set(Math.cos(angle) * out, size * 0.55 + 0.12 * (1 - out / 0.55), Math.sin(angle) * out);
    chunk.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
    heap.add(chunk);
  }
  const boards = [
    { length: 0.8, angle: 0.3, tilt: 0.28, at: [-0.05, 0.22, 0.05] },
    { length: 0.65, angle: 2.2, tilt: -0.22, at: [0.12, 0.18, -0.12] },
    { length: 0.55, angle: 4.1, tilt: 0.12, at: [-0.15, 0.12, -0.2] },
  ].map(({ length, angle, tilt, at }, i) => {
    const plank = box([length, 0.025, 0.1], flat(i === 1 ? "wood" : "woodMid"), [0, -0.0125, 0]);
    // A board snapped short: a splinter off its broken end.
    const splinter = box([0.12, 0.018, 0.035], flat("woodLight"), [length / 2 + 0.05, -0.009, 0.025]);
    const board = group(plank, splinter);
    board.position.set(at[0], at[1], at[2]);
    board.rotation.set(0, angle, tilt);
    return board;
  });
  // The shaft fades in from the top of the room and out at the floor, where the light pools.
  const shaft = new THREE.CylinderGeometry(0.4, 0.55, WALL_HEIGHT, 16, 8, true).translate(0, WALL_HEIGHT / 2, 0);
  const tint = new THREE.Color(paletteHex(colour));
  const position = shaft.getAttribute("position");
  const colours = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const up = position.getY(i) / WALL_HEIGHT;
    const strength = Math.min(1, up * 6) * (1 - up) ** 1.5;
    colours.set([tint.r * strength, tint.g * strength, tint.b * strength], i * 3);
  }
  shaft.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  const dust = lightMaterial(0.22, { vertexColors: true });
  dust.toneMapped = false;
  const beam = new THREE.Mesh(shaft, dust);
  beam.renderOrder = 1;
  const pool = new THREE.CircleGeometry(0.7, 32, 0, Math.PI * 2);
  const poolPosition = pool.getAttribute("position");
  const poolColours = new Float32Array(poolPosition.count * 3);
  for (let i = 0; i < poolPosition.count; i++) {
    const strength = Math.max(0, 1 - Math.hypot(poolPosition.getX(i), poolPosition.getY(i)) / 0.7) ** 1.2;
    poolColours.set([tint.r * strength, tint.g * strength, tint.b * strength], i * 3);
  }
  pool.setAttribute("color", new THREE.BufferAttribute(poolColours, 3));
  const lit = lightMaterial(0.35, { vertexColors: true });
  lit.toneMapped = false;
  return group(heap, ...boards, beam, floorGlow(pool, lit, 0.013));
}

/**
 * A mark drawn in as few calls as its kinds of material: its parts never
 * move, so each is baked into its mark's frame with its colour in its
 * vertices, and the parts that draw alike are merged: light (added, its
 * strength in its colour), unlit paint (writing depth or not, as a plate),
 * and lit matter. The icon, which turns to the camera, stays apart.
 */
function merged(root: THREE.Object3D): THREE.Group {
  root.updateMatrixWorld(true);
  const into = root.matrixWorld.clone().invert();
  const buckets = new Map<string, { geometries: THREE.BufferGeometry[]; order: number; make: () => THREE.Material }>();
  const kept: THREE.Object3D[] = [];
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const material = object.material as THREE.Material;
    if (object.userData.faces === "camera") {
      kept.push(object);
      return;
    }
    if (!(material instanceof THREE.MeshBasicMaterial || material instanceof THREE.MeshLambertMaterial)) throw new Error(`A mark's part has a ${material.type}, which it can't merge`);
    const added = material.blending === THREE.AdditiveBlending;
    const key = added ? "light" : material instanceof THREE.MeshLambertMaterial ? "lit" : `paint:${String(material.depthWrite)}:${String(material.toneMapped)}`;
    const geometry = (object.geometry as THREE.BufferGeometry).clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(into, object.matrixWorld));
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    const count = flat.getAttribute("position").count;
    const own = material.vertexColors ? (flat.getAttribute("color") as THREE.BufferAttribute | undefined) : undefined;
    const strength = added ? material.opacity : 1;
    const colours = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colours[i * 3] = material.color.r * strength * (own ? own.getX(i) : 1);
      colours[i * 3 + 1] = material.color.g * strength * (own ? own.getY(i) : 1);
      colours[i * 3 + 2] = material.color.b * strength * (own ? own.getZ(i) : 1);
    }
    for (const name of Object.keys(flat.attributes)) if (name !== "position" && name !== "normal") flat.deleteAttribute(name);
    flat.setAttribute("color", new THREE.BufferAttribute(colours, 3));
    const make = (): THREE.Material => {
      if (added) {
        const light = lightMaterial(1, { vertexColors: true });
        light.toneMapped = false;
        return light;
      }
      if (material instanceof THREE.MeshLambertMaterial) return new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
      return new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, depthWrite: material.depthWrite, toneMapped: material.toneMapped });
    };
    const bucket = buckets.get(key) ?? { geometries: [], order: 0, make };
    bucket.geometries.push(flat);
    bucket.order = Math.max(bucket.order, object.renderOrder);
    buckets.set(key, bucket);
  });
  const meshes = [...buckets.values()].map(({ geometries, order, make }) => {
    const mesh = new THREE.Mesh(mergeGeometries(geometries), make());
    mesh.renderOrder = order;
    return mesh;
  });
  const result = group(...meshes);
  for (const object of kept) {
    new THREE.Matrix4().multiplyMatrices(into, object.matrixWorld).decompose(object.position, object.quaternion, object.scale);
    object.removeFromParent();
    result.add(object);
  }
  return result;
}

const WALL_ART: Record<WallMarkKind, (colour: PaletteKey, copingClear: number | null) => THREE.Object3D> = { "secret-passage": passage, "secret-stairs": stairs, "wall-switch": wallSwitch };
const FLOOR_ART: Record<FloorMarkKind, (colour: PaletteKey) => THREE.Object3D> = { slide, "below-collapsed-room": landing };
/** How high a floor mark's icon stands, its foot clear of the art. */
const FLOOR_LIFT: Record<FloorMarkKind, number> = { slide: 0.14, "below-collapsed-room": 0.5 };

export const isWallMark = (kind: string): kind is WallMarkKind => (WALL_MARKS as readonly string[]).includes(kind);
export const isFloorMark = (kind: string): kind is FloorMarkKind => (FLOOR_MARKS as readonly string[]).includes(kind);

/** A wall mark's art alone, at the foot of a wall (an outdoor tile's low wall, given its `copingClear`; null indoors): built facing +z from the wall's inner face at the origin. */
export function wallArt(kind: WallMarkKind, colour: PaletteKey, copingClear: number | null): THREE.Object3D {
  return WALL_ART[kind](colour, copingClear);
}

/** A mark on a wall of a room (outdoors, its `copingClear`; null indoors), in its own frame: its art on the wall where it fits, and its icon on its plate. */
export function wallMark(kind: WallMarkKind, colour: PaletteKey, spot: EdgeSpot, face: MarkFace, copingClear: number | null): THREE.Group {
  const mark = group();
  if (spot.fits) {
    const art = wallArt(kind, colour, copingClear);
    const at = onWall(spot.edge, spot.along);
    art.position.set(at.at[0], 0, at.at[1]);
    art.rotation.y = THREE.MathUtils.degToRad(wallTurn(spot.edge));
    mark.add(art);
  }
  const icon = plated(kind, face);
  icon.position.set(spot.icon[0], 0, spot.icon[1]);
  mark.add(icon);
  return merged(mark);
}

/** A mark on the floor, in its room's own frame: its art round `at`, and its icon standing over it. */
export function floorMark(kind: FloorMarkKind, colour: PaletteKey, at: readonly [x: number, z: number], face: MarkFace): THREE.Group {
  const mark = merged(group(FLOOR_ART[kind](colour), markIcon(kind, face, FLOOR_LIFT[kind])));
  mark.position.set(at[0], 0, at[1]);
  return mark;
}
