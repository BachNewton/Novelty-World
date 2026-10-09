import * as THREE from "three";
import { lightAnchor } from "../light-anchor";
import { paletteHex, type PaletteKey } from "../palette";
import { CUT_HEIGHT, FRONT_DOOR_HEIGHT, FRONT_DOOR_WIDTH, WALL_THICKNESS, onWall, type RoomDefinition } from "../room";
import { batch, box, cylinder, flat, glow, group, lathe, pixelPlane } from "../shapes";
import { pixelTexture, svgTexture, TEXELS_PER_METRE } from "../textures";
import { runner, suiteMood, SUITE } from "./starting-tile";

const LEAF_TOP = 2.32;
const TRANSOM = 0.08;
const FAN_BOTTOM = LEAF_TOP + TRANSOM;

/** The fanlight over the front door: a half-wheel of moonlit glass between
 *  dark wooden spandrels. */
function fanlightSvg(w: number, h: number): string {
  const hex = paletteHex;
  const cx = w / 2;
  const spokes: string[] = [];
  for (let i = 1; i < 8; i++) {
    const angle = Math.PI - (i * Math.PI) / 8;
    spokes.push(`<path d="M${cx} ${h} L${cx + Math.cos(angle) * w} ${h - Math.sin(angle) * h * 2}" stroke="${hex("void")}" stroke-width="1"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">
<rect width="${w}" height="${h}" fill="${hex("woodDark")}"/>
<ellipse cx="${cx}" cy="${h}" rx="${cx - 1}" ry="${h - 1}" fill="${hex("moon")}"/>
<ellipse cx="${cx}" cy="${h}" rx="${cx - 9}" ry="${h - 6}" fill="${hex("moonLight")}"/>
<ellipse cx="${cx}" cy="${h}" rx="${cx - 9}" ry="${h - 6}" fill="none" stroke="${hex("void")}" stroke-width="1"/>
${spokes.join("")}
<ellipse cx="${cx}" cy="${h}" rx="5" ry="3" fill="${hex("woodDark")}"/>
<ellipse cx="${cx}" cy="${h}" rx="${cx - 1}" ry="${h - 1}" fill="none" stroke="${hex("void")}" stroke-width="1"/>
</svg>`;
}

/**
 * The front door: tall double leaves, panelled and studded, barred from the
 * inside with an iron bar, under a fanlight. Built in its wall's frame, centred
 * in the wall's thickness, facing +z into the room, as the part between heights
 * `from` and `to` (dropped by `from`), so the part above the cut height can
 * hide with the wall.
 */
function frontDoor(from: number, to: number): THREE.Group {
  const b = batch();
  const slab = (w: number, y0: number, y1: number, d: number, colour: PaletteKey, x: number, z: number) => {
    const low = Math.max(y0, from);
    const high = Math.min(y1, to);
    if (high - low < 0.005) return;
    b.block([w, high - low, d], colour, [x, low - from, z]);
  };
  const leaf = FRONT_DOOR_WIDTH / 2 + 0.01;
  for (const side of [-1, 1]) {
    const cx = side * (leaf / 2 - 0.005);
    slab(leaf, 0, LEAF_TOP, 0.07, "woodDark", cx, 0);
    for (const [y0, y1] of [[0.25, 1.0], [1.3, 2.15]]) {
      slab(leaf - 0.22, y0, y1, 0.02, "wood", cx, 0.045);
      for (let y = y0 + 0.12; y < y1 - 0.05; y += 0.25) {
        for (const x of [-0.22, 0.22]) slab(0.035, y, y + 0.035, 0.03, "soot", cx + x * (leaf / 0.86), 0.065);
      }
    }
    slab(0.05, 1.12, 1.2, 0.05, "brass", side * 0.08, 0.06);
  }
  slab(0.02, 0, LEAF_TOP, 0.02, "void", 0, 0.04);
  slab(FRONT_DOOR_WIDTH + 0.02, LEAF_TOP, FAN_BOTTOM, 0.1, "woodDark", 0, 0);
  slab(FRONT_DOOR_WIDTH + 0.3, 1.25, 1.33, 0.06, "ash", 0, 0.2);
  for (const x of [-0.7, 0, 0.7]) slab(0.1, 1.2, 1.38, 0.17, "soot", x, 0.12);
  const result = group(b.mesh());
  if (to > FAN_BOTTOM) {
    const w = Math.round(FRONT_DOOR_WIDTH * TEXELS_PER_METRE);
    const h = Math.round((FRONT_DOOR_HEIGHT - FAN_BOTTOM) * TEXELS_PER_METRE);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(FRONT_DOOR_WIDTH, h / TEXELS_PER_METRE), glow("moon", svgTexture(fanlightSvg(w, h), w, h)));
    glass.position.set(0, FAN_BOTTOM + h / TEXELS_PER_METRE / 2 - from, 0);
    glass.userData.noShadow = true;
    result.add(glass);
  }
  return result;
}

/** A standing lamp with a glass shade, one each side of the front door. */
function torchere(shadow: boolean): THREE.Group {
  const brass = flat("brass");
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 0.26, 6), glow("amber"));
  shade.position.y = 1.62;
  const result = group(
    cylinder(0.2, 0.05, flat("woodDark"), [0, 0, 0], { top: 0.16, sides: 6 }),
    lathe([[0.05, 0], [0.03, 0.4], [0.05, 0.45], [0.025, 0.5], [0.025, 1.45], [0.07, 1.49], [0, 1.5]], brass, 6).translateY(0.05),
    shade,
  );
  result.traverse((child) => {
    child.userData.noShadow = true;
  });
  result.add(lightAnchor({ colour: "amber", intensity: 5, range: 7, flicker: 0.05, shadow }, [0, 1.45, 0]));
  return result;
}

