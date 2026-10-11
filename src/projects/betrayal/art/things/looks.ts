import * as THREE from "three";
import type { CardType } from "../../types";
import type { Mood } from "../../play/cards";
import type { EdgeSpot } from "../../play/things";
import { paletteHex, type PaletteKey } from "../palette";
import { CUT_HEIGHT, FLOOR_RINGS, INNER, onWall, WALL_THICKNESS, wallTurn } from "../room";
import { box, flat, group, lightMaterial } from "../shapes";
import { SKIRTING } from "../stage";

/*
 * How things in rooms look (`play/things.ts`). An object is a small model on
 * a plate in its colour; its model is the card's own where one is built
 * (`CARD_MODELS`), else a stand-in for its kind. A room effect is light or
 * air over the whole tile; a connection a mark on a wall stub or the floor.
 * Each kind has one built example (the Blessing's glow, the Secret
 * Passage's door in the wall) and a plain stand-in in its colour for the
 * rest, so every thing shows until its own look is built.
 *
 * Objects are lit like figures, from the light probes; glows are light, not
 * paint, and keep out of tone mapping, as the house's marks do.
 */

/** Each mood's colour in the art: colour has a meaning. */
export const MOOD_COLOUR: Record<Mood, PaletteKey> = {
  moon: "moonLight",
  human: "amber",
  supernatural: "wraithLight",
  danger: "scarlet",
  magic: "violet",
  holy: "gold",
};

/** An object's model, in its two poses: lying on the floor, and held in a hand (sized as held props are). */
export interface ObjectModel {
  floor: () => THREE.Object3D;
  held: () => THREE.Object3D;
}

/** The models built for particular cards, by card id. The art wave adds to it; until then each card shows its type's stand-in. */
export const CARD_MODELS: Readonly<Partial<Record<string, ObjectModel>>> = {};

/** A glow in a palette colour, added to what lies behind it and kept out of tone mapping. */
function glowing(colour: PaletteKey, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: paletteHex(colour), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false });
}

/** How brightly a plate's rim glows, and its pool of light round it, at rest and while pointed at. */
const RIM = { rest: 0.55, focused: 1 };
const POOL = { reach: 1.0, rest: 0.3, focused: 0.9, segments: 6 };

/** A flat ring on the floor rings' plane, drawn as they are: after the room's solids, writing no depth. */
function floorRing(inner: number, outer: number, material: THREE.Material, phiSegments = 1): THREE.Mesh {
  const ring = new THREE.Mesh(new THREE.RingGeometry(inner, outer, FLOOR_RINGS.segments, phiSegments), material);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = FLOOR_RINGS.height;
  ring.renderOrder = FLOOR_RINGS.order;
  return ring;
}

/** An object's plate (`FLOOR_RINGS`): a dark disc in a glowing rim of its colour, in a soft pool of
 *  that colour's light on the floor round it, so it shows in a dark room from across the house.
 *  The pool is light faked on the floor, not a light. Returns the rim's and the pool's materials, which show the focus. */
export function plate(colour: PaletteKey): { object: THREE.Object3D; rim: THREE.MeshBasicMaterial; pool: THREE.MeshBasicMaterial } {
  const { radius, rim: inner } = FLOOR_RINGS.plate;
  const disc = new THREE.MeshBasicMaterial({ color: paletteHex("soot"), depthWrite: false, fog: false });
  const rim = glowing(colour, RIM.rest);
  const pool = lightMaterial(POOL.rest, { vertexColors: true });
  pool.toneMapped = false;
  const halo = floorRing(radius, POOL.reach, pool, POOL.segments);
  // The pool fades out from the rim to nothing at its reach.
  const position = halo.geometry.getAttribute("position");
  const tint = new THREE.Color(paletteHex(colour));
  const colours = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const out = (Math.hypot(position.getX(i), position.getY(i)) - radius) / (POOL.reach - radius);
    const strength = (1 - out) ** 2;
    colours.set([tint.r * strength, tint.g * strength, tint.b * strength], i * 3);
  }
  halo.geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  return { object: group(halo, floorRing(0, inner, disc), floorRing(inner, radius, rim)), rim, pool };
}

export const rimGlow = (focused: boolean) => (focused ? RIM.focused : RIM.rest);
export const poolGlow = (focused: boolean) => (focused ? POOL.focused : POOL.rest);

