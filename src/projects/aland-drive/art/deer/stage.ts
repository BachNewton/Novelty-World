import { Color, Mesh, MeshBasicNodeMaterial, PerspectiveCamera, PlaneGeometry, Scene, Vector3, WebGPURenderer, type Node } from "three/webgpu";
import { exp, float, mix, positionWorld, sin, smoothstep, uniform, vec3, cameraPosition } from "three/tsl";
import { themeColor } from "@/shared/lib/three/theme-color";
import { placeModel } from "../roadside";
import { buildBirch, buildBush, buildJuniper, ruralMaterials } from "../rural";
import { createDeerHerd, type HerdDeer } from "./herd";
import { GAIT_SHAPES, GAITS, gaitSpeed, seasonOf, type Gait } from "./gaits";
import { DEER_KINDS, type DeerKind } from "./shape";

/*
 * The deer's gallery, on the game's renderer, sun and haze: a field by a road with
 * a forest edge across it. A line-up of each kind in each gait, strips of each gait
 * held at points through its cycle, a doe with her kids crossing the road out of
 * the trees, and a doe alone to be seen from any distance. Everything on it is a
 * function of one clock, so the headless gallery (`gallery-page.ts`) takes its
 * shots at chosen moments and the `?deer-lab` page runs it live.
 */

const SUN = { azimuthDeg: 215, elevationDeg: 34 };
const HAZE_M = 16000;
const ROAD_Z = -9;
const ROAD_HALF_M = 3.2;
const EDGE_Z = -16;
const STRIP_X = 40;
const STRIP_PHASES = 6;
const STRIP_GAP_M = 2.1;
const stripX = (row: number) => STRIP_X + row * 30;
const stripMiddle = (row: number) => stripX(row) + (STRIP_GAP_M * (STRIP_PHASES - 1)) / 2;
const CROSS_X = -30;
const ALONE_X = -90;
const ALONE_Z = 60;
const CROSSING_S = 16;

export interface Shot {
  name: string;
  label: string;
  camera: [number, number, number];
  target: [number, number, number];
  fieldOfView: number;
  /** The stage's clock at the shot. */
  time: number;
  /** Day of the year, for the coat, antlers and spots. */
  day: number;
}

const SUMMER_DAY = 200;
const shot = (name: string, label: string, camera: Shot["camera"], target: Shot["target"], fieldOfView = 30, time = 3.1, day = SUMMER_DAY): Shot => ({ name, label, camera, target, fieldOfView, time, day });

const LINE_GAP_X = 2.4;
const ROW_GAP_Z = 1.9;
const lineX = (gait: number) => (gait - 1.5) * LINE_GAP_X;
const rowZ = (kind: number) => kind * ROW_GAP_Z;

export const SHOTS: Shot[] = [
  shot("lineup", "each kind in each gait: doe, buck, kid from the back row", [0, 1.6, 15], [0, 0.55, 2], 32),
  shot("lineup-quarter", "the line-up from ahead and to the side", [9, 1.4, 11], [0, 0.6, 2], 34),
  shot("lineup-back", "from behind: the rump patch", [-3, 1.3, -6], [0, 0.6, 2], 36),
  shot("doe-head", "a doe standing alert, her head", [lineX(0) + 1.4, 1.05, 1.6], [lineX(0), 0.82, 0.3], 26),
  shot("buck-head", "a buck's antlers", [lineX(0) + 1.3, 1.25, rowZ(1) + 1.4], [lineX(0), 0.95, rowZ(1) + 0.3], 26),
  shot("kid-spots", "a kid's spots in summer", [lineX(0) - 1.6, 1.1, rowZ(2) + 0.9], [lineX(0), 0.45, rowZ(2)], 30),
  shot("walk-strip", "the walk through its cycle, a sixth apart", [stripMiddle(0), 0.7, 9], [stripMiddle(0), 0.55, 0], 44),
  shot("trot-strip", "the trot through its cycle", [stripMiddle(1), 0.7, 9], [stripMiddle(1), 0.55, 0], 44),
  shot("bound-strip", "the bound through its cycle", [stripMiddle(2), 0.75, 9], [stripMiddle(2), 0.65, 0], 44),
  shot("winter", "the winter coat, and the buck's new antlers in velvet", [0, 1.6, 15], [0, 0.55, 2], 32, 3.1, 40),
  shot("autumn", "November: the buck has cast his antlers, the kid has lost its spots", [9, 1.4, 11], [0, 0.6, 2], 34, 3.1, 320),
  shot("crossing-edge", "a doe and her kids come out of the trees", [CROSS_X + 8, 1.2, ROAD_Z + 18], [CROSS_X, 0.6, ROAD_Z - 4], 34, 3.5),
  shot("crossing-road", "and bound across the road, from a driver's seat", [CROSS_X + 26, 1.2, ROAD_Z + 1.5], [CROSS_X, 0.6, ROAD_Z], 16, 8.6),
  shot("alone-20", "a doe at 20 m, near, through a long lens", [ALONE_X + 20, 1.2, ALONE_Z], [ALONE_X, 0.6, ALONE_Z], 5),
  shot("alone-60", "at 60 m, far", [ALONE_X + 60, 1.2, ALONE_Z], [ALONE_X, 0.6, ALONE_Z], 1.7),
  shot("alone-150", "at 150 m", [ALONE_X + 150, 1.2, ALONE_Z], [ALONE_X, 0.6, ALONE_Z], 0.7),
];