/** A high-backed oak settle for callers to wait on. Faces +z. */
function settle(): THREE.Group {
  const b = batch();
  b.block([1.3, 0.06, 0.45], "woodMid", [0, 0.42, 0.02]);
  b.block([1.3, 0.38, 0.4], "woodDark", [0, 0.04, 0]);
  b.block([1.3, 0.85, 0.06], "woodDark", [0, 0.45, -0.2]);
  for (let i = 0; i < 4; i++) b.block([0.26, 0.6, 0.02], "wood", [-0.45 + i * 0.3, 0.55, -0.16]);
  for (const x of [-0.65, 0.65]) b.block([0.07, 0.75, 0.5], "woodMid", [x, 0, 0]);
  b.block([1.4, 0.06, 0.12], "woodMid", [0, 1.3, -0.2]);
  return group(b.mesh());
}

/** A brass umbrella stand holding a walking stick and a furled umbrella. */
function umbrellaStand(): THREE.Group {
  const umbrella = group(cylinder(0.06, 0.65, flat("soot"), [0, 0, 0], { top: 0.02, sides: 6 }), box([0.02, 0.18, 0.02], flat("woodDark"), [0, 0.65, 0]));
  umbrella.position.set(0.04, 0.05, 0.02);
  umbrella.rotation.z = -0.15;
  const stick = box([0.025, 0.85, 0.025], flat("woodMid"), [0, 0, 0]);
  stick.position.set(-0.05, 0.05, -0.02);
  stick.rotation.z = 0.12;
  return group(cylinder(0.14, 0.5, flat("brass"), [0, 0, 0], { sides: 8 }), cylinder(0.12, 0.01, flat("void"), [0, 0.49, 0], { sides: 8 }), umbrella, stick);
}

const PRINT = [".###.", "#w###", "#####", "####.", ".###.", ".##..", ".....", ".###.", ".###.", ".###."];

/** One wet footprint lying on the floor, toes towards −z. */
function footprint(): THREE.Group {
  const print = pixelPlane(pixelTexture(PRINT, { "#": "moonDark", w: "moon" }), { alpha: true });
  print.rotation.x = -Math.PI / 2;
  print.position.y = 0.012;
  print.userData.noShadow = true;
  return group(print);
}

/** Wet footprints in from the barred front door, walking up the runner and
 *  stopping, side by side, in the middle of the hall. */
const PRINTS: [x: number, z: number, turn: number][] = [
  [2.45, 0.12, 92],
  [2.1, -0.12, 88],
  [1.75, 0.13, 95],
  [1.4, -0.1, 90],
  [1.05, 0.14, 86],
  [0.7, -0.09, 93],
  [0.42, 0.13, 90],
  [0.4, -0.12, 90],
];

/** The Entrance Hall: the tall, barred front door under a moonlit fanlight,
 *  between two standing lamps, with the runner running up to its threshold. */
export const ENTRANCE_HALL: RoomDefinition = {
  id: "entrance-hall",
  ...SUITE,
  props: [
    { build: () => runner({ from: -3, to: 2.62, finished: ["to"] }), at: [0, 0] },
    { build: () => frontDoor(0, CUT_HEIGHT), ...onWall("right", 0, { out: -WALL_THICKNESS / 2 }) },
    { build: () => frontDoor(CUT_HEIGHT, 4), ...onWall("right", 0, { y: CUT_HEIGHT, out: -WALL_THICKNESS / 2 }) },
    { build: () => torchere(true), at: [2.3, -1.3] },
    { build: () => torchere(false), at: [2.3, 1.3] },
    { build: umbrellaStand, at: [2.35, 2.15] },
    { build: settle, ...onWall("top", 1.5, { out: 0.3 }) },
    ...PRINTS.map(([x, z, turn]) => ({ build: footprint, at: [x, z] as [number, number], turn })),
  ],
  mood: { ...suiteMood(0.9), moonFrom: "right" },
  focus: [1.6, 1.3, 0],
  pawn: [-0.9, -0.9],
};
