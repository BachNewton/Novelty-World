import { BufferAttribute, BufferGeometry, Mesh, MeshBasicNodeMaterial, type Color, type Scene } from "three/webgpu";
import { attribute } from "three/tsl";
import type { LaneNet } from "../traffic/lane-net";
import type { TileLanes } from "../traffic/lane-map";

/*
 * The lane map drawn over the road, for the lane lab: every lane a strip along
 * the middle of its half, with an arrowhead every few metres the way it runs, and
 * every connector across a junction coloured by its right of way, so a junction's
 * rules can be judged by eye. A ring marks each place the audit found a lane that
 * can't sit cleanly on the drawn road. A tile's lanes are one mesh, built when it
 * lands while the overlay is shown.
 */

const LIFT_M = 0.12;
const LANE_WIDTH_M = 0.35;
const CONNECTOR_WIDTH_M = 0.28;
const ARROW_EVERY_M = 10;
const ARROW_LENGTH_M = 1.6;
const ARROW_WIDTH_M = 1.1;
const RING_RADIUS_M = 5;
const RING_WIDTH_M = 0.6;
const RING_SIDES = 24;

/** The overlay's colours, `--color-aland-drive-<name>` tokens. */
const INKS = {
  road: "lane-road",
  path: "lane-path",
  priority: "lane-priority",
  yields: "lane-yield",
  off: "lane-off",
  back: "lane-back",
  issue: "lane-issue",
} as const;

type Ink = keyof typeof INKS;

class Strips {
  readonly positions: number[] = [];
  readonly colours: number[] = [];

  constructor(private readonly inks: Record<Ink, Color>) {}

  private corner(x: number, y: number, z: number, ink: Ink): void {
    const { r, g, b } = this.inks[ink];
    this.positions.push(x, y + LIFT_M, z);
    this.colours.push(r, g, b);
  }

  triangle(a: number[], b: number[], c: number[], ink: Ink): void {
    for (const [x, y, z] of [a, b, c]) this.corner(x, y, z, ink);
  }

  /** A strip along points[first..first+count), `width` across. */
  line(points: Float32Array, first: number, count: number, width: number, ink: Ink): void {
    for (let at = first; at < first + count - 1; at++) {
      const [x0, y0, z0, x1, y1, z1] = points.subarray(at * 3, at * 3 + 6);
      const length = Math.hypot(x1 - x0, z1 - z0);
      if (length < 1e-4) continue;
      const nx = (-(z1 - z0) / length) * (width / 2);
      const nz = ((x1 - x0) / length) * (width / 2);
      const a = [x0 + nx, y0, z0 + nz];
      const b = [x0 - nx, y0, z0 - nz];
      const c = [x1 - nx, y1, z1 - nz];
      const d = [x1 + nx, y1, z1 + nz];
      this.triangle(a, b, c, ink);
      this.triangle(a, c, d, ink);
    }
  }

  /** An arrowhead every so often along a line, pointing the way it runs. */
  arrows(points: Float32Array, first: number, count: number, ink: Ink): void {
    let travelled = ARROW_EVERY_M / 2;
    for (let at = first; at < first + count - 1; at++) {
      const [x0, y0, z0, x1, y1, z1] = points.subarray(at * 3, at * 3 + 6);
      const length = Math.hypot(x1 - x0, z1 - z0);
      if (length < 1e-4) continue;
      const dx = (x1 - x0) / length;
      const dz = (z1 - z0) / length;
      while (travelled < length) {
        const share = travelled / length;
        const [x, y, z] = [x0 + (x1 - x0) * share, y0 + (y1 - y0) * share, z0 + (z1 - z0) * share];
        const half = ARROW_WIDTH_M / 2;
        this.triangle([x + dx * ARROW_LENGTH_M, y, z + dz * ARROW_LENGTH_M], [x - dz * half, y, z + dx * half], [x + dz * half, y, z - dx * half], ink);
        travelled += ARROW_EVERY_M;
      }
      travelled -= length;
    }
  }

  ring(x: number, y: number, z: number, ink: Ink): void {
    for (let side = 0; side < RING_SIDES; side++) {
      const [a, b] = [side, side + 1].map((step) => (step / RING_SIDES) * Math.PI * 2);
      const inner = RING_RADIUS_M - RING_WIDTH_M / 2;
      const outer = RING_RADIUS_M + RING_WIDTH_M / 2;
      const at = (angle: number, radius: number) => [x + Math.cos(angle) * radius, y, z + Math.sin(angle) * radius];
      this.triangle(at(a, inner), at(a, outer), at(b, outer), ink);
      this.triangle(at(a, inner), at(b, outer), at(b, inner), ink);
    }
  }
}

function connectorInk(connector: TileLanes["connectors"][number]): Ink {
  if (connector.offM > 0) return "off";
  if (connector.turn === "back") return "back";
  return connector.yields.length > 0 ? "yields" : "priority";
}

function tileGeometry(lanes: TileLanes, inks: Record<Ink, Color>): BufferGeometry {
  const strips = new Strips(inks);
  for (const lane of lanes.lanes) {
    const ink = lane.path ? "path" : "road";
    strips.line(lanes.points, lane.first, lane.count, LANE_WIDTH_M, ink);
    strips.arrows(lanes.points, lane.first, lane.count, ink);
  }
  for (const connector of lanes.connectors) strips.line(lanes.points, connector.first, connector.count, CONNECTOR_WIDTH_M, connectorInk(connector));
  for (const link of lanes.links) strips.line(lanes.points, link.first, link.count, CONNECTOR_WIDTH_M, "path");
  for (const issue of lanes.issues) strips.ring(issue.x, issue.y, issue.z, issue.path ? "path" : "issue");
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(strips.positions), 3));
  geometry.setAttribute("colour", new BufferAttribute(new Float32Array(strips.colours), 3));
  return geometry;
}

export function createLaneOverlay(scene: Scene, net: LaneNet, ink: (name: string) => Color) {
  const inks = Object.fromEntries(Object.entries(INKS).map(([key, name]) => [key, ink(name)])) as Record<Ink, Color>;
  const material = new MeshBasicNodeMaterial();
  material.name = "lane-overlay";
  material.colorNode = attribute("colour", "vec3");
  material.side = 2;
  const meshes = new Map<string, Mesh>();
  let shown = false;

  const drop = (name: string) => {
    const mesh = meshes.get(name);
    if (!mesh) return;
    scene.remove(mesh);
    mesh.geometry.dispose();
    meshes.delete(name);
  };

  const sync = () => {
    const loaded = new Set(shown ? net.loaded() : []);
    for (const name of [...meshes.keys()]) if (!loaded.has(name)) drop(name);
    for (const name of loaded) {
      const lanes = net.tile(name);
      if (meshes.has(name) || !lanes) continue;
      const mesh = new Mesh(tileGeometry(lanes, inks), material);
      mesh.frustumCulled = false;
      scene.add(mesh);
      meshes.set(name, mesh);
    }
  };
  const stopListening = net.subscribe(sync);

  return {
    show(next: boolean) {
      shown = next;
      sync();
    },
    shown: () => shown,
    dispose() {
      stopListening();
      shown = false;
      sync();
      material.dispose();
    },
  };
}
