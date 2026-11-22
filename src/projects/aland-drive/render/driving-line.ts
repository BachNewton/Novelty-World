import { BufferAttribute, BufferGeometry, Mesh, MeshBasicNodeMaterial, type Node, type Scene } from "three/webgpu";
import { attribute, float, fract, mix, smoothstep, step } from "three/tsl";
import { sharedUniform } from "../art/shared-uniform";
import type { DrivingLine } from "../driving-line";
import { plannedSpeedAt, type PacePlan } from "../racers/speed-plan";
import type { RoadLine } from "../sim/road-net";

/*
 * The driving line: a ribbon on the road ahead of the player's car along a race's racing line, coloured by the
 * player's speed against what their own car's plan carries at each place (`racers/car-plan.ts`). Where the car is
 * slow enough it is blue; where it would have to lose speed before it gets there it turns amber and then red, and
 * breaks into chevrons, so the braking shows by shape as well as colour. Shown whole, or only where it says slow.
 *
 * It is one small mesh, a fixed run of cross-sections from just behind the car, one at each of the line's points and
 * one between, written again only when the car has moved on a point. Each lies on the line's own height, which is
 * the road's surface where the line runs, and a hand above it. Its colour and its fades are worked out in its
 * fragments from two numbers the frame sets, the car's speed and its place, and the car's place is followed along
 * the line's own points, so a frame makes nothing on the CPU. It is light for the driver's eyes, not paint on the
 * road, so it takes neither the hour's light nor the haze.
 */

export interface DrivingLineInputs {
  colour: (name: string) => Node<"vec3">;
}

/** Cross-sections along the line, two to each of its points, which are about this far apart: enough of them to reach as far as a fast car needs to see. */
const POINT_M = 4;
const SECTIONS = 150;
const HALF_WIDTH_M = 0.38;
const LIFT_M = 0.08;
/** It starts this many of the line's points behind the car, and comes in over a few metres ahead of it. */
const BEHIND_POINTS = 1;
const NEAR_FROM_M = 3;
const NEAR_FULL_M = 9;
/** How far ahead it reaches: this many seconds of the car's travel, between two bounds, its last stretch fading out. */
const REACH_S = 3.4;
const LEAST_REACH_M = 70;
const MOST_REACH_M = (SECTIONS / 2 - BEHIND_POINTS - 3) * POINT_M * 0.8;
const FAR_FADE_SHARE = 0.35;
/** Metres a second over what the plan carries at a place: amber from the first, red from the second. */
const SLOW_FROM_MS = 0.5;
const SLOW_FULL_MS = 3;
const STOP_FROM_MS = 3;
const STOP_FULL_MS = 8;
/** Where it says stop it is chevrons this long, each swept back this far at its edges, with this share of each a gap. */
const CHEVRON_M = 4;
const CHEVRON_SWEEP_M = 1.2;
const CHEVRON_GAP = 0.42;
const OPACITY = 0.82;
/** The car is followed on from the point it was nearest, looking this many points either way. */
const FOLLOW_POINTS = 4;
/** Further than this from that point, the car has been put somewhere or left the road: it is looked for afresh each time it has moved this far, near where it was and then on the whole line. */
const LOST_M = 30;
const SEEK_POINTS = 100;
const SEEK_AGAIN_M = 10;