/** The stand-in models, one per kind of object: an item is a small strapped case, an omen a crystal, a token a square block. */
const STAND_INS: Record<CardType | "token", ObjectModel> = {
  item: posed(() => group(box([0.2, 0.11, 0.14], flat("woodMid")), box([0.21, 0.025, 0.15], flat("brass"), [0, 0.11, 0]), box([0.03, 0.115, 0.145], flat("brass"), [0, 0, 0])), 0.7),
  omen: posed(() => {
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.085), flat("bruiseLight"));
    crystal.scale.y = 1.5;
    crystal.position.y = 0.16;
    return group(box([0.12, 0.03, 0.12], flat("stoneDark")), crystal);
  }, 0.7),
  event: posed(() => group(box([0.18, 0.05, 0.18], flat("boneDark")), box([0.14, 0.012, 0.14], flat("ash"), [0, 0.05, 0])), 0.6),
  token: posed(() => group(box([0.16, 0.04, 0.16], flat("stone")), box([0.12, 0.01, 0.12], flat("stoneLight"), [0, 0.04, 0])), 0.6),
};

/** A model whose held pose is its floor pose at `scale`. */
/** Stand-ins lie oversized, as held props are, so they read from the house's distance. */
const LYING = 1.3;

function posed(build: () => THREE.Object3D, scale: number): ObjectModel {
  return {
    floor: () => {
      const model = build();
      model.scale.setScalar(LYING);
      return model;
    },
    held: () => {
      const model = build();
      model.scale.setScalar(LYING * scale);
      return model;
    },
  };
}

/** The model of a card lying on the floor: its own, or its type's stand-in. */
export function cardModel(card: string, type: CardType): ObjectModel {
  return CARD_MODELS[card] ?? STAND_INS[type];
}

/** A token's model: a stand-in block until the art wave gives it its own. */
export const tokenModel = (): ObjectModel => STAND_INS.token;

/** A pile of the rest of a cluster's objects: a few cases stacked askew. */
export function pileModel(): THREE.Object3D {
  const stack = group();
  [0, 1, 2].forEach((i) => {
    const layer = box([0.18, 0.06, 0.13], flat(i === 1 ? "wood" : "woodMid"), [0, i * 0.06, 0]);
    layer.rotation.y = (i - 1) * 0.35;
    stack.add(layer);
  });
  return stack;
}

// ---- Room effects ----

/** A soft wash of light over the floor, fading to the walls, and pooling up the stub of each wall. Sizes in metres. */
const WASH = { floor: 0.04, wall: CUT_HEIGHT, off: 0.01, border: 0.9, segments: 12 };

