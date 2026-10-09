import * as THREE from "three";
import { paletteHex, type PaletteKey } from "../palette";
import { box, glow, group, lightMaterial } from "../shapes";

export interface PitBounds {
  /** The pit's extent across x and z, in the frame it is built in. */
  x: [number, number];
  z: [number, number];
}

/**
 * The dark round and under a floor opening, in the background's own colour
 * and unlit: looking down, it is the dark the pit falls into; from outside
 * the room, where the pit would show below the floor slab, it can't be told
 * from the background. Its sides run from just under the floor (`top`) down
 * to its floor at `bottom`.
 */
export function pitShell({ x: [x0, x1], z: [z0, z1], bottom, top = -0.2 }: PitBounds & { bottom: number; top?: number }): THREE.Group {
  const dark = glow("soot");
  dark.side = THREE.DoubleSide;
  // The background is drawn without tone mapping, so the shell must be too to match it exactly.
  dark.toneMapped = false;
  const height = top - bottom;
  const [cx, cz] = [(x0 + x1) / 2, (z0 + z1) / 2];
  const side = (w: number, d: number, x: number, z: number) => box([w, height, d], dark, [x, bottom, z]);
  return group(
    side(x1 - x0, 0.01, cx, z0),
    side(x1 - x0, 0.01, cx, z1),
    side(0.01, z1 - z0, x0, cz),
    side(0.01, z1 - z0, x1, cz),
    box([x1 - x0, 0.01, z1 - z0], dark, [cx, bottom, cz]),
  );
}

export interface HazeOptions extends PitBounds {
  y: number;
  colour: PaletteKey;
  opacity: number;
  /** Brightest down the middle, fading towards its x edges. */
  fade?: boolean;
}

/** A sheet of coloured haze hanging across a pit at `y`, added as light. */
export function pitHaze({ x: [x0, x1], z: [z0, z1], y, colour, opacity, fade = false }: HazeOptions): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(x1 - x0, z1 - z0, 4, 1).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  const centre = (x0 + x1) / 2;
  const half = (x1 - x0) / 2;
  const position = geometry.getAttribute("position");
  const bright = new THREE.Color(paletteHex(colour));
  const colours: number[] = [];
  for (let i = 0; i < position.count; i++) {
    const strength = fade ? 0.25 + 0.75 * (1 - Math.abs(position.getX(i) - centre) / half) : 1;
    colours.push(...bright.clone().multiplyScalar(strength).toArray());
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
  const haze = new THREE.Mesh(geometry, lightMaterial(opacity, { vertexColors: true }));
  haze.userData.noShadow = true;
  return haze;
}
