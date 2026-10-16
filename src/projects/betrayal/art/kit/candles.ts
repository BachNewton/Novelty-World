import * as THREE from "three";
import { paletteHex, type PaletteKey } from "../palette";
import { lightAnchor } from "../light-anchor";
import type { FlickerSignal } from "../room";
import { box, cylinder, flat, glow, group, lightMaterial } from "../shapes";
import { shiny, SHINES, type Shine } from "../shine";
import { flame, type FlameTint } from "./flame";
import { solidLathe, type Profile } from "./vessel";

export interface CandleOptions {
  /** Wax height in metres. */
  height?: number;
  wax?: PaletteKey;
  /** Gives the candle a real light; without one its flame burns with the nearest flickering light in its room. */
  light?: boolean;
  intensity?: number;
  /** Metres its light reaches. */
  range?: number;
  /** How far above the wick its light sits: lifted off a surface it would
   *  otherwise blow out. */
  lift?: number;
  /** The flicker signal its flame and light waver with; unnamed, the room picks one (or, without a light, its
   *  flame takes the light it burns beside). */
  signal?: Exclude<FlickerSignal, "water">;
  /** Burns a colour with a meaning instead of warm amber; its light, if it has one, should match. */
  tint?: FlameTint;
}

/** A piece holding a light would throw its own silhouette across the room. */
function noShadows(object: THREE.Object3D) {
  object.traverse((child) => {
    child.userData.noShadow = true;
  });
}

/** The shared candle flame, its foot on the wick's top. */
function wickFlame(height: number, signal: CandleOptions["signal"], tint: FlameTint | undefined): THREE.Mesh {
  const result = flame("candle", { signal, tint });
  result.position.y = height + 0.012;
  return result;
}

/** A single taper. Its base is at y = 0. */
export function candle({
  height = 0.2,
  wax = "bone",
  light = true,
  intensity = 2.5,
  range = 5,
  lift = 0.08,
  signal,
  tint,
}: CandleOptions = {}): THREE.Group {
  const result = group(
    cylinder(0.028, height, shiny(flat(wax), SHINES.wax), [0, 0, 0], { sides: 6 }),
    cylinder(0.004, 0.02, flat("soot"), [0, height, 0], { sides: 3 }),
    wickFlame(height, signal, tint),
  );
  noShadows(result);
  if (light) {
    result.add(lightAnchor({ colour: "amber", intensity, range, flicker: 0.15, kind: "candle", signal }, [0, height + lift, 0]));
  }
  return result;
}

export interface CandelabraOptions {
  arms?: 3 | 5;
  metal?: PaletteKey;
  /** How its metal takes the light; brass's by default. */
  shine?: Shine;
  intensity?: number;
}

/** A standing candelabra for a table or mantel, about half a metre tall,
 *  with one light for all its candles. */
export function candelabra({
  arms = 3,
  metal = "brass",
  shine = SHINES.brass,
  intensity = 5,
}: CandelabraOptions = {}): THREE.Group {
  const material = shiny(flat(metal), shine);
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
  result.add(lightAnchor({ colour: "amber", intensity, range: 7, flicker: 0.12, kind: "candelabra" }, [0, armY + 0.25, 0]));
  return result;
}

/** A brass chamberstick, a dish with a socket and a thumb grip, holding a
 *  candle burnt down to `height`. Its light is the candle's. */
export function chamberstick(candleOptions: CandleOptions = {}): THREE.Group {
  const brass = shiny(flat("brass"), SHINES.brass);
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
  const iron = shiny(flat("soot"), SHINES.iron);
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

export interface OilLampOptions {
  /** The foot, font and burner's metal. */
  metal?: PaletteKey;
  /** How its metal takes the light; brass's by default. */
  shine?: Shine;
  intensity?: number;
  range?: number;
  flicker?: number;
  signal?: Exclude<FlickerSignal, "water">;
}

/** The oil lamp's turned brass: a stepped foot, a short stem and the round font of oil, up to the burner. */
const OIL_LAMP_BODY: Profile = [[0.075, 0], [0.075, 0.012], [0.05, 0.024], [0.02, 0.04], [0.017, 0.07], [0.042, 0.082], [0.074, 0.108], [0.08, 0.132], [0.066, 0.162], [0.03, 0.18]];
/** Where the chimney stands in its gallery, and its clear glass: a bulb round the flame, then a tall narrow neck. */
const CHIMNEY_FOOT = 0.212;
const CHIMNEY: Profile = [[0.036, 0], [0.04, 0.018], [0.054, 0.055], [0.054, 0.095], [0.032, 0.14], [0.025, 0.17], [0.025, 0.27]];

/**
 * The oil lamp's chimney: clear glass, open at both ends, taking the room's
 * lamps as glass does. It is lit from inside, warm round the flame and fading
 * up the neck, so it shows as glass against the dark.
 */
function chimney(): THREE.Mesh {
  const geometry = new THREE.LatheGeometry(CHIMNEY.map(([r, y]) => new THREE.Vector2(r, y)), 12);
  const [warm, cold] = [new THREE.Color(paletteHex("amber")), new THREE.Color(paletteHex("moonLight"))];
  const top = CHIMNEY[CHIMNEY.length - 1][1];
  const position = geometry.getAttribute("position");
  const colours = new Float32Array(position.count * 3);
  const colour = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const up = position.getY(i) / top;
    colour.copy(cold).lerp(warm, Math.max(0, 1 - Math.abs(up - 0.25) / 0.45)).multiplyScalar(1 - 0.5 * up);
    colours.set([colour.r, colour.g, colour.b], i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  const glass = new THREE.Mesh(geometry, shiny(lightMaterial(0.2, { vertexColors: true }), SHINES.glass));
  glass.position.y = CHIMNEY_FOOT;
  return glass;
}

/**
 * A table oil lamp: a turned brass foot and font, a burner with its gallery,
 * the shared oil-lamp flame, and round it a tall clear glass chimney, the
 * flame seen burning inside. One light, just over the chimney's mouth: any
 * lower, it burns the brass white. About half a metre
 * tall, base at y = 0.
 */
export function oilLamp({ metal = "brass", shine = SHINES.brass, intensity = 3.5, range = 6, flicker = 0.08, signal }: OilLampOptions = {}): THREE.Group {
  const material = shiny(flat(metal), shine);
  const burning = flame("oilLamp", { signal });
  burning.position.y = 0.22;
  // The wick's thumbwheel, on the burner's side, its axle along x.
  const wheel = cylinder(0.014, 0.008, material, [0, 0, 0], { sides: 8 });
  wheel.rotation.z = -Math.PI / 2;
  wheel.position.set(0.024, 0.19, 0);
  const result = group(
    solidLathe(OIL_LAMP_BODY, material, 12),
    cylinder(0.026, 0.03, material, [0, 0.176, 0], { sides: 10 }),
    cylinder(0.042, 0.02, material, [0, 0.198, 0], { top: 0.039, sides: 12 }),
    wheel,
    cylinder(0.008, 0.016, flat("soot"), [0, 0.206, 0], { sides: 4 }),
    burning,
    chimney(),
  );
  noShadows(result);
  result.add(lightAnchor({ colour: "amber", intensity, range, flicker, kind: "lamp", signal }, [0, 0.5, 0]));
  return result;
}
