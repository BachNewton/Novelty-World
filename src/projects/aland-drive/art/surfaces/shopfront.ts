import { abs, float, floor, fract, max, min, mix, select, sin, smoothstep, texture, vec2 } from "three/tsl";
import type { Node } from "three/webgpu";
import { WORD_COLUMNS, WORD_ROWS, type SignSheet } from "./signs";

/*
 * A shop on a town facade's ground floor, in the same terms as the wall shader
 * (`render/buildings.ts`): boxes laid out from the facade's real width, no
 * texture but the name on the sign, fading out by the size of a pixel.
 */

const SHOP_TOP_M = 3.1;
const SIGN_M = 0.62;
const RISER_M = 0.48;
const PANE_M = 2.5;
const PIER_M = 0.12;
const END_M = 0.5;
const DOOR_HALF_M = 0.56;
const NARROWEST_M = 7;
const LOWEST_EAVES_M = 4.8;
const WORD_WIDE_M = 3.6;
const WORD_TALL_M = 0.52;
const AWNING_M = 0.6;
const STRIPE_M = 0.42;
const GONE = [0.16, 0.45] as const;
const SHOP_SHARE = 0.72;

export interface ShopInput {
  along: Node<"float">;
  up: Node<"float">;
  width: Node<"float">;
  eaves: Node<"float">;
  /** From the facade's door to here, along it. */
  fromDoor: Node<"float">;
  /** 1 on a plastered street facade: the only walls that can be shops. */
  candidate: Node<"float">;
  /** The size of a pixel on the wall, metres. */
  pixel: Node<"float">;
  /** The wall as it would otherwise be drawn. */
  wall: Node<"vec3">;
  colour: (name: string) => Node<"vec3">;
  sky: Node<"vec3">;
  sheet: SignSheet;
}

const hash = (value: Node<"float">) => fract(sin(value.mul(91.345)).mul(47453.5453));