/** A sheet of light whose strength at each vertex is `fade` of where it lies, as a share (0 to 1) across and up it. */
function fadedSheet(width: number, height: number, colour: PaletteKey, fade: (u: number, v: number) => number, material: THREE.Material): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(width, height, WASH.segments, WASH.segments);
  const uv = geometry.getAttribute("uv");
  const tint = new THREE.Color(paletteHex(colour));
  const colours = new Float32Array(uv.count * 3);
  for (let i = 0; i < uv.count; i++) {
    const strength = fade(uv.getX(i), uv.getY(i));
    colours.set([tint.r * strength, tint.g * strength, tint.b * strength], i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  const sheet = new THREE.Mesh(geometry, material);
  sheet.renderOrder = 1;
  return sheet;
}

/** A room effect, built: its object, and its motion on the stage's clock. */
export interface BuiltEffect {
  object: THREE.Object3D;
  update: (seconds: number) => void;
}

/** A wash of light in `colour` over the tile's floor and up its walls' stubs, breathing over `period` seconds by `swell`. */
function wash(colour: PaletteKey, { floor, wall, period, swell }: { floor: number; wall: number; period: number; swell: number }): BuiltEffect {
  const light = (opacity: number) => {
    const material = lightMaterial(opacity, { vertexColors: true });
    material.toneMapped = false;
    return material;
  };
  const span = INNER * 2;
  const edgeFade = (share: number) => THREE.MathUtils.smoothstep(Math.min(share, 1 - share) * span, 0, WASH.border);
  const onFloor = light(floor);
  // Brightest in the middle of the room, as if it came from there.
  const middle = (u: number, v: number) => 1 - 0.45 * ((2 * u - 1) ** 2 + (2 * v - 1) ** 2) / 2;
  const ground = fadedSheet(span, span, colour, (u, v) => edgeFade(u) * edgeFade(v) * middle(u, v), onFloor);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = WASH.floor;
  const materials = [onFloor];
  const object = group(ground);
  if (wall > 0) {
    const upWalls = light(wall);
    materials.push(upWalls);
    for (const edge of ["top", "right", "bottom", "left"] as const) {
      const sheet = fadedSheet(span, WASH.wall, colour, (u, v) => (1 - v) ** 1.6 * edgeFade(u), upWalls);
      const at = onWall(edge, 0, { out: WASH.off });
      sheet.position.set(at.at[0], WASH.wall / 2, at.at[1]);
      sheet.rotation.y = THREE.MathUtils.degToRad(wallTurn(edge));
      object.add(sheet);
    }
  }
  const rest = materials.map((material) => material.opacity);
  return {
    object,
    update: (seconds) => {
      const breath = 1 - swell / 2 + (swell / 2) * Math.sin((seconds * Math.PI * 2) / period);
      materials.forEach((material, i) => {
        material.opacity = rest[i] * breath;
      });
    },
  };
}

/** The room effects built for particular tokens, by token id: the Blessing's warm, holy gold, breathing slowly through the room. */
const EFFECTS: Readonly<Partial<Record<string, () => BuiltEffect>>> = {
  blessing: () => wash("gold", { floor: 0.45, wall: 0.6, period: 4, swell: 0.3 }),
};

/** A room effect's look: its own, or a still, faint wash in its colour until its own is built. */
export function effectLook(token: string | null, colour: PaletteKey): BuiltEffect {
  const own = token === null ? undefined : EFFECTS[token];
  return own ? own() : wash(colour, { floor: 0.14, wall: 0, period: 1, swell: 0 });
}

// ---- Connections ----

/** A connection's mark on a wall, low enough to show under the cut, and stood off the wall's face clear of its skirting and wainscot. Sizes in metres. */
const PASSAGE = { width: 0.9, height: CUT_HEIGHT - 0.02, seam: 0.03, off: SKIRTING.depth + 0.02, swing: 0.8 };

/** The Secret Passage: a dark gap where a panel of the wall stands ajar, its seams lit faintly
 *  from beyond, a dark slot across the stub's cap so it reads from above, and the arc its panel
 *  swept in the floor's dust. Built facing into the room from the wall's inner face. */
function passage(colour: PaletteKey): THREE.Object3D {
  const { width, height, seam, off, swing } = PASSAGE;
  const dark = new THREE.MeshBasicMaterial({ color: paletteHex("void"), fog: false });
  const gap = box([width, height, 0.02], dark, [0, 0, off]);
  const light = glowing(colour, 1);
  const front = off + 0.02;
  const seams = group(
    box([seam, height, 0.01], light, [-width / 2, 0, front]),
    box([seam, height, 0.01], light, [width / 2, 0, front]),
    box([width + seam, seam, 0.01], light, [0, height - seam, front]),
  );
  const cap = box([width, 0.02, WALL_THICKNESS + off + 0.04], dark, [0, CUT_HEIGHT, (off + 0.04 - WALL_THICKNESS) / 2]);
  const arc = new THREE.Mesh(new THREE.RingGeometry(swing - 0.04, swing, FLOOR_RINGS.segments / 4, 1, Math.PI, Math.PI / 2), glowing("bone", 0.55));
  arc.rotation.x = -Math.PI / 2;
  arc.position.set(width / 2, 0.04, off);
  arc.renderOrder = 1;
  return group(gap, seams, cap, arc);
}

/** The connections built for particular tokens, by token id. */
const CONNECTIONS: Readonly<Partial<Record<string, (colour: PaletteKey) => THREE.Object3D>>> = {
  "secret-passage": passage,
};

/** A plain mark in a connection's colour until its own is built: a lit bar along the stub's cap and a strip on the floor before it. */
function edgeStandIn(colour: PaletteKey): THREE.Object3D {
  const light = glowing(colour, 0.8);
  return group(box([0.7, 0.02, WALL_THICKNESS], light, [0, CUT_HEIGHT, -WALL_THICKNESS / 2]), box([0.7, 0.01, 0.12], light, [0, 0.04, SKIRTING.depth + 0.08]));
}

/** A connection's mark on a wall, placed in its room's own frame. */
export function connectionLook(token: string | null, colour: PaletteKey, spot: EdgeSpot): THREE.Object3D {
  const build = (token === null ? undefined : CONNECTIONS[token]) ?? edgeStandIn;
  const mark = build(colour);
  const at = onWall(spot.edge, spot.along);
  mark.position.set(at.at[0], 0, at.at[1]);
  mark.rotation.y = THREE.MathUtils.degToRad(wallTurn(spot.edge));
  return group(mark);
}

/** A connection marked on the floor, until its own is built: a ring in its colour. */
export function floorMark(colour: PaletteKey): THREE.Object3D {
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.3, FLOOR_RINGS.segments), glowing(colour, 0.8));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  ring.renderOrder = 1;
  return group(ring);
}
