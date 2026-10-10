import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { BASE_RADIUS, checkFloor } from "./overlap";
import { PALETTE, type PaletteKey } from "./palette";
import { DOOR_WIDTH, standingSpots, type RoomDefinition, type RoomPoint } from "./room";

/*
 * The bench's paths overlay (`&paths`): where figures stand and walk in a
 * room, drawn over it from the overlap check's own floor report (the walks
 * the house makes, and what is wrong with them). Debug only: it lies over
 * the room, never in it, unlit, drawn over everything without depth so it
 * fights nothing and reads from every view. Everything of one colour is one
 * mesh, and the numbers are one mesh on one texture, so the whole overlay
 * costs a handful of draw calls and fits within the house's budget.
 */

/** What each colour marks, in the order the legend lists them. */
const KEY = {
  prime: { colour: "goldLight", label: "Standing spot 1 (prime), base clearance" },
  spot: { colour: "moonLight", label: "Standing spots 2–6, base clearance" },
  doorway: { colour: "amber", label: "Doorway lane and approach" },
  lane: { colour: "verdigrisLight", label: "Room lanes" },
  crossing: { colour: "violet", label: "Crossing" },
  stair: { colour: "tideLight", label: "Stair path" },
  walk: { colour: "boneLight", label: "Walks the house makes" },
  open: { colour: "wraithLight", label: "Largest open floor" },
  warning: { colour: "scarlet", label: "Flagged by the overlap check" },
} as const satisfies Record<string, { colour: PaletteKey; label: string }>;
type Mark = keyof typeof KEY;

/** Drawn in this order, later over earlier. */
const LAYER: Record<Mark, number> = { walk: 1, doorway: 2, lane: 3, crossing: 3, stair: 3, open: 4, spot: 5, prime: 5, warning: 6 };
const OPACITY: Partial<Record<Mark, number>> = { walk: 0.7, doorway: 0.35 };

/** How far above what it marks the overlay lies, so it reads as lying over the room. */
const LIFT = 0.06;
const LINE = 0.04;
/** Higher than everything the room draws, so the overlay is drawn last. */
const OVER_ROOM = 1000;
/** A number's disc on the number sheet, in pixels, and the empty margin round
 *  it, so a smaller mipmap never bleeds one number into the next. */
const NUMBER_SIZE = 64;
const NUMBER_MARGIN = 16;
const NUMBER_CELL = NUMBER_SIZE + 2 * NUMBER_MARGIN;
/** How wide a number is drawn, and how high over its spot, in metres. */
const NUMBER_WIDTH = 0.4;
const NUMBER_HEIGHT = 0.35;

export interface PathLegend {
  marks: { colour: PaletteKey; label: string }[];
  /** The overlap check's findings about the floor. */
  findings: string[];
  /** The radius of the largest open floor circle, in metres. */
  openFloor: number;
}

export interface PathOverlay {
  root: THREE.Group;
  legend: PathLegend;
  dispose: () => void;
}

const flat = (x: number, z: number): RoomPoint => [x, 0, z];

/** A flat band along a polyline, `width` wide, lying over each point. */
function band(points: readonly RoomPoint[], width: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const index: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]];
    const length = Math.hypot(b[0] - a[0], b[2] - a[2]);
    if (length < 1e-6) continue;
    const [sx, sz] = [(-(b[2] - a[2]) / length) * (width / 2), ((b[0] - a[0]) / length) * (width / 2)];
    const first = positions.length / 3;
    for (const [x, y, z] of [a, b]) positions.push(x + sx, y + LIFT, z + sz, x - sx, y + LIFT, z - sz);
    index.push(first, first + 1, first + 2, first + 1, first + 3, first + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  return geometry;
}