/** The line-up and strips: every kind in every gait, running in place, and each gait held at points through its cycle. */
function standing(time: number): HerdDeer[] {
  const lineup = DEER_KINDS.flatMap((kind, row) =>
    GAITS.map((gait, column): HerdDeer => ({ id: `line ${kind} ${gait}`, kind, gait, x: lineX(column), y: 0, z: rowZ(row), yaw: Math.PI / 2, seed: row * 4 + column, cycle: (time * GAIT_SHAPES[gait].rate + row * 0.13) % 1, turn: gait === "stand" ? 0.5 : 0 })),
  );
  const strips = (["walk", "trot", "bound"] as const).flatMap((gait, row) =>
    Array.from({ length: STRIP_PHASES }, (_, step): HerdDeer => ({ id: `strip ${gait} ${step}`, kind: "doe", gait, x: stripX(row) + step * STRIP_GAP_M, y: 0, z: 0, yaw: Math.PI / 2, seed: 50 + step, cycle: step / STRIP_PHASES })),
  );
  const alone: HerdDeer = { id: "alone", kind: "doe", gait: "stand", x: ALONE_X, y: 0, z: ALONE_Z, yaw: Math.PI / 2, seed: 70, turn: 0.6 };
  return [...lineup, ...strips, alone];
}

/** Where a crossing deer is at a time: out of the trees at a walk, a stop on the verge to look, then a bound across the road and a trot away. */
function crossing(time: number): HerdDeer[] {
  const legs: { gait: Gait; seconds: number }[] = [
    { gait: "walk", seconds: 4 },
    { gait: "stand", seconds: 3.2 },
    { gait: "bound", seconds: 1.6 },
    { gait: "trot", seconds: 3.4 },
    { gait: "stand", seconds: 3.8 },
  ];
  const group: { kind: DeerKind; lag: number; side: number; seed: number }[] = [
    { kind: "doe", lag: 0, side: 0, seed: 81 },
    { kind: "kid", lag: 0.5, side: -1.1, seed: 82 },
    { kind: "kid", lag: 0.9, side: 1, seed: 83 },
  ];
  return group.map(({ kind, lag, side, seed }) => {
    let left = (((time - lag) % CROSSING_S) + CROSSING_S) % CROSSING_S;
    let z = EDGE_Z + 1 - lag * 1.2;
    let gait: Gait = "walk";
    for (const leg of legs) {
      const spent = Math.min(left, leg.seconds);
      z += gaitSpeed(leg.gait) * spent;
      gait = leg.gait;
      left -= spent;
      if (left <= 0) break;
    }
    const turn = gait === "stand" ? (z < ROAD_Z ? 0.9 : -0.6) : 0;
    return { id: `cross ${seed}`, kind, gait, x: CROSS_X + side, y: 0, z, yaw: 0, seed, speed: gaitSpeed(gait), turn };
  });
}

