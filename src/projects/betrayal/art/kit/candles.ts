import * as THREE from "three";
import type { PaletteKey } from "../palette";
import { lightAnchor } from "../light-anchor";
import { cylinder, flat, glow, group } from "../shapes";

export interface CandleOptions {
  /** Wax height in metres. */
  height?: number;
  wax?: PaletteKey;
  /** Gives the candle a real light; without one its flame still glows. */
  light?: boolean;
  intensity?: number;
}

/** A piece holding a light would throw its own silhouette across the room. */
function noShadows(object: THREE.Object3D) {
  object.traverse((child) => {
    child.userData.noShadow = true;
  });
}

function flame(y: number): THREE.Mesh {
  const geometry = new THREE.OctahedronGeometry(0.022, 0);
  geometry.scale(1, 2.2, 1);
  geometry.translate(0, y + 0.045, 0);
  return new THREE.Mesh(geometry, glow("flame"));
}

/** A single taper. Its base is at y = 0. */
export function candle({
  height = 0.2,
  wax = "bone",
  light = true,
  intensity = 2.5,
}: CandleOptions = {}): THREE.Group {
  const result = group(
    cylinder(0.028, height, flat(wax), [0, 0, 0], { sides: 6 }),
    cylinder(0.004, 0.02, flat("soot"), [0, height, 0], { sides: 3 }),
    flame(height),
  );
  noShadows(result);
  if (light) {
    result.add(lightAnchor({ colour: "amber", intensity, range: 5, flicker: 0.15 }, [0, height + 0.08, 0]));
  }
  return result;
}

export interface CandelabraOptions {
  arms?: 3 | 5;
  metal?: PaletteKey;
  intensity?: number;
}

/** A standing candelabra for a table or mantel, about half a metre tall,
 *  with one light for all its candles. */
export function candelabra({
  arms = 3,
  metal = "brass",
  intensity = 5,
}: CandelabraOptions = {}): THREE.Group {
  const material = flat(metal);
  const result = group(
    cylinder(0.11, 0.03, material, [0, 0, 0], { top: 0.07, sides: 8 }),
    cylinder(0.025, 0.3, material, [0, 0.03, 0], { top: 0.018, sides: 6 }),
  );
  const armY = 0.3;
  const spread = arms === 5 ? [-0.24, -0.12, 0, 0.12, 0.24] : [-0.18, 0, 0.18];
  for (const x of spread) {
    const rise = Math.abs(x) < 0.01 ? 0.08 : 0.04;
    result.add(
      cylinder(0.035, 0.02, material, [x, armY + rise, 0], { top: 0.045, sides: 6 }),
      cylinder(0.008, rise, material, [x, armY, 0], { sides: 4 }),
    );
    const taper = candle({ height: 0.14, light: false });
    taper.position.set(x, armY + rise + 0.02, 0);
    result.add(taper);
  }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(spread[spread.length - 1] * 2, 0.015, 0.015), material);
  bar.position.y = armY;
  result.add(bar);
  noShadows(result);
  result.add(lightAnchor({ colour: "amber", intensity, range: 7, flicker: 0.12 }, [0, armY + 0.25, 0]));
  return result;
}
