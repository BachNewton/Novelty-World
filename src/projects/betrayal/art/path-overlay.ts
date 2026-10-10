import * as THREE from "three";
import { BASE_RADIUS, checkFloor } from "./overlap";
import { PALETTE, type PaletteKey } from "./palette";
import { DOOR_WIDTH, standingSpots, type RoomDefinition, type RoomPoint } from "./room";

/*
 * The bench's paths overlay (`&paths`): where figures stand and walk in a
 * room, drawn over it from the overlap check's own floor report (the walks
 * the house makes, and what is wrong with them). Debug only: it lies over
 * the room, never in it, unlit, drawn over everything without depth so it
 * fights nothing and reads from every view.
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
  return geometry.rotateX(-Math.PI / 2).translate(x, y + LIFT, z);
}

/** A number in a dark disc that always faces the camera. */
function numberTexture(text: string, colour: PaletteKey): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No 2D canvas for the paths overlay's numbers");
  context.fillStyle = PALETTE.void;
  context.beginPath();
  context.arc(32, 32, 30, 0, Math.PI * 2);
  context.fill();
  context.lineWidth = 4;
  context.strokeStyle = PALETTE[colour];
  context.stroke();
  context.fillStyle = PALETTE[colour];
  context.font = "bold 40px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 32, 34);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const same = (a: readonly [number, number], b: readonly [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6;

/** The overlay for one room: built when shown, freed by `dispose`. */
export function createPathOverlay(def: RoomDefinition): PathOverlay {
  const report = checkFloor(def);
  const root = new THREE.Group();
  root.name = "paths overlay";
  const shown = new Set<Mark>();
  const materials = new Map<Mark, THREE.MeshBasicMaterial>();
  const material = (mark: Mark) => {
    let found = materials.get(mark);
    if (!found) {
      const opacity = OPACITY[mark] ?? 0.9;
      found = new THREE.MeshBasicMaterial({ color: PALETTE[KEY[mark].colour], transparent: true, opacity, depthTest: false, depthWrite: false, fog: false, toneMapped: false, side: THREE.DoubleSide });
      materials.set(mark, found);
    }
    return found;
  };
  const draw = (mark: Mark, geometry: THREE.BufferGeometry) => {
    const mesh = new THREE.Mesh(geometry, material(mark));
    mesh.renderOrder = OVER_ROOM + LAYER[mark];
    root.add(mesh);
    shown.add(mark);
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
  const textures: THREE.Texture[] = [];
  const sprites: THREE.SpriteMaterial[] = [];
  standingSpots(def).forEach(([x, z], slot) => {
    const mark: Mark = flagged.some((point) => same(point, [x, z])) ? "warning" : slot === 0 ? "prime" : "spot";
    draw(mark, ring(flat(x, z), BASE_RADIUS - LINE, BASE_RADIUS));
    draw(mark, ring(flat(x, z), 0, 0.05));
    const texture = numberTexture(String(slot + 1), KEY[mark].colour);
    const label = new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
    textures.push(texture);
    sprites.push(label);
    const sprite = new THREE.Sprite(label);
    sprite.scale.setScalar(0.4);
    sprite.position.set(x, 0.35, z);
    sprite.renderOrder = OVER_ROOM + LAYER.warning + 1;
    root.add(sprite);
  });
  for (const point of flagged) draw("warning", ring(flat(...point), 0, 0.12));

  return {
    root,
    legend: {
      marks: (Object.keys(KEY) as Mark[]).filter((mark) => shown.has(mark)).map((mark) => KEY[mark]),
      findings: report.findings.map((finding) => finding.text),
      openFloor: radius,
    },
    dispose: () => {
      root.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
      for (const each of [...materials.values(), ...sprites, ...textures]) each.dispose();
    },
  };
}