export async function startDeerStage(element: HTMLElement, size: { width: number; height: number }) {
  const token = (name: string) => themeColor(`--color-aland-drive-${name}`);
  const colorOf = (name: string): Node<"vec3"> => {
    const { r, g, b } = token(name);
    return vec3(r, g, b);
  };
  const linear = (name: string) => {
    const { r, g, b } = token(name);
    return new Vector3(r, g, b);
  };
  const hazed = (color: Node<"vec3">) => mix(color, colorOf("sky"), float(1).sub(exp(positionWorld.sub(cameraPosition).length().div(HAZE_M).pow(2).negate())));
  const clock = uniform(0);
  const inputs = { linear, colour: colorOf, hazed, sun: SUN, time: clock };

  const renderer = new WebGPURenderer({ antialias: true, reversedDepthBuffer: true });
  await renderer.init();
  if (!("isWebGPUBackend" in renderer.backend)) throw new Error("no WebGPU");
  renderer.setClearColor(new Color(token("sky")));
  renderer.setPixelRatio(1);
  renderer.setSize(size.width, size.height);
  element.appendChild(renderer.domElement);

  const scene = new Scene();
  const camera = new PerspectiveCamera(30, size.width / size.height, 0.1, 20000);

  const groundGeometry = new PlaneGeometry(1, 1);
  groundGeometry.rotateX(-Math.PI / 2);
  const groundMaterial = new MeshBasicNodeMaterial();
  const at = positionWorld.xz;
  const patch = sin(at.x.mul(0.31).add(sin(at.y.mul(0.23)).mul(2))).mul(sin(at.y.mul(0.47).add(at.x.mul(0.11)))).mul(0.5).add(0.5);
  const grass = colorOf("ground").mul(mix(float(0.86), float(1.04), patch));
  const onRoad = float(1).sub(smoothstep(float(ROAD_HALF_M), float(ROAD_HALF_M + 0.1), at.y.sub(ROAD_Z).abs()));
  const shoulder = float(1).sub(smoothstep(float(ROAD_HALF_M + 0.9), float(ROAD_HALF_M + 1), at.y.sub(ROAD_Z).abs()));
  groundMaterial.colorNode = hazed(mix(mix(grass, colorOf("road-shoulder"), shoulder), colorOf("road-main"), onRoad));
  const land = new Mesh(groundGeometry, groundMaterial);
  land.scale.set(8000, 1, 8000);
  land.frustumCulled = false;
  scene.add(land);

  // The forest edge: birches, bushes and junipers along the far side of the road.
  const rural = ruralMaterials(inputs);
  const random = (index: number, salt: number) => ((Math.imul(index * 7919 + salt, 2654435761) >>> 0) / 4294967296);
  const along = (count: number, salt: number, depth: number) => Array.from({ length: count }, (_, index) => ({ x: -140 + (280 * (index + random(index, salt))) / count, y: 0, z: EDGE_Z - random(index, salt + 1) * depth, yaw: random(index, salt + 2) * 6.28, scale: 0.8 + random(index, salt + 3) * 0.6 }));
  scene.add(...placeModel(buildBirch(1, "silver"), along(70, 1, 14), rural), ...placeModel(buildBirch(3, "clump"), along(40, 11, 18), rural), ...placeModel(buildBush(1, "hazel"), along(90, 21, 6), rural), ...placeModel(buildJuniper(2, "spreading"), along(30, 31, 10), rural));

  const herd = createDeerHerd({ inputs, room: 64 });
  scene.add(...herd.meshes);

  let time = 0;
  let day = SUMMER_DAY;
  const drawAt = (seconds: number) => {
    clock.value = time;
    herd.draw([...standing(time), ...crossing(time)], { x: camera.position.x, z: camera.position.z }, seconds, seasonOf(day));
  };

  return {
    renderer,
    camera,
    herd,
    /** Moves the stage's clock on and draws. */
    step(seconds: number) {
      time += seconds;
      drawAt(seconds);
      renderer.render(scene, camera);
    },
    /** Moves the camera to a shot's view, leaving the clock and the day. */
    look(wanted: Shot) {
      camera.fov = wanted.fieldOfView;
      camera.updateProjectionMatrix();
      camera.position.set(...wanted.camera);
      camera.lookAt(...wanted.target);
    },
    /** Puts the stage at a shot: its clock, day and view. */
    show(wanted: Shot) {
      this.look(wanted);
      // The crossing runs on its cycles from the clock, so the herd is walked up to the shot's moment in small steps.
      time = wanted.time - 1;
      day = wanted.day;
      for (let step = 0; step < 30; step++) {
        time += 1 / 30;
        drawAt(1 / 30);
      }
      renderer.render(scene, camera);
      return { drawCalls: renderer.info.render.drawCalls, triangles: renderer.info.render.triangles, deer: herd.counts() };
    },
    setDay(next: number) {
      day = next;
    },
    resize(width: number, height: number) {
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
    dispose() {
      herd.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

export type DeerStage = Awaited<ReturnType<typeof startDeerStage>>;
