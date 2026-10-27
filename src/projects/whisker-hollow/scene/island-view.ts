import * as THREE from "three/webgpu";
import { themeColor } from "@/shared/lib/three/theme-color";
import { ISLAND, LEVEL, areaAt, type Area, type Home } from "../level";
import { polyInstance, type Models } from "./assets";

/** The island drawn: its ground and the sea, its junk, and the homes with their pictures. */

const GROUND_TOKEN: Record<Area, string> = {
  beach: "--color-wh-sand",
  yard: "--color-wh-grass",
  castle: "--color-wh-flagstone",
};
const CUSHIONS = ["rose", "sky", "lilac", "blush", "sage", "butter"] as const;
/** The sea's surface, a little below the beach. */
const SEA_LEVEL = -0.25;

export const FRAME = { width: 0.9, height: 0.66, centre: 1.25, back: 0.65 } as const;

export interface HomeView {
  home: Home;
  /** Where the pair's two animals sit, on the cushion. */
  seats: readonly [THREE.Vector3, THREE.Vector3];
  /** The pair's picture, which `portraits.ts` paints once the renderer is ready. */
  portrait: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  /** Where a name tag hangs, over the frame. */
  tagAt: THREE.Vector3;
}

function standard(token: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: themeColor(token), roughness: 0.95 });
}

/**
 * The ground: one sheet coloured by the area each vertex lies in, sloping
 * down into the sea past the island's edge.
 */
function ground(): THREE.Mesh {
  const width = ISLAND.rx * 2 + 60;
  const depth = ISLAND.rz * 2 + 60;
  const geometry = new THREE.PlaneGeometry(width, depth, 190, 164);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute("position");
  const colours = new Float32Array(positions.count * 3);
  const colourOf = Object.fromEntries((Object.keys(GROUND_TOKEN) as Area[]).map((a) => [a, themeColor(GROUND_TOKEN[a])])) as Record<Area, THREE.Color>;
  for (let i = 0; i < positions.count; i++) {
    const p = { x: positions.getX(i), z: positions.getZ(i) };
    const out = Math.hypot(p.x / ISLAND.rx, p.z / ISLAND.rz);
    positions.setY(i, out > 1 ? -Math.min(3, (out - 1) * 30) : 0);
    colourOf[out > 0.97 ? "beach" : areaAt(p)].toArray(colours, i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  mesh.receiveShadow = true;
  return mesh;
}

function sea(): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(1200, 1200);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshStandardMaterial({ color: themeColor("--color-wh-sea"), roughness: 0.35 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = SEA_LEVEL;
  return mesh;
}

/** Every home's basket, cushion, post and frame, drawn as a few instanced meshes. */
function homes(): { object: THREE.Group; views: HomeView[] } {
  const object = new THREE.Group();
  const count = LEVEL.homes.length;
  const basket = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.62, 0.52, 0.24, 18), standard("--color-wh-basket"), count);
  const cushion = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.54, 0.54, 0.1, 18), new THREE.MeshStandardMaterial({ roughness: 1 }), count);
  const post = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, FRAME.centre, 0.06), standard("--color-wh-frame"), count);
  const frame = new THREE.InstancedMesh(new THREE.BoxGeometry(FRAME.width + 0.08, FRAME.height + 0.08, 0.05), standard("--color-wh-frame"), count);
  // A render target's texture reads upside down on a plane's own coordinates, so the picture's are turned over.
  const portraitGeometry = new THREE.PlaneGeometry(FRAME.width, FRAME.height);
  const uv = portraitGeometry.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  const views: HomeView[] = [];
  const matrix = new THREE.Matrix4();
  const turn = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  LEVEL.homes.forEach((home, i) => {
    turn.setFromAxisAngle(up, home.turn);
    const at = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyQuaternion(turn).add(new THREE.Vector3(home.x, 0, home.z));
    const one = new THREE.Vector3(1, 1, 1);
    basket.setMatrixAt(i, matrix.compose(at(0, 0.12, 0), turn, one));
    cushion.setMatrixAt(i, matrix.compose(at(0, 0.27, 0), turn, one));
    cushion.setColorAt(i, themeColor(`--color-wh-cushion-${CUSHIONS[i % CUSHIONS.length]}`));
    // The post stands behind the frame, and the picture well in front of the frame's face, so no two faces share a depth.
    post.setMatrixAt(i, matrix.compose(at(0, FRAME.centre / 2, -FRAME.back - 0.06), turn, one));
    frame.setMatrixAt(i, matrix.compose(at(0, FRAME.centre, -FRAME.back), turn, one));
    const portrait = new THREE.Mesh(portraitGeometry, new THREE.MeshBasicMaterial({ color: themeColor("--color-wh-portrait") }));
    portrait.position.copy(at(0, FRAME.centre, -FRAME.back + 0.04));
    portrait.quaternion.copy(turn);
    object.add(portrait);
    views.push({ home, seats: [at(-0.24, 0.32, 0), at(0.24, 0.32, 0)], portrait, tagAt: at(0, FRAME.centre + FRAME.height / 2 + 0.2, -FRAME.back) });
  });
  for (const mesh of [basket, cushion, post, frame]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    object.add(mesh);
  }
  return { object, views };
}

export function buildIsland(models: Models): { object: THREE.Group; homes: Map<string, HomeView> } {
  const object = new THREE.Group();
  object.add(ground(), sea());
  for (const prop of LEVEL.props) {
    // Small clutter casts no shadow: hundreds of tiny casters cost more than they show.
    const instance = polyInstance(models, prop.model, prop.height, prop.height > 0.5);
    instance.position.set(prop.x, 0, prop.z);
    instance.rotation.y = prop.turn;
    instance.matrixAutoUpdate = false;
    instance.updateMatrix();
    object.add(instance);
  }
  const built = homes();
  object.add(built.object);
  return { object, homes: new Map(built.views.map((v) => [v.home.species, v])) };
}