export function shopfront({ along, up, width, eaves, fromDoor, candidate, pixel, wall, colour, sky, sheet }: ShopInput): Node<"vec3"> {
  const roll = hash(width.mul(3.1).add(eaves.mul(7.7)));
  const roll2 = hash(roll.add(1.3));
  const soft = pixel.mul(0.5).max(0.002);
  const below = (value: Node<"float">, edge: Node<"float"> | number) => float(1).sub(smoothstep(soft.negate(), soft, value.sub(edge)));
  const box = (x: Node<"float">, halfX: Node<"float"> | number, y: Node<"float">, halfY: Node<"float"> | number) => below(abs(x), halfX).mul(below(abs(y), halfY));

  const panes = max(float(1), floor(width.div(PANE_M)));
  const pane = width.div(panes);
  const inPane = fract(along.div(pane)).sub(0.5).mul(pane);
  const signBottom = float(SHOP_TOP_M - SIGN_M);

  const withinEnds = below(abs(along.sub(width.mul(0.5))), width.mul(0.5).sub(END_M));
  const inShop = below(up, SHOP_TOP_M).mul(withinEnds);
  const chosen = candidate.mul(select(width.greaterThan(NARROWEST_M).and(eaves.greaterThan(LOWEST_EAVES_M)).and(roll.lessThan(SHOP_SHARE)), float(1), float(0)));

  // Behind the glass: a warm room going dark at the back, its lights in a row, shelves below them.
  const height = up.div(signBottom);
  const shelves = smoothstep(float(0.6), float(0.7), fract(up.div(0.42))).mul(below(up, signBottom.sub(0.5)));
  const room = mix(colour("shop-interior"), colour("shop-interior").mul(0.55), shelves.mul(0.7));
  const lamp = box(fract(along.div(1.3)).sub(0.5), 0.2, up.sub(signBottom.sub(0.2)), 0.05);
  const interior = mix(room.mul(mix(float(0.5), float(0.95), height)), colour("shop-lit"), lamp);
  // The glass shows the sky above and the street's dark below, broken by a slanting sheen.
  const sheen = smoothstep(float(0.72), float(0.8), fract(along.add(up.mul(0.7)).div(3.3))).mul(float(1).sub(smoothstep(float(0.9), float(0.98), fract(along.add(up.mul(0.7)).div(3.3)))));
  const glass = mix(interior, mix(colour("wall-glass"), sky, height.clamp(0, 1)), float(0.24).add(sheen.mul(0.22)));

  const door = below(abs(fromDoor), DOOR_HALF_M);
  const glazed = max(door.mul(below(up, signBottom.sub(0.05))), below(abs(inPane), pane.mul(0.5).sub(PIER_M)).mul(smoothstep(float(RISER_M).sub(soft), float(RISER_M).add(soft), up)).mul(below(up, signBottom.sub(0.05))));
  const doorBar = box(fromDoor.sub(0.42), 0.03, up.sub(1.05), 0.32).mul(door);
  const doorEdge = door.mul(smoothstep(float(DOOR_HALF_M - 0.09), float(DOOR_HALF_M - 0.05), abs(fromDoor)));

  // A pier is the sign's own colour, so a shop reads as one painted front.
  const fasciaChoice = fract(roll2.mul(4));
  const fasciaOf = (value: Node<"float">) => select(value.lessThan(0.25), colour("shop-fascia-a"), select(value.lessThan(0.5), colour("shop-fascia-b"), select(value.lessThan(0.75), colour("shop-fascia-c"), colour("shop-fascia-d"))));
  const fascia = fasciaOf(fasciaChoice);
  const inkIsDark = select(fasciaChoice.greaterThan(0.75), float(1), float(0));
  const front = mix(fascia, colour("shop-riser"), below(up, RISER_M));

  const wordIndex = floor(hash(roll2.add(2.1)).mul(WORD_COLUMNS * WORD_ROWS));
  const wordColumn = wordIndex.mod(float(WORD_COLUMNS));
  const wordRow = floor(wordIndex.div(WORD_COLUMNS));
  const wordX = along.sub(width.mul(0.5)).div(WORD_WIDE_M).add(0.5);
  const wordY = float(SHOP_TOP_M - SIGN_M / 2).sub(up).div(WORD_TALL_M).add(0.5);
  const wordUv = vec2(wordX.add(wordColumn).mul(sheet.words.width).add(sheet.words.u), wordY.add(wordRow).mul(sheet.words.height).add(sheet.words.v));
  const inWord = box(wordX.sub(0.5), 0.47, wordY.sub(0.5), 0.47);
  const letter = smoothstep(float(0.25), float(0.7), texture(sheet.texture, wordUv).r).mul(inWord);
  const signInk = mix(colour("sign-white"), colour("sign-black"), inkIsDark);
  const signed = mix(front, signInk, letter.mul(smoothstep(float(signBottom), float(signBottom).add(0.02), up)));

  const awningOn = select(roll2.greaterThan(0.55), float(1), float(0));
  const awningY = signBottom.sub(up);
  const inAwning = smoothstep(float(0), float(0.01), awningY).mul(below(awningY, AWNING_M)).mul(awningOn).mul(glazed);
  const stripes = smoothstep(float(0.48), float(0.52), fract(along.div(STRIPE_M * 2)));
  const canvas = mix(colour("shop-awning"), colour("sign-white"), stripes).mul(mix(float(1), float(0.82), awningY.div(AWNING_M).clamp(0, 1)));
  const awningShade = below(awningY.sub(AWNING_M), 0.5).mul(smoothstep(float(0), float(0.01), awningY)).mul(awningOn).mul(0.35);

  const filled = mix(mix(signed, glass.mul(float(1).sub(awningShade)), glazed), canvas, inAwning);
  const withDoor = mix(mix(filled, fascia, doorEdge), colour("wall-trim"), doorBar);
  const shows = float(1).sub(smoothstep(float(GONE[0]), float(GONE[1]), pixel));
  return mix(wall, withDoor, min(inShop, chosen).mul(shows));
}
