import * as THREE from "three/webgpu";
import { themeColor } from "@/shared/lib/three/theme-color";

/** A label's height in world units, unless asked otherwise; its width follows its text. */
const LABEL_HEIGHT = 0.22;
/** Canvas pixels per world unit of label, so the text stays sharp up close. */
const LABEL_PIXELS = 256;

/** A name on a plate that always faces the camera, `height` world units tall, its width following its text. */
export function nameLabel(text: string, height = LABEL_HEIGHT): THREE.Sprite {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("adventure: no 2D canvas for a label");
  const font = `${LABEL_PIXELS * 0.7}px system-ui, sans-serif`;
  context.font = font;
  canvas.width = Math.ceil(context.measureText(text).width + LABEL_PIXELS * 0.4);
  canvas.height = LABEL_PIXELS;
  context.fillStyle = themeColor("--color-surface-primary").getStyle();
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.font = font;
  context.fillStyle = themeColor("--color-text-primary").getStyle();
  context.textBaseline = "middle";
  context.fillText(text, LABEL_PIXELS * 0.2, LABEL_PIXELS / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture }));
  label.scale.set((height * canvas.width) / canvas.height, height, 1);
  return label;
}
