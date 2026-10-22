import * as THREE from "three";
import { createRng } from "@/shared/lib/seeded-random";
import { gardenUrn, groundFog } from "../kit";
import { lightAnchor } from "../light-anchor";
import type { RoomDefinition } from "../room";
import { box, cylinder, flat, glow, group, lightMaterial, pixelPlane } from "../shapes";
import { shiny, SHINES } from "../shine";
import { flagstones, pixelTexture, TEXELS_PER_METRE } from "../textures";

/** Where the telescope stands, near the open balustrade on the right. */
const TELESCOPE: [number, number] = [1.45, -0.55];
/** Its tripod's head, and how steeply its tube looks up at the sky. */
const HEAD = 1.08;
const ELEVATION = THREE.MathUtils.degToRad(32);
/** Along the tube from the head: the eyepiece behind, the objective in front. */
const EYEPIECE = -0.42;
const OBJECTIVE = 0.74;

/** A point along the tube, in the telescope's own frame (its tube looking along +x and up). */
function alongTube(t: number): THREE.Vector3 {
  return new THREE.Vector3(Math.cos(ELEVATION) * t, HEAD + Math.sin(ELEVATION) * t, 0);
}

/** A cylinder lying along the tube's axis between two distances along it. */
function tubePart(from: number, to: number, radius: number, material: THREE.Material, sides = 12): THREE.Mesh {
  const part = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, to - from, sides).rotateZ(-Math.PI / 2), material);
  part.position.copy(alongTube((from + to) / 2));
  part.rotation.z = ELEVATION;
  return part;
}

/**
 * A brass telescope on a wooden tripod, aimed up over the balustrade at the
 * night sky, left as its watcher left it. Something up there looks back
 * down it: its lenses glow violet, and the eyepiece throws a violet light on
 * the flags where the watcher stood. Its tube looks along +x.
 */
function telescope(): THREE.Group {
  const brass = shiny(flat("brass"), SHINES.tarnishedBrass);
  const wood = flat("woodMid");
  const result = group();
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 6;
    const foot = new THREE.Vector3(Math.cos(a) * 0.46, 0, Math.sin(a) * 0.46);
    const top = new THREE.Vector3(0, HEAD - 0.06, 0);
    const length = foot.distanceTo(top);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, length, 0.04), wood);
    leg.position.copy(foot).add(top).multiplyScalar(0.5);
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(foot).normalize());
    result.add(leg);
  }
  result.add(
    cylinder(0.07, 0.08, brass, [0, HEAD - 0.1, 0], { sides: 8 }),
    box([0.1, 0.07, 0.08], brass, [0, HEAD - 0.04, 0]),
    tubePart(EYEPIECE + 0.1, OBJECTIVE - 0.18, 0.058, brass),
    tubePart(OBJECTIVE - 0.2, OBJECTIVE, 0.072, brass),
    tubePart(EYEPIECE, EYEPIECE + 0.12, 0.025, brass, 8),
    tubePart(-0.06, 0.06, 0.068, flat("soot")),
  );
  // The lenses: the great one at the mouth, the small one at the eye, both lit violet from beyond.
  const lens = (at: number, radius: number, facing: 1 | -1) => {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 14).rotateY((facing * Math.PI) / 2), glow("violet"));
    disc.position.copy(alongTube(at + facing * 0.003));
    disc.rotation.z = ELEVATION;
    return disc;
  };
  result.add(lens(OBJECTIVE - 0.03, 0.06, 1), lens(EYEPIECE, 0.02, -1), halo(alongTube(OBJECTIVE + 0.02), 0.34), halo(alongTube(EYEPIECE - 0.02), 0.2));
  result.traverse((child) => {
    child.userData.noShadow = true;
  });
  const eye = alongTube(EYEPIECE - 0.16);
  result.add(lightAnchor({ colour: "violet", intensity: 7, range: 5.5, flicker: 0.1, kind: "glow" }, [eye.x, eye.y, eye.z]));
  return result;
}

/** A soft violet haze round a lens, crossed planes of a dithered disc of light, so it reads as one glow from every view. */
function halo(at: THREE.Vector3, size: number): THREE.Group {
  const n = Math.round(size * TEXELS_PER_METRE);
  const rows = Array.from({ length: n }, (_, y) =>
    Array.from({ length: n }, (_, x) => {
      const r = Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2) / (n / 2);
      return r < 0.3 ? "v" : r < 0.6 ? "b" : r < 0.9 && (x + y) % 2 === 0 ? "d" : ".";
    }).join(""),
  );
  const light = lightMaterial(0.75, { map: pixelTexture(rows, { v: "violet", b: "bruiseLight", d: "bruise", ".": "void" }) });
  const plane = () => new THREE.PlaneGeometry(size, size);
  const result = group(new THREE.Mesh(plane(), light), new THREE.Mesh(plane().rotateY(Math.PI / 2), light), new THREE.Mesh(plane().rotateX(Math.PI / 2), light));
  result.position.copy(at);
  return result;
}

