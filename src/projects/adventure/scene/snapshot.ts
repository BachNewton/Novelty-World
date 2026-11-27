import * as THREE from "three/webgpu";
import { themeColor } from "@/shared/lib/three/theme-color";

/** A picture's side, in pixels: a WebGPU read copies whole rows of 256 bytes, which a 128-pixel row of four half floats fills exactly. */
const SIZE = 128;

/**
 * Pictures of models, each drawn once on the game's renderer, alone under a
 * sky light and a sun, into an offscreen target of the format the screen is
 * drawn through, and read back as an image the page shows and keeps. Pictures
 * are taken one at a time, since each is read back from the one target.
 */
export class Snapshots {
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly target: THREE.RenderTarget;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly renderer: THREE.WebGPURenderer,
    fov: number,
  ) {
    this.scene.add(new THREE.HemisphereLight(undefined, themeColor("--color-surface-elevated"), 1.6));
    const sun = new THREE.DirectionalLight(undefined, 2.2);
    sun.position.set(1.5, 3, 2);
    this.scene.add(sun);
    this.camera = new THREE.PerspectiveCamera(fov, 1, 0.05, 50);
    this.target = new THREE.RenderTarget(SIZE, SIZE, { type: renderer.getOutputBufferType(), samples: 4 });
  }

  /** A picture of a model, the camera aimed at it once it stands in the picture's scene. */
  take(root: THREE.Object3D, aim: (camera: THREE.PerspectiveCamera) => void): Promise<string> {
    const taken = this.queue.then(() => this.draw(root, aim));
    this.queue = taken.catch(() => undefined);
    return taken;
  }

  private async draw(root: THREE.Object3D, aim: (camera: THREE.PerspectiveCamera) => void): Promise<string> {
    this.scene.add(root);
    root.updateMatrixWorld(true);
    aim(this.camera);
    const clearAlpha = this.renderer.getClearAlpha();
    this.renderer.setClearAlpha(0);
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.setClearAlpha(clearAlpha);
    root.removeFromParent();
    const pixels = await this.renderer.readRenderTargetPixelsAsync(this.target, 0, 0, SIZE, SIZE);
    return imageOf(pixels, "isWebGPUBackend" in this.renderer.backend);
  }

  dispose(): void {
    this.target.dispose();
  }
}

/**
 * A picture read back from its target as an image the page can show: half
 * floats in the renderer's linear working colour space, turned to sRGB bytes,
 * their edges unpremultiplied (a multisampled edge averages a model's colour
 * with the transparent clear). WebGL reads rows bottom up, WebGPU top down.
 */
function imageOf(pixels: ArrayBufferView, topDown: boolean): string {
  if (!(pixels instanceof Uint16Array)) throw new Error("adventure: a picture was read back in a format other than half floats");
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("adventure: no 2D canvas for a picture");
  const image = context.createImageData(SIZE, SIZE);
  for (let y = 0; y < SIZE; y++) {
    const row = topDown ? y : SIZE - 1 - y;
    for (let x = 0; x < SIZE; x++) {
      const from = (row * SIZE + x) * 4;
      const to = (y * SIZE + x) * 4;
      const alpha = THREE.MathUtils.clamp(THREE.DataUtils.fromHalfFloat(pixels[from + 3]), 0, 1);
      for (let c = 0; c < 3; c++) {
        const linear = alpha === 0 ? 0 : THREE.DataUtils.fromHalfFloat(pixels[from + c]) / alpha;
        image.data[to + c] = Math.round(THREE.MathUtils.clamp(toSrgb(linear), 0, 1) * 255);
      }
      image.data[to + 3] = Math.round(alpha * 255);
    }
  }
  context.putImageData(image, 0, 0);
  return canvas.toDataURL();
}

const toSrgb = (linear: number): number => (linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055);