export function createDrivingLine(scene: Scene, { colour }: DrivingLineInputs) {
  const positions = new BufferAttribute(new Float32Array(SECTIONS * 2 * 3), 3);
  const plans = new BufferAttribute(new Float32Array(SECTIONS * 2), 1);
  const metres = new BufferAttribute(new Float32Array(SECTIONS * 2), 1);
  const acrosses = new BufferAttribute(Float32Array.from({ length: SECTIONS * 2 }, (_, vertex) => (vertex % 2 === 0 ? -1 : 1)), 1);
  const indices: number[] = [];
  for (let section = 0; section + 1 < SECTIONS; section++) {
    const at = section * 2;
    indices.push(at, at + 1, at + 2, at + 1, at + 3, at + 2);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", positions);
  geometry.setAttribute("plan", plans);
  geometry.setAttribute("metres", metres);
  geometry.setAttribute("across", acrosses);
  geometry.setIndex(indices);

  const speedNow = sharedUniform(0);
  const carMetres = sharedUniform(0);
  const reachM = sharedUniform(LEAST_REACH_M);
  const brakingOnly = sharedUniform(0);

  const plan = attribute<"float">("plan", "float");
  const along = attribute<"float">("metres", "float");
  const across = attribute<"float">("across", "float").abs();
  const over = speedNow.sub(plan);
  const slow = smoothstep(SLOW_FROM_MS, SLOW_FULL_MS, over);
  const stop = smoothstep(STOP_FROM_MS, STOP_FULL_MS, over);
  const ahead = along.sub(carMetres);
  const gap = step(1 - CHEVRON_GAP, fract(along.sub(across.mul(CHEVRON_SWEEP_M)).div(CHEVRON_M))).mul(stop);
  const edge = float(1).sub(smoothstep(0.72, 1, across));
  const near = smoothstep(NEAR_FROM_M, NEAR_FULL_M, ahead);
  const far = float(1).sub(smoothstep(reachM.mul(1 - FAR_FADE_SHARE), reachM, ahead));
  const material = new MeshBasicNodeMaterial();
  material.name = "driving-line";
  material.colorNode = mix(mix(colour("line-go"), colour("line-slow"), slow), colour("line-stop"), stop);
  material.opacityNode = edge.mul(near).mul(far).mul(float(1).sub(gap)).mul(mix(float(1), slow, brakingOnly)).mul(OPACITY);
  material.transparent = true;
  material.depthWrite = false;
  material.side = 2;
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.visible = false;
  scene.add(mesh);

  let route: { line: RoadLine; plan: PacePlan } | null = null;
  let mode: DrivingLine = "off";
  /** The line's point the car is nearest, and the point the ribbon was last written from; -1 before the car has been found. */
  let nearPoint = -1;
  let writtenFrom = -1;
  /** The metres written are from here, a whole number of chevrons along, so the chevrons stay where they are on the road. */
  let base = 0;
  let compiling = false;
  /** Where the car was when it was last looked for on the line and not found. */
  let soughtX = NaN;
  let soughtZ = NaN;

  const show = () => {
    mesh.visible = compiling || (route !== null && mode !== "off" && writtenFrom >= 0);
  };

  /** The ribbon from one of the line's points on: a cross-section at each point and one between each two, with the plan's speed there. */
  const write = ({ points, lengths }: RoadLine, pace: PacePlan, from: number) => {
    const last = lengths.length - 1;
    base = Math.floor(lengths[from] / CHEVRON_M) * CHEVRON_M;
    for (let section = 0; section < SECTIONS; section++) {
      const point = Math.min(from + (section >> 1), last);
      const next = Math.min(point + 1, last);
      const between = section % 2 === 1;
      const x = between ? (points[point * 3] + points[next * 3]) / 2 : points[point * 3];
      const y = between ? (points[point * 3 + 1] + points[next * 3 + 1]) / 2 : points[point * 3 + 1];
      const z = between ? (points[point * 3 + 2] + points[next * 3 + 2]) / 2 : points[point * 3 + 2];
      // The way the line runs here: across a point from the one before it to the one after, between two along their own stretch.
      const before = between ? point : Math.max(point - 1, 0);
      const runX = points[next * 3] - points[before * 3];
      const runZ = points[next * 3 + 2] - points[before * 3 + 2];
      const run = Math.sqrt(runX * runX + runZ * runZ) || 1;
      // Right of a way is its (-z, x).
      const rightX = (-runZ / run) * HALF_WIDTH_M;
      const rightZ = (runX / run) * HALF_WIDTH_M;
      positions.setXYZ(section * 2, x - rightX, y + LIFT_M, z - rightZ);
      positions.setXYZ(section * 2 + 1, x + rightX, y + LIFT_M, z + rightZ);
      const at = between ? (lengths[point] + lengths[next]) / 2 : lengths[point];
      const speed = plannedSpeedAt(pace, at);
      plans.setX(section * 2, speed);
      plans.setX(section * 2 + 1, speed);
      metres.setX(section * 2, at - base);
      metres.setX(section * 2 + 1, at - base);
    }
    positions.needsUpdate = true;
    plans.needsUpdate = true;
    metres.needsUpdate = true;
    writtenFrom = from;
  };

  return {
    /** The line to draw and the plan it is coloured by, or none. */
    setRoute(next: { line: RoadLine; plan: PacePlan } | null): void {
      if (next === route) return;
      route = next;
      nearPoint = -1;
      writtenFrom = -1;
      soughtX = NaN;
      show();
    },
    setMode(next: DrivingLine): void {
      if (next === mode) return;
      mode = next;
      brakingOnly.value = next === "braking" ? 1 : 0;
      show();
    },
    /** Each frame the line is shown: where the car is and how fast it's going. */
    update(x: number, z: number, speedMS: number): void {
      if (!route || mode === "off") return;
      const { line, plan: pace } = route;
      const { points, lengths } = line;
      const last = lengths.length - 1;
      const off = (point: number) => (points[point * 3] - x) * (points[point * 3] - x) + (points[point * 3 + 2] - z) * (points[point * 3 + 2] - z);
      /** The nearest of a run of the line's points, the first of them where two are as near. */
      const nearestOf = (from: number, to: number) => {
        let best = from;
        let nearest = off(from);
        for (let point = from + 1; point <= to; point++) {
          const distance = off(point);
          if (distance < nearest) {
            nearest = distance;
            best = point;
          }
        }
        return best;
      };
      if (nearPoint < 0 || off(nearPoint) > LOST_M * LOST_M) {
        if ((soughtX - x) * (soughtX - x) + (soughtZ - z) * (soughtZ - z) < SEEK_AGAIN_M * SEEK_AGAIN_M) return;
        soughtX = x;
        soughtZ = z;
        // Near where it was first, so a car put back on a circuit stays on its lap; then the whole line, the first lap's where laps pass a place.
        let found = nearPoint < 0 ? -1 : nearestOf(Math.max(0, nearPoint - SEEK_POINTS), Math.min(last, nearPoint + SEEK_POINTS));
        if (found < 0 || off(found) > LOST_M * LOST_M) found = nearestOf(0, last);
        if (off(found) > LOST_M * LOST_M) {
          writtenFrom = -1;
          show();
          return;
        }
        nearPoint = found;
      }
      soughtX = NaN;
      nearPoint = nearestOf(Math.max(0, nearPoint - FOLLOW_POINTS), Math.min(last, nearPoint + FOLLOW_POINTS));
      // The car's place along the stretch it is on: the one on from its nearest point, or the one up to it.
      const share = (from: number) => {
        const runX = points[from * 3 + 3] - points[from * 3];
        const runZ = points[from * 3 + 5] - points[from * 3 + 2];
        const run = runX * runX + runZ * runZ;
        return run === 0 ? 0 : ((x - points[from * 3]) * runX + (z - points[from * 3 + 2]) * runZ) / run;
      };
      const onward = nearPoint < last ? share(nearPoint) : -1;
      const stretch = onward >= 0 || nearPoint === 0 ? Math.min(nearPoint, last - 1) : nearPoint - 1;
      const carAlong = lengths[stretch] + Math.max(0, Math.min(1, stretch === nearPoint ? onward : share(stretch))) * (lengths[stretch + 1] - lengths[stretch]);
      const from = Math.max(0, nearPoint - BEHIND_POINTS);
      if (from !== writtenFrom) write(line, pace, from);
      speedNow.value = speedMS;
      carMetres.value = carAlong - base;
      reachM.value = Math.max(LEAST_REACH_M, Math.min(MOST_REACH_M, speedMS * REACH_S));
      show();
    },
    /** Shown at once, so its pipeline is built before the drive starts. */
    showAll(shown: boolean): void {
      compiling = shown;
      show();
    },
    dispose(): void {
      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
    },
  };
}

export type DrivingLineMesh = ReturnType<typeof createDrivingLine>;