/** A flat ring round a point, `inner` to `outer` metres out; a disc from 0. */
function ring([x, y, z]: RoomPoint, inner: number, outer: number): THREE.BufferGeometry {
  const geometry = inner > 0 ? new THREE.RingGeometry(inner, outer, 48) : new THREE.CircleGeometry(outer, 24);
  // Drawn unlit and untextured, like a band, which has only a position: so they merge.
  geometry.deleteAttribute("normal");
  geometry.deleteAttribute("uv");
  return geometry.rotateX(-Math.PI / 2).translate(x, y + LIFT, z);
}

interface SpotNumber {
  text: string;
  colour: PaletteKey;
  at: RoomPoint;
}

/** Each number in a dark disc, side by side on one sheet. */
function numberSheet(numbers: readonly SpotNumber[]): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = NUMBER_CELL * numbers.length;
  canvas.height = NUMBER_CELL;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No 2D canvas for the paths overlay's numbers");
  numbers.forEach(({ text, colour }, i) => {
    const [x, y] = [i * NUMBER_CELL + NUMBER_CELL / 2, NUMBER_CELL / 2];
    context.fillStyle = PALETTE.void;
    context.beginPath();
    context.arc(x, y, 30, 0, Math.PI * 2);
    context.fill();
    context.lineWidth = 4;
    context.strokeStyle = PALETTE[colour];
    context.stroke();
    context.fillStyle = PALETTE[colour];
    context.font = "bold 40px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, x, y + 2);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/* As three draws a sprite: each corner pushed out from its number's centre
 * across the view, so the number faces the camera at the size it would have
 * standing there. */
const NUMBER_VERTEX = /* glsl */ `
attribute vec2 corner;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  mvPosition.xy += corner;
  gl_Position = projectionMatrix * mvPosition;
}`;
const NUMBER_FRAGMENT = /* glsl */ `
uniform sampler2D map;
varying vec2 vUv;
void main() {
  gl_FragColor = texture2D(map, vUv);
  #include <colorspace_fragment>
}`;

/** Every spot's number in one mesh, each facing the camera, the farthest drawn first as sprites are. */
function numberMesh(numbers: readonly SpotNumber[]): THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> {
  const positions: number[] = [];
  const corners: number[] = [];
  const uvs: number[] = [];
  const half = NUMBER_WIDTH / 2;
  const sheetWidth = NUMBER_CELL * numbers.length;
  const [top, bottom] = [1 - NUMBER_MARGIN / NUMBER_CELL, 1 - (NUMBER_MARGIN + NUMBER_SIZE) / NUMBER_CELL];
  numbers.forEach(({ at: [x, , z] }, i) => {
    const left = (i * NUMBER_CELL + NUMBER_MARGIN) / sheetWidth;
    const right = (i * NUMBER_CELL + NUMBER_MARGIN + NUMBER_SIZE) / sheetWidth;
    for (const [cx, cy, u, v] of [
      [-half, -half, left, bottom],
      [half, -half, right, bottom],
      [half, half, right, top],
      [-half, half, left, top],
    ]) {
      positions.push(x, NUMBER_HEIGHT, z);
      corners.push(cx, cy);
      uvs.push(u, v);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("corner", new THREE.Float32BufferAttribute(corners, 2));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  const index = new THREE.Uint16BufferAttribute(numbers.length * 6, 1);
  geometry.setIndex(index);
  const material = new THREE.ShaderMaterial({
    vertexShader: NUMBER_VERTEX,
    fragmentShader: NUMBER_FRAGMENT,
    uniforms: { map: { value: numberSheet(numbers) } },
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  // Its corners move in the vertex shader, past the bounds three culls by.
  mesh.frustumCulled = false;
  mesh.renderOrder = OVER_ROOM + LAYER.warning + 1;
  const centre = new THREE.Vector3();
  const order = numbers.map(({ at: [x, , z] }, i) => ({ i, x, z, depth: 0 }));
  mesh.onBeforeRender = (_renderer, _scene, camera) => {
    for (const each of order) each.depth = centre.set(each.x, NUMBER_HEIGHT, each.z).applyMatrix4(camera.matrixWorldInverse).z;
    order.sort((a, b) => a.depth - b.depth);
    order.forEach(({ i }, slot) => {
      for (const [k, corner] of [0, 1, 2, 0, 2, 3].entries()) index.setX(slot * 6 + k, i * 4 + corner);
    });
    index.needsUpdate = true;
  };
  return mesh;
}

const same = (a: readonly [number, number], b: readonly [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6;

/** The overlay for one room: built when shown, freed by `dispose`. */
export function createPathOverlay(def: RoomDefinition): PathOverlay {
  const report = checkFloor(def);
  const root = new THREE.Group();
  root.name = "paths overlay";
  const parts = new Map<Mark, THREE.BufferGeometry[]>();
  const draw = (mark: Mark, geometry: THREE.BufferGeometry) => {
    const list = parts.get(mark);
    if (list) list.push(geometry);
    else parts.set(mark, [geometry]);
  };

  for (const walk of report.walks) draw(walk.blockedAt ? "warning" : "walk", band(walk.path, walk.blockedAt ? LINE * 1.5 : LINE * 0.75));
  for (const end of report.ends) {
    if (end.out) draw("doorway", band([end.out, end.at], DOOR_WIDTH));
    draw(end.out ? "doorway" : "stair", ring(end.at, 0, 0.1));
  }
  for (const lane of def.lanes ?? []) draw("lane", band(lane.map(([x, z]) => flat(x, z)), LINE * 1.5));
  if (def.crossing) draw("crossing", band(def.crossing, LINE * 2));
  for (const path of Object.values(def.stairs ?? {})) draw("stair", band(path, LINE * 2));
  const { at, radius } = report.openFloor;
  if (radius > 0) draw("open", ring(flat(...at), radius - LINE / 2, radius));

  const flagged = report.findings.flatMap((finding) => finding.at ?? []);
  const numbers = standingSpots(def).map(([x, z], slot): SpotNumber => {
    const mark: Mark = flagged.some((point) => same(point, [x, z])) ? "warning" : slot === 0 ? "prime" : "spot";
    draw(mark, ring(flat(x, z), BASE_RADIUS - LINE, BASE_RADIUS));
    draw(mark, ring(flat(x, z), 0, 0.05));
    return { text: String(slot + 1), colour: KEY[mark].colour, at: flat(x, z) };
  });
  for (const point of flagged) draw("warning", ring(flat(...point), 0, 0.12));

  // One mesh a colour, in the order each colour was first drawn: three draws
  // meshes of one render order by when they were made, as it drew the pieces.
  const meshes = [...parts].map(([mark, geometries]) => {
    const merged = mergeGeometries(geometries);
    for (const geometry of geometries) geometry.dispose();
    const material = new THREE.MeshBasicMaterial({ color: PALETTE[KEY[mark].colour], transparent: true, opacity: OPACITY[mark] ?? 0.9, depthTest: false, depthWrite: false, fog: false, toneMapped: false, side: THREE.DoubleSide, forceSinglePass: true });
    const mesh = new THREE.Mesh(merged, material);
    mesh.renderOrder = OVER_ROOM + LAYER[mark];
    return mesh;
  });
  const labels = numbers.length > 0 ? numberMesh(numbers) : null;
  root.add(...meshes);
  if (labels) root.add(labels);

  return {
    root,
    legend: {
      marks: (Object.keys(KEY) as Mark[]).filter((mark) => parts.has(mark)).map((mark) => KEY[mark]),
      findings: report.findings.map((finding) => finding.text),
      openFloor: radius,
    },
    dispose: () => {
      for (const { geometry, material } of meshes) {
        geometry.dispose();
        material.dispose();
      }
      if (labels) {
        labels.geometry.dispose();
        (labels.material.uniforms.map.value as THREE.Texture).dispose();
        labels.material.dispose();
      }
    },
  };
}
