import { Color, Mesh, MeshBasicNodeMaterial, PerspectiveCamera, PlaneGeometry, Scene, Vector3, WebGPURenderer, type Node } from "three/webgpu";
import { uniform, vec3 } from "three/tsl";
import { themeColor } from "@/shared/lib/three/theme-color";
import { bakeCrowd, crowdMeshes, peopleMaterials, type PlacedFigure } from "./index";
import { HAIR_STYLES, rollFigure, type FigureSpec, type HairStyle, type Hat } from "./figure";
import { POSES, posed, type PoseName } from "./poses";
import { measure } from "./skeleton";

/*
 * Every hair style on every head, from every side, near and at a distance: each
 * cell is rendered and copied to a sheet in the page, so a few hundred views cost a
 * few hundred frames. Nothing else stands near them.
 */

const SUN = { azimuthDeg: 215, elevationDeg: 34 };
const CELL = 240;
const SPACING_M = 70;

const token = (name: string) => themeColor(`--color-aland-drive-${name}`);
const colorOf = (name: string): Node<"vec3"> => {
  const { r, g, b } = token(name);
  return vec3(r, g, b);
};
const linear = (name: string) => {
  const { r, g, b } = token(name);
  return new Vector3(r, g, b);
};
const clock = uniform(2.4);
const inputs = { linear, colour: colorOf, hazed: (color: Node<"vec3">) => color, sun: SUN, time: clock };

const renderer = new WebGPURenderer({ antialias: true, reversedDepthBuffer: true });
await renderer.init();
renderer.setClearColor(new Color(token("sky")));
renderer.setPixelRatio(1);
renderer.setSize(CELL, CELL);
document.body.appendChild(renderer.domElement);

const scene = new Scene();
const camera = new PerspectiveCamera(30, 1, 0.1, 2000);
const groundGeometry = new PlaneGeometry(4000, 4000);
groundGeometry.rotateX(-Math.PI / 2);
const groundMaterial = new MeshBasicNodeMaterial();
groundMaterial.colorNode = colorOf("ground");
const ground = new Mesh(groundGeometry, groundMaterial);
ground.position.y = -0.5;
ground.frustumCulled = false;
scene.add(ground);

const HEADS: Record<string, Partial<FigureSpec>> = {
  "narrow woman": { age: "adult", frame: 0.9, build: 0.1, heightM: 1.66, skin: "skin-2", hairColour: "hair-blond", outfit: "summer-dress", hat: "none", mirrored: false },
  "broad man": { age: "adult", frame: 0.08, build: 0.95, heightM: 1.86, skin: "skin-4", hairColour: "hair-brown", outfit: "shirt-trousers", hat: "none", mirrored: false },
  "older woman": { age: "older", frame: 0.8, build: 0.6, heightM: 1.6, skin: "skin-1", hairColour: "hair-grey", outfit: "blouse-skirt", hat: "none", mirrored: false },
  "older man": { age: "older", frame: 0.15, build: 0.5, heightM: 1.74, skin: "skin-3", hairColour: "hair-white", outfit: "jacket-trousers", hat: "none", mirrored: false },
  child: { age: "child", heightM: 1.25, skin: "skin-5", hairColour: "hair-black", outfit: "tee-shorts", hat: "none", mirrored: false },
};
const VIEWS: Record<string, number> = { front: 0, "three-quarter": 40, side: 90, back: 180 };
const HATS: readonly Hat[] = ["cap", "sun-hat", "helmet"];
const POSE_STYLES: readonly HairStyle[] = ["long", "ponytail", "bob"];

const figures: PlacedFigure[] = [];
let nextSpot = 0;
const place = (spec: Partial<FigureSpec>, pose: PoseName) => {
  const spot = nextSpot++;
  const x = (spot % 12) * SPACING_M;
  const z = Math.floor(spot / 12) * SPACING_M;
  figures.push({ seed: 7, pose, x, y: 0, z, spec, phase: 0 });
  const body = measure(rollFigure(7, spec));
  return { x, z, at: posed(pose, body).head.at, height: body.headM };
};

