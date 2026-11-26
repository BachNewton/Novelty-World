import * as THREE from "three/webgpu";
import { themeColor } from "@/shared/lib/three/theme-color";
import { isNaturePiece, type KitPiece } from "../kit";
import "./tokens.css";

/**
 * How far the Nature Kit's pieces are lifted: its ground tiles' grass lies at
 * −0.05, and this puts it a hair below y = 0, where the town's pieces and the
 * characters stand, so a town piece's base never fights the grass for depth.
 */
const NATURE_LIFT = 0.04;

/** The Nature Kit's materials, by name, repainted in the town kit's palette; the rest keep the kit's own colours. */
const NATURE_PAINT: ReadonlyMap<string, string> = new Map([
  ["grass", "--color-adventure-grass"],
  ["leafsGreen", "--color-adventure-leaves"],
  ["leafsDark", "--color-adventure-leaves-dark"],
  ["dirt", "--color-adventure-dirt"],
  ["dirtDark", "--color-adventure-dirt-dark"],
]);

const fitted = new WeakSet<THREE.Object3D>();

/**
 * A piece's file, fitted to the world: the kits were made apart, so each
 * piece's height and colours are brought to one ground and one palette. Fits
 * a file's scene once, however often it is asked. The lift goes on the
 * scene's children: placing a piece sets the scene's own position.
 */
export function fitPiece(piece: KitPiece, scene: THREE.Object3D): THREE.Object3D {
  if (fitted.has(scene) || !isNaturePiece(piece)) return scene;
  fitted.add(scene);
  for (const child of scene.children) child.position.y += NATURE_LIFT;
  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
      if (material instanceof THREE.MeshStandardMaterial) paintNature(material);
    }
  });
  return scene;
}

/**
 * The Nature Kit's files mark every material wholly metallic, which with nothing
 * to reflect draws it near black, and write their colours as the screen shows
 * them where glTF means them linear, which washes them out. So each is made
 * matte, and its colour read as it was meant, or repainted in the town's palette.
 */
function paintNature(material: THREE.MeshStandardMaterial): void {
  material.metalness = 0;
  const token = NATURE_PAINT.get(material.name);
  if (token === undefined) material.color.convertSRGBToLinear();
  else material.color.copy(themeColor(token));
}