/** The watcher's tall wooden stool, knocked over on its side. Lying with its seat towards −x. */
function fallenStool(): THREE.Group {
  const wood = flat("woodMid");
  const stool = group(cylinder(0.17, 0.04, wood, [0, 0.66, 0], { sides: 10 }));
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const leg = box([0.035, 0.68, 0.035], wood, [0, 0, 0]);
    leg.position.set(Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12);
    leg.rotation.set(-Math.sin(a) * 0.06, 0, Math.cos(a) * 0.06);
    stool.add(leg);
  }
  stool.add(box([0.25, 0.025, 0.025], wood, [0, 0.25, 0]), box([0.025, 0.025, 0.25], wood, [0, 0.3, 0]));
  stool.rotation.z = Math.PI / 2;
  stool.position.y = 0.17;
  return group(stool);
}

/** A star chart blown off the telescope's watcher onto the flags: pale paper, its stars and their lines inked, one ringed. Lies flat. */
function starChart(): THREE.Mesh {
  const [w, h] = [18, 14];
  const rng = createRng("balcony-chart");
  const grid = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x): string => (x === 0 || y === 0 || x === w - 1 || y === h - 1 ? "e" : "p")));
  const stars: [number, number][] = [];
  for (let k = 0; k < 9; k++) stars.push([2 + Math.floor(rng.next() * (w - 4)), 2 + Math.floor(rng.next() * (h - 4))]);
  for (let k = 0; k < stars.length - 1; k++) {
    const [[ax, ay], [bx, by]] = [stars[k], stars[k + 1]];
    const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
    for (let s = 0; s <= steps; s++) grid[Math.round(ay + ((by - ay) * s) / steps)][Math.round(ax + ((bx - ax) * s) / steps)] = "l";
  }
  for (const [x, y] of stars) grid[y][x] = "s";
  const [rx, ry] = stars[4];
  for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) grid[ry + dy][rx + dx] = "r";
  const chart = pixelPlane(pixelTexture(grid.map((row) => row.join("")), { p: "boneLight", e: "bone", l: "boneDark", s: "soot", r: "bruiseLight" }));
  chart.rotation.x = -Math.PI / 2;
  chart.position.y = 0.008;
  return chart;
}

/** The Balcony: a stone balcony high on the house, balustraded all round
 *  and open to the night, with a brass telescope on its tripod aimed at
 *  the sky; its watcher's stool knocked over and their star chart blown on
 *  the flags, and down the telescope something looks back, lighting its
 *  lenses violet. One corner's urn is gone from its plinth: it lies burst
 *  on the Patio below. */
export const BALCONY: RoomDefinition = {
  id: "balcony",
  floor: () => flagstones({ ramp: ["soot", "sootLight", "ash", "stoneDark"], mortar: "void", stonePx: 12, seed: "balcony" }),
  wall: () => flagstones({ ramp: ["void", "soot", "ash", "stoneDark"], stonePx: 8, size: 64, seed: "balcony-wall" }),
  trim: "stoneLight",
  edging: "balustrade",
  props: [
    { build: telescope, at: TELESCOPE, turn: 12 },
    { build: fallenStool, at: [0.95, -1.05], turn: -60 },
    { build: starChart, at: [0.85, 0.35], turn: 25 },
    { build: () => gardenUrn({ seed: "balcony-a" }), name: "gardenUrn", at: [-2.3, -2.3] },
    { build: () => gardenUrn({ seed: "balcony-b" }), name: "gardenUrn", at: [-2.3, 2.3] },
    { build: () => gardenUrn({ seed: "balcony-c" }), name: "gardenUrn", at: [2.3, 2.3] },
    { build: () => gardenUrn({ urn: false }), name: "gardenUrn", at: [2.3, -2.3] },
    { build: () => groundFog({ seed: "balcony-fog", layers: [[0.1, 0.28, "low"]] }), name: "groundFog", at: [0, 0] },
  ],
  focus: [TELESCOPE[0], 1.0, TELESCOPE[1]],
  prime: [-1.0, 0.6],
};
