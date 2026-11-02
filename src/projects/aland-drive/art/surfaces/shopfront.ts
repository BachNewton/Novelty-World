import { abs, float, floor, fract, max, min, mix, select, sin, smoothstep, texture, vec2 } from "three/tsl";
import type { Node } from "three/webgpu";
import { band, pulses } from "./coverage";
import { WORD_COLUMNS, WORD_ROWS, type SignSheet } from "./signs";

/*
 * A shop on a town facade's ground floor, in the same terms as the wall shader
 * (`render/buildings.ts`): boxes laid out from the facade's real width, no
 * texture but the name on the sign. Its blocks are their share of the pixel, so
 * far off the shop blurs into its average and never fades out; only details too
 * fine to draw fade, each to its own average.
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
/** What the fine details blur into: the shelves' and sheen's average, and how much of a sign the letters ink. */
const SHELF_SHARE = 0.35;
const SHEEN_SHARE = 0.12;
const INK_SHARE = 0.22;

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
  const shows = float(1).sub(smoothstep(float(GONE[0]), float(GONE[1]), pixel));
  const below = (value: Node<"float">, edge: Node<"float"> | number) => band(value, -1000, edge, pixel);
  const between = (value: Node<"float">, from: Node<"float"> | number, to: Node<"float"> | number) => band(value, from, to, pixel);
  const box = (x: Node<"float">, halfX: Node<"float"> | number, y: Node<"float">, halfY: Node<"float"> | number) => below(abs(x), halfX).mul(below(abs(y), halfY));

  const panes = max(float(1), floor(width.div(PANE_M)));
  const pane = width.div(panes);
  const signBottom = float(SHOP_TOP_M - SIGN_M);

  const withinEnds = between(along, END_M, width.sub(END_M));
  const inShop = below(up, SHOP_TOP_M).mul(withinEnds);
  const chosen = candidate.mul(select(width.greaterThan(NARROWEST_M).and(eaves.greaterThan(LOWEST_EAVES_M)).and(roll.lessThan(SHOP_SHARE)), float(1), float(0)));

  // Behind the glass: a warm room going dark at the back, its lights in a row, shelves below them.
  const height = up.div(signBottom);
  const shelves = mix(float(SHELF_SHARE), smoothstep(float(0.6), float(0.7), fract(up.div(0.42))), shows).mul(below(up, signBottom.sub(0.5)));
  const room = mix(colour("shop-interior"), colour("shop-interior").mul(0.55), shelves.mul(0.7));
  const lamp = box(fract(along.div(1.3)).sub(0.5).mul(1.3), 0.26, up.sub(signBottom.sub(0.2)), 0.05);
  const interior = mix(room.mul(mix(float(0.5), float(0.95), height)), colour("shop-lit"), lamp);
  // The glass shows the sky above and the street's dark below, broken by a slanting sheen.
  const slant = fract(along.add(up.mul(0.7)).div(3.3));
  const sheen = mix(float(SHEEN_SHARE), smoothstep(float(0.72), float(0.8), slant).mul(float(1).sub(smoothstep(float(0.9), float(0.98), slant))), shows);
  const glass = mix(interior, mix(colour("wall-glass"), sky, height.clamp(0, 1)), float(0.24).add(sheen.mul(0.22)));

  const door = between(fromDoor, -DOOR_HALF_M, DOOR_HALF_M);
  const glassBand = between(up, RISER_M, signBottom.sub(0.05));
  const glazed = max(door.mul(below(up, signBottom.sub(0.05))), float(1).sub(pulses(along, pane, PIER_M, pixel)).mul(glassBand));
  const doorBar = box(fromDoor.sub(0.42), 0.03, up.sub(1.05), 0.32).mul(door);
  const doorEdge = door.mul(smoothstep(float(DOOR_HALF_M - 0.09), float(DOOR_HALF_M - 0.05), abs(fromDoor))).mul(shows);

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
  const inWord = box(along.sub(width.mul(0.5)), WORD_WIDE_M * 0.47, float(SHOP_TOP_M - SIGN_M / 2).sub(up), WORD_TALL_M * 0.47);
  const letter = mix(float(INK_SHARE), smoothstep(float(0.25), float(0.7), texture(sheet.texture, wordUv).r), shows).mul(inWord);
  const signInk = mix(colour("sign-white"), colour("sign-black"), inkIsDark);
  const signed = mix(front, signInk, letter.mul(between(up, signBottom, 100)));

  const awningOn = select(roll2.greaterThan(0.55), float(1), float(0));
  const awningY = signBottom.sub(up);
  const inAwning = between(awningY, 0, AWNING_M).mul(awningOn).mul(glazed);
  const stripes = mix(float(0.5), smoothstep(float(0.48), float(0.52), fract(along.div(STRIPE_M * 2))), shows);
  const canvas = mix(colour("shop-awning"), colour("sign-white"), stripes).mul(mix(float(1), float(0.82), awningY.div(AWNING_M).clamp(0, 1)));
  const awningShade = between(awningY, 0, AWNING_M + 0.5).mul(awningOn).mul(0.35);

  const filled = mix(mix(signed, glass.mul(float(1).sub(awningShade)), glazed), canvas, inAwning);
  const withDoor = mix(mix(filled, fascia, doorEdge), colour("wall-trim"), doorBar);
  return mix(wall, withDoor, min(inShop, chosen));
}
