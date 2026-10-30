import { DirectionalLight, Mesh, MeshStandardNodeMaterial, PerspectiveCamera, PlaneGeometry, Scene, WebGPURenderer } from "three/webgpu";
import { themeColor } from "@/shared/lib/three/theme-color";

/*
 * Åland Drive drawn on WebGPU, with no framework between the game and
 * three.js: one renderer, one scene, one loop. For now the world is a sky
 * and a flat ground, enough to show the page boots and draws.
 */

/** A control surface for tests and tools: everything here waits on events, never time. */
export interface GameProbe {
  /** Frames drawn so far. */
  frames: () => number;
}

export interface Game {
  probe: GameProbe;
  dispose: () => void;
}

const GROUND_SIZE = 4000;
const CAMERA_HEIGHT = 2;
const CAMERA_FIELD_OF_VIEW = 60;
const SUN_INTENSITY = 3;

const token = (name: string) => themeColor(`--color-aland-drive-${name}`);

export async function startGame(container: HTMLElement): Promise<Game> {
  const renderer = new WebGPURenderer({ antialias: true });
  await renderer.init();
  renderer.setClearColor(token("sky"));
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  container.appendChild(renderer.domElement);

  const scene = new Scene();
  const camera = new PerspectiveCamera(CAMERA_FIELD_OF_VIEW, 1, 0.1, GROUND_SIZE);
  camera.position.set(0, CAMERA_HEIGHT, 0);
  camera.lookAt(0, CAMERA_HEIGHT, -1);

  const groundGeometry = new PlaneGeometry(GROUND_SIZE, GROUND_SIZE);
  groundGeometry.rotateX(-Math.PI / 2);
  const groundMaterial = new MeshStandardNodeMaterial({ color: token("ground"), roughness: 1 });
  const sun = new DirectionalLight(token("sun"), SUN_INTENSITY);
  sun.position.set(1, 2, 1);
  scene.add(new Mesh(groundGeometry, groundMaterial), sun);

  const resize = () => {
    const { clientWidth, clientHeight } = container;
    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / Math.max(1, clientHeight);
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  let frames = 0;
  const frame = () => {
    // A page with no room for the canvas (a hidden tab or pane) has nothing to draw into.
    if (container.clientWidth === 0 || container.clientHeight === 0) return;
    renderer.render(scene, camera);
    frames++;
  };
  await renderer.setAnimationLoop(frame);

  return {
    probe: { frames: () => frames },
    dispose() {
      void renderer.setAnimationLoop(null);
      observer.disconnect();
      groundGeometry.dispose();
      groundMaterial.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
