import { abs, float, floor, fract, max, min, mix, select, smoothstep, step, texture, vec2 } from "three/tsl";
import type { Node } from "three/webgpu";
import { seedOf, unitOf } from "../hash";
import { band, pulses } from "./coverage";
import { WORD_ASPECT, WORD_COLUMNS, WORD_PIXELS, type SignSheet } from "./signs";

/*
 * A shop on a facade, in the same terms as the wall shader (`render/buildings.ts`):
 * boxes laid out from the facade's real width, no texture but the name on the
 * sign. Where a shop is, and what its sign says, is the pipeline's (`assign.py`),
 * from a real shop in OSM: a ground floor's shop, a big shop's glass front with
 * its name high on the wall, or a whole wall that is a sign, as a fuel station's
 * canopy is. Its blocks are their share of the pixel, so far off the shop blurs
 * into its average and never fades out; only details too fine to draw fade, each
 * to its own average.
 */

const SHOP_TOP_M = 3.1;
const SIGN_M = 0.62;
const BIG_SIGN_M = 1.3;
const RISER_M = 0.48;
const PANE_M = 2.5;
const PIER_M = 0.12;
const END_M = 0.5;
const DOOR_HALF_M = 0.56;
const NARROWEST_M = 3;
const WORD_WIDE_M = 3.6;
const BIG_WORD_WIDE_M = 7.4;
const AWNING_M = 0.6;
const STRIPE_M = 0.42;
const GONE = [0.16, 0.45] as const;
/** What the fine details blur into: the shelves' and sheen's average, and how much of a sign the letters ink. */
const SHELF_SHARE = 0.35;
const SHEEN_SHARE = 0.12;
const INK_SHARE = 0.22;
/** The fronts as the pipeline numbers them (`facade-ids.json`). */
const FRONT = { shop: 1, big: 2, plate: 3 } as const;

export interface ShopInput {
  along: Node<"float">;
  up: Node<"float">;
  width: Node<"float">;
  eaves: Node<"float">;
  /** From the facade's door to here, along it. */
  fromDoor: Node<"float">;
  /** Which front this facade has, 0 for none. */
  front: Node<"float">;
  /** The word on its sign, a cell of the sheet's words. */
  word: Node<"float">;
  /** How far a pixel reaches along the wall and up it, metres. */
  wide: Node<"float">;
  tall: Node<"float">;
  /** -1 where the wall's along runs leftwards on screen, as it does seen from inside, where a word would read backwards. */
  reads: Node<"float">;
  /** The wall as it would otherwise be drawn. */
  wall: Node<"vec3">;
  colour: (name: string) => Node<"vec3">;
  sky: Node<"vec3">;
  sheet: SignSheet;
}


/**
 * Drawn inside the wall shader's branch for its style, so it reads no derivatives of its own: the sign's texture is read
 * at a level worked out from the size of a pixel.
 */
