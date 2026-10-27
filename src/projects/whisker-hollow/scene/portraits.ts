import * as THREE from "three/webgpu";
import { themeColor } from "@/shared/lib/three/theme-color";
import { speciesOrThrow } from "../cast";
import { polyInstance, type Models } from "./assets";
import { FRAME, type HomeView } from "./island-view";

/**
 * Each home's picture: the pair's two animals side by side, rendered once
 * into a small texture when the island is built. The picture is how players
 * know whom to look for, so both animals are drawn as they look in the world,
 * turned a little to show their shape.
 */

const PIXELS = 256;
const SIDE = 0.55;

export function paintPortraits(renderer: THREE.WebGPURenderer, models: Models, homes: Iterable<HomeView>): void {
  const scene = new THREE.Scene();
  scene.background = themeColor("--color-wh-portrait");
  scene.add(new THREE.HemisphereLight(0xffffff, themeColor("--color-wh-sand"), 2.2));
  const key = new THREE.DirectionalLight(themeColor("--color-wh-sun"), 1.6);
  key.position.set(1, 2, 3);
  scene.add(key);
  const aspect = FRAME.width / FRAME.height;
  const halfWidth = 1.15;
  const camera = new THREE.OrthographicCamera(-halfWidth, halfWidth, halfWidth / aspect, -halfWidth / aspect, 0.1, 20);
  camera.position.set(0, 1.4, 5);
  camera.lookAt(0, 0.45, 0);
  for (const view of homes) {
    const pair = speciesOrThrow(view.home.species);
    const sitters = pair.models.map((id, i) => {
      // Each model is 1 tall; one long or wide is shrunk to fit its half of the picture.
      const sitter = polyInstance(models, id, 1, false);
      const size = new THREE.Box3().setFromObject(sitter).getSize(new THREE.Vector3());
      sitter.scale.setScalar(Math.min(1.3, 1.05 / Math.max(size.x, size.z)));
      sitter.position.set(i === 0 ? -SIDE : SIDE, 0, 0);
      sitter.rotation.y = i === 0 ? 0.55 : -0.55;
      scene.add(sitter);
      return sitter;
    });
    const target = new THREE.RenderTarget(PIXELS, Math.round(PIXELS / aspect));
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    for (const sitter of sitters) sitter.removeFromParent();
    view.portrait.material.map = target.texture;
    view.portrait.material.color.set(0xffffff);
    view.portrait.material.needsUpdate = true;
  }
  renderer.setRenderTarget(null);
}