const shots: { sheet: string; column: number; row: number; camera: Vector3; target: Vector3; fov: number }[] = [];
const orbit = (x: number, z: number, targetY: number, azimuthDeg: number, distance: number, lift: number, fov: number, sheet: string, column: number, row: number, aim: readonly [number, number] = [0, 0]) => {
  const angle = (azimuthDeg * Math.PI) / 180;
  const target = new Vector3(x + aim[0], targetY, z + aim[1]);
  shots.push({ sheet, column, row, target, fov, camera: new Vector3(target.x + Math.sin(angle) * distance, targetY + lift, target.z + Math.cos(angle) * distance) });
};

for (const [name, spec] of Object.entries(HEADS)) {
  const slug = name.replace(" ", "-");
  HAIR_STYLES.forEach((hair, column) => {
    const { x, z, at, height } = place({ ...spec, hair }, "stand");
    Object.values(VIEWS).forEach((azimuth, row) => {
      orbit(x, z, at[1] + height * 0.3, azimuth, 1.5, 0.05, 26, `close-${slug}`, column, row);
      orbit(x, z, at[1] - 0.25, azimuth, 15, 0.3, 6, `at-15m-${slug}`, column, row);
    });
  });
}

HATS.forEach((hat, hatRow) => {
  HAIR_STYLES.forEach((hair, column) => {
    const { x, z, at, height } = place({ ...HEADS["narrow woman"], hair, hat }, "stand");
    [40, 110, 180].forEach((azimuth, view) => orbit(x, z, at[1] + height * 0.3, azimuth, 1.5, 0.05, 26, "hats", column, hatRow * 3 + view));
  });
});

POSE_STYLES.forEach((hair, styleRow) => {
  POSES.forEach((pose, column) => {
    const { x, z, at } = place({ ...HEADS["narrow woman"], hair }, pose);
    [40, 200].forEach((azimuth, view) => orbit(x, z, at[1], azimuth, 2.2, 0.25, 30, "poses", column, styleRow * 2 + view, [at[0], at[2]]));
  });
});

HAIR_STYLES.forEach((hair, column) => {
  const { x, z, at } = place({ ...HEADS["narrow woman"], hair }, "stand");
  [33, 37, 46].forEach((distance, row) => orbit(x, z, at[1] - 0.3, 40, distance, 0.3, (2.2 / distance) * 57, "swap", column, row * 2));
  [33, 37, 46].forEach((distance, row) => orbit(x, z, at[1] - 0.3, 200, distance, 0.3, (2.2 / distance) * 57, "swap", column, row * 2 + 1));
});

scene.add(...crowdMeshes(bakeCrowd(figures), peopleMaterials(inputs)));

function renderSheet(sheet: string): string {
  const cells = shots.filter((shot) => shot.sheet === sheet);
  const columns = Math.max(...cells.map(({ column }) => column)) + 1;
  const rows = Math.max(...cells.map(({ row }) => row)) + 1;
  const page = document.createElement("canvas");
  page.width = columns * CELL;
  page.height = rows * CELL;
  const context = page.getContext("2d");
  if (context === null) throw new Error("no 2d canvas");
  for (const shot of cells) {
    camera.fov = shot.fov;
    camera.updateProjectionMatrix();
    camera.position.copy(shot.camera);
    camera.lookAt(shot.target);
    renderer.render(scene, camera);
    context.drawImage(renderer.domElement, shot.column * CELL, shot.row * CELL);
  }
  return page.toDataURL("image/png");
}

declare global {
  interface Window {
    __hairGrid: { sheets: string[]; render: (sheet: string) => string; columns: string[]; ready: boolean };
  }
}

window.__hairGrid = { sheets: [...new Set(shots.map(({ sheet }) => sheet))], render: renderSheet, columns: [...HAIR_STYLES], ready: true };