export function shopfront({ along, up, width, eaves, fromDoor, front, word, wide, tall, reads, wall, colour, sky, sheet }: ShopInput): Node<"vec3"> {
  const pixel = wide.add(tall);
  // The wall's width and eaves to the centimetre: a pixel reads them blended across the face, a hair off what's stored.
  const wallSeed = seedOf(width.mul(100).add(0.5), eaves.mul(100).add(0.5));
  const roll2 = unitOf(wallSeed, 2);
  const shows = float(1).sub(smoothstep(float(GONE[0]), float(GONE[1]), pixel));
  const below = (value: Node<"float">, edge: Node<"float"> | number) => band(value, -1000, edge, pixel);
  const between = (value: Node<"float">, from: Node<"float"> | number, to: Node<"float"> | number) => band(value, from, to, pixel);
  const box = (x: Node<"float">, halfX: Node<"float"> | number, y: Node<"float">, halfY: Node<"float"> | number) => below(abs(x), halfX).mul(below(abs(y), halfY));
  const isFront = (kind: number) => select(abs(front.sub(kind)).lessThan(0.5), float(1), float(0));
  const big = isFront(FRONT.big);
  const plate = isFront(FRONT.plate);
  const fromCentre = along.sub(width.mul(0.5));

  const shopTop = min(float(SHOP_TOP_M), eaves.sub(0.2));
  const signBottom = shopTop.sub(SIGN_M);
  const panes = max(float(1), floor(width.div(PANE_M)));
  const pane = width.div(panes);

  const withinEnds = between(along, END_M, width.sub(END_M));
  const inShop = below(up, shopTop).mul(withinEnds);
  const room = select(width.greaterThan(NARROWEST_M), float(1), float(0));

  // Behind the glass: a warm room going dark at the back, its lights in a row, shelves below them.
  const height = up.div(signBottom);
  const shelves = mix(float(SHELF_SHARE), smoothstep(float(0.6), float(0.7), fract(up.div(0.42))), shows).mul(below(up, signBottom.sub(0.5)));
  const interiorShade = mix(colour("shop-interior"), colour("shop-interior").mul(0.55), shelves.mul(0.7));
  const lamp = box(fract(along.div(1.3)).sub(0.5).mul(1.3), 0.26, up.sub(signBottom.sub(0.2)), 0.05);
  const interior = mix(interiorShade.mul(mix(float(0.5), float(0.95), height)), colour("shop-lit"), lamp);
  // The glass shows the sky above and the street's dark below, broken by a slanting sheen.
  const slant = fract(along.add(up.mul(0.7)).div(3.3));
  const sheen = mix(float(SHEEN_SHARE), smoothstep(float(0.72), float(0.8), slant).mul(float(1).sub(smoothstep(float(0.9), float(0.98), slant))), shows);
  const glass = mix(interior, mix(colour("wall-glass"), sky, height.clamp(0, 1)), float(0.24).add(sheen.mul(0.22)));

  const door = between(fromDoor, -DOOR_HALF_M, DOOR_HALF_M);
  const glassBand = between(up, RISER_M, signBottom.sub(0.05));
  const glazed = max(door.mul(below(up, signBottom.sub(0.05))), float(1).sub(pulses(along, pane, PIER_M, pixel)).mul(glassBand));
  const doorBar = box(fromDoor.sub(0.42), 0.03, up.sub(1.05), 0.32).mul(door);
  const doorEdge = door.mul(smoothstep(float(DOOR_HALF_M - 0.09), float(DOOR_HALF_M - 0.05), abs(fromDoor))).mul(shows);

  // A shop's piers are its sign's own colour, so it reads as one painted front; a big shop's stay the wall.
  const fasciaChoice = fract(roll2.mul(4));
  const fasciaOf = (value: Node<"float">) => select(value.lessThan(0.25), colour("shop-fascia-a"), select(value.lessThan(0.5), colour("shop-fascia-b"), select(value.lessThan(0.75), colour("shop-fascia-c"), colour("shop-fascia-d"))));
  const fascia = fasciaOf(fasciaChoice);
  const signInk = mix(colour("sign-white"), colour("sign-black"), select(fasciaChoice.greaterThan(0.75), float(1), float(0)));
  const piers = mix(mix(fascia, colour("shop-riser"), below(up, RISER_M)), wall, big);

  /** How much of the word lies here, `span` metres across, centred `middle` up the wall. */
  const lettering = (span: Node<"float">, middle: Node<"float">) => {
    const wordTall = span.div(WORD_ASPECT);
    const column = word.mod(float(WORD_COLUMNS));
    const row = floor(word.div(WORD_COLUMNS));
    const wordX = fromCentre.mul(reads).div(span).add(0.5);
    const wordY = middle.sub(up).div(wordTall).add(0.5);
    const wordUv = vec2(wordX.clamp(0.002, 0.998).add(column).mul(sheet.words.width).add(sheet.words.u), wordY.clamp(0.01, 0.99).add(row).mul(sheet.words.height).add(sheet.words.v));
    const inWord = box(fromCentre, span.mul(0.47), middle.sub(up), wordTall.mul(0.47));
    const level = pixel.mul(WORD_PIXELS).div(span.max(0.1)).max(1).log2();
    return mix(float(INK_SHARE), smoothstep(float(0.25), float(0.7), texture(sheet.texture, wordUv).level(level).r), shows).mul(inWord);
  };

  // A shop's sign is the band over its glass; a big shop's sits high on the wall round its name.
  const bigSignTop = max(eaves.sub(0.3), shopTop);
  const signTop = mix(shopTop, bigSignTop, big);
  const signTall = mix(float(SIGN_M), float(BIG_SIGN_M), big);
  const wordWide = mix(min(float(WORD_WIDE_M), width.sub(1.2)), min(float(BIG_WORD_WIDE_M), width.sub(1.6)), big);
  const signMiddle = signTop.sub(signTall.mul(0.5));
  const signBand = between(up, signTop.sub(signTall), signTop).mul(mix(withinEnds, below(abs(fromCentre), wordWide.mul(0.5).add(0.7)), big));
  const signed = mix(fascia, signInk, lettering(wordWide, signMiddle));

  const awningOn = select(roll2.greaterThan(0.55), float(1), float(0)).mul(float(1).sub(big));
  const awningY = signBottom.sub(up);
  const inAwning = between(awningY, 0, AWNING_M).mul(awningOn).mul(glazed);
  const stripes = mix(float(0.5), smoothstep(float(0.48), float(0.52), fract(along.div(STRIPE_M * 2))), shows);
  const canvas = mix(colour("shop-awning"), colour("sign-white"), stripes).mul(mix(float(1), float(0.82), awningY.div(AWNING_M).clamp(0, 1)));
  const awningShade = between(awningY, 0, AWNING_M + 0.5).mul(awningOn).mul(0.35);

  const filled = mix(mix(piers, glass.mul(float(1).sub(awningShade)), glazed), canvas, inAwning);
  const withDoor = mix(mix(filled, fascia, doorEdge), colour("wall-trim"), doorBar);
  const shopped = mix(mix(wall, withDoor, inShop), signed, signBand);

  // A plate: the whole wall is the sign, its word as wide as fits.
  const plateWide = min(width.mul(0.9), eaves.mul(WORD_ASPECT).mul(0.8));
  const plated = mix(fascia, signInk, lettering(plateWide, eaves.mul(0.5)));

  const isShop = step(0.5, front).mul(float(1).sub(plate)).mul(room);
  return mix(mix(wall, shopped, isShop), plated, plate);
}
