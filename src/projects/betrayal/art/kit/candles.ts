import * as THREE from "three";
import type { PaletteKey } from "../palette";
import { lightAnchor } from "../light-anchor";
import { box, cylinder, flat, glow, group } from "../shapes";

export interface CandleOptions {
  /** Wax height in metres. */
  height?: number;
  wax?: PaletteKey;
  /** Gives the candle a real light; without one its flame still glows. */
  light?: boolean;
  intensity?: number;
  /** Metres its light reaches. */
  range?: number;
  /** How far above the wick its light sits: lifted off a surface it would
   *  otherwise blow out. */
  lift?: number;
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
  range = 5,
  lift = 0.08,
}: CandleOptions = {}): THREE.Group {
  const result = group(
    cylinder(0.028, height, flat(wax), [0, 0, 0], { sides: 6 }),
    cylinder(0.004, 0.02, flat("soot"), [0, height, 0], { sides: 3 }),
    flame(height),
  );
  noShadows(result);
  if (light) {
    result.add(lightAnchor({ colour: "amber", intensity, range, flicker: 0.15 }, [0, height + lift, 0]));
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

/** A brass chamberstick, a dish with a socket and a thumb grip, holding a
 *  candle burnt down to `height`. Its light is the candle's. */
export function chamberstick(candleOptions: CandleOptions = {}): THREE.Group {
  const brass = flat("brass");
  const dish = group(
    cylinder(0.09, 0.02, brass, [0, 0, 0], { top: 0.08, sides: 8 }),
    cylinder(0.03, 0.04, brass, [0, 0.02, 0], { sides: 6 }),
    box([0.1, 0.012, 0.02], brass, [0.11, 0.012, 0]),
  );
  noShadows(dish);
  const taper = candle({ height: 0.12, ...candleOptions });
  taper.position.y = 0.06;
  return group(dish, taper);
}

export interface LanternOptions {
  /** The glass's width and height in metres. */
  width?: number;
  height?: number;
  intensity?: number;
  range?: number;
  flicker?: number;
}

/** An iron lantern hung from its hook (the origin): a hood, a cage of four
 *  corner posts round glowing amber glass, a flame inside, and one light. */
export function lantern({ width = 0.1, height = 0.17, intensity = 5, range = 8, flicker = 0.15 }: LanternOptions = {}): THREE.Group {
  const iron = flat("soot");
  const frame = width + 0.06;
  const bottom = -0.05 - height;
  const result = group(
    box([frame, 0.02, frame], iron, [0, -0.04, 0]),
    cylinder(frame * 0.62, 0.06, iron, [0, -0.02, 0], { top: 0.02, sides: 4 }),
    box([frame - 0.02, 0.02, frame - 0.02], iron, [0, bottom - 0.02, 0]),
    box([width, height, width], glow("amber"), [0, bottom, 0]),
    box([width * 0.4, height * 0.53, width * 0.4], glow("flame"), [0, bottom + 0.02, 0]),
  );
  const post = width / 2 + 0.015;
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) result.add(box([0.018, height + 0.03, 0.018], iron, [x * post, bottom - 0.02, z * post]));
  noShadows(result);
  result.add(lightAnchor({ colour: "amber", intensity, range, flicker }, [0, bottom + height * 0.41, 0.05]));
  return result;
}
