import { abs, dFdx, float, floor, fract, Fn, If, int, length, max, min, mix, round, select, sin, smoothstep, step, texture, uniformArray, vec2, vec3 } from "three/tsl";
import type { Node, Vector3 } from "three/webgpu";
import IDS from "./facade-ids.json";
import type { WordSheet } from "./word-sheet";

/*
 * Six more ways for a wall to look, in the terms of the wall shader (`render/buildings.ts`): boxes and bands laid out from
 * each facade's real width and eaves, no texture but a shop's name, fading by the size of a pixel so nothing shimmers.
 *
 * A wall's tint carries it all, so a building needs no new vertex data, only other numbers in those bytes:
 *   alpha  the style, as `facade-ids.json` numbers them (the pipeline's own stop at 3)
 *   red    the paint, low five bits; a front, the top three
 *   green  128 for the facade with the door, plus the word on its sign
 *   blue   the building's seed, already there as its shade
 *
 * A style's cost is paid only by its own pixels and only while its detail shows: the styles are real branches, not a
 * `select`, which would run all six for every pixel. Derivatives are read once outside them.
 */

const { styles: STYLE, paints: PAINTS, fronts: FRONT } = IDS;

/** A pixel this many metres across along a wall: fine lines have gone, then everything but the wall's own colour. */
const FINE_GONE = [0.03, 0.09] as const;
const DETAIL_GONE = [0.16, 0.45] as const;
/** The share of a wall's colour left once its glass and shadow have blurred into it, so it doesn't brighten as it fades. */
const FAR_SHADES = [0.92, 0.84, 0.83, 0.9, 0.97, 0.94, 0.96];
const PLINTH_M = 0.42;

type F = Node<"float">;
type V3 = Node<"vec3">;

export interface FacadeInput {
  along: F;
  up: F;
  width: F;
  eaves: F;
  tint: Node<"vec4">;
  /** The size of a pixel on the wall, metres: read outside any branch. */
  pixel: F;
  /** The wall as the older styles draw it. */
  wall: V3;
  colour: (name: string) => V3;
  linear: (name: string) => Vector3;
  words: WordSheet;
}

interface Wall {
  along: F;
  up: F;
  width: F;
  eaves: F;
  fromCentre: F;
  pixel: F;
  soft: F;
  /** 1 while fine lines show. */
  fine: F;
  paint: V3;
  seed: F;
  /** A second and third roll, for choices that shouldn't move together. */
  rollA: F;
  rollB: F;
  hasDoor: F;
  /** 1 where `along` runs rightwards on screen, -1 where a word would come out mirrored. */
  reads: F;
  colour: (name: string) => V3;
}

const hash = (value: F): F => fract(sin(value.mul(91.345)).mul(47453.5453));

const below = (wall: Wall, value: F, edge: F | number): F => float(1).sub(smoothstep(wall.soft.negate(), wall.soft, value.sub(edge)));
const above = (wall: Wall, value: F, edge: F | number): F => smoothstep(wall.soft.negate(), wall.soft, value.sub(edge));
const box = (wall: Wall, x: F, halfX: F | number, y: F, halfY: F | number): F => below(wall, abs(x), halfX).mul(below(wall, abs(y), halfY));
const band = (wall: Wall, value: F, from: F | number, to: F | number): F => above(wall, value, from).mul(below(wall, value, to));

/** A pane's colour: dark glass taking the sky near its top, a little different in each, with a blind drawn in some. */
function glass(wall: Wall, x: F, y: F, halfH: F | number, id: F): V3 {
  const light = hash(id.add(wall.seed));
  const height = y.div(halfH).mul(0.5).add(0.5).clamp(0, 1);
  const pane = mix(wall.colour("wall-glass"), wall.colour("sky"), height.mul(height).mul(0.42).add(light.mul(0.14)));
  const blindDown = float(0.45).add(hash(id.mul(1.7)).mul(0.5));
  const blind = step(0.7, light).mul(above(wall, height, blindDown));
  return mix(pane, wall.colour("wall-trim").mul(0.82), blind.mul(0.8));
}

const lit = (wall: Wall, on: F) => on.mul(wall.fine);

/** The wall painted, boards and all, for the villas: lapped boards above a panelled base, with a belt between floors. */
function villa(wall: Wall): V3 {
  const { along, up, width, eaves, fromCentre, paint, rollA, rollB, colour } = wall;
  const darkTrim = step(0.82, rollB);
  const trim = mix(colour("wall-trim"), colour("villa-trim-dark"), darkTrim);
  const storeys = max(float(1), round(eaves.div(3.1)));
  const storey = eaves.div(storeys);
  const axes = round(width.div(mix(float(2.5), float(3.2), rollA))).clamp(1, 11);
  const bay = width.div(axes);
  const inBay = fract(along.div(bay)).sub(0.5).mul(bay);
  const floorUp = fract(up.div(storey)).mul(storey);
  const halfWide = mix(float(0.44), float(0.54), rollB);
  const halfTall = min(storey.mul(0.3), float(0.92));
  const y = floorUp.sub(storey.mul(0.54));
  const axis = floor(along.div(bay)).add(floor(up.div(storey)).mul(13));
  const onWall = below(wall, up, eaves.sub(0.5)).mul(step(2.2, width));

  const lap = float(1).sub(lit(wall, smoothstep(float(0.78), float(0.98), fract(up.div(0.135)))).mul(0.2));
  const panelled = below(wall, up, 1.05).mul(above(wall, up, PLINTH_M));
  const panelBoards = float(1).sub(lit(wall, smoothstep(float(0.8), float(0.96), fract(along.div(0.3)))).mul(0.26));
  let out: V3 = paint.mul(mix(lap, panelBoards, panelled));
  // Belts at the panel's top and between floors, and pilasters at the corners, with a capital under the frieze.
  const belt = max(band(wall, up, 1.05, 1.2), band(wall, abs(up.sub(storey).mul(step(1.5, storeys))), -1, 0.13));
  const pilaster = below(wall, min(along, width.sub(along)), 0.21).mul(below(wall, up, eaves));
  const capital = below(wall, min(along, width.sub(along)), 0.3).mul(band(wall, up, eaves.sub(0.62), eaves.sub(0.42)));
  out = mix(out, trim, max(max(belt, pilaster), capital));

  // The frieze: a band under the eaves, ending in a scalloped valance with its own shadow.
  const fromEaves = eaves.sub(up);
  const scallop = abs(sin(along.mul(Math.PI).div(mix(float(0.42), float(0.62), rollA)))).mul(0.12);
  const valance = float(0.2).add(scallop);
  out = mix(out, out.mul(0.72), band(wall, fromEaves, valance, valance.add(0.09)));
  out = mix(out, trim, band(wall, fromEaves, 0, valance));

  // A tall window with a cross of bars, a surround, and over it a pediment, a flat hood or an arched head.
  const pane = box(wall, inBay, halfWide, y, halfTall);
  const surround = box(wall, inBay, halfWide.add(0.13), y, halfTall.add(0.13));
  const hoodKind = fract(rollA.mul(3.7));
  const overHead = y.sub(halfTall.add(0.13));
  const pediment = below(wall, overHead, float(0.34).mul(float(1).sub(abs(inBay).div(halfWide.add(0.26))))).mul(above(wall, overHead, 0)).mul(below(wall, abs(inBay), halfWide.add(0.26)));
  const flatHood = box(wall, inBay, halfWide.add(0.24), overHead.sub(0.06), 0.07);
  const arched = below(wall, length(vec2(inBay, overHead.mul(1.4))), halfWide.add(0.13)).mul(above(wall, overHead, 0));
  const hood = select(hoodKind.lessThan(0.4), pediment, select(hoodKind.lessThan(0.72), flatHood, arched));
  const apron = box(wall, inBay, halfWide, y.add(halfTall).add(0.24), 0.11);
  const dressed = max(max(surround, hood), apron).mul(onWall);
  out = mix(out, trim, dressed);
  const bars = max(below(wall, abs(inBay), 0.025), below(wall, abs(y.sub(halfTall.mul(0.42))), 0.025));
  const window = mix(glass(wall, inBay, y, halfTall, axis), trim, bars);
  out = mix(out, window, pane.mul(onWall));

  // The door on the middle axis, panelled, with a fanlight.
  const doorX = fromCentre;
  const door = box(wall, doorX, 0.55, up.sub(1.15), 1.15).mul(wall.hasDoor);
  const doorFrame = box(wall, doorX, 0.72, up.sub(1.3), 1.3).mul(wall.hasDoor);
  const fanlight = box(wall, doorX, 0.5, up.sub(2.42), 0.1).mul(wall.hasDoor);
  const doorPanel = box(wall, abs(doorX).sub(0.26), 0.17, fract(up.div(0.75)).sub(0.5), 0.3);
  out = mix(out, trim, doorFrame);
  out = mix(out, mix(colour("wall-door"), colour("wall-door").mul(1.35), doorPanel), door);
  out = mix(out, colour("wall-glass"), fanlight);

  // A gable: a sunburst of boards round a little round window, or plain upright boards round it.
  const overEaves = up.sub(eaves);
  const inGable = above(wall, overEaves, 0.02);
  const burst = smoothstep(float(0.4), float(0.6), fract(fromCentre.div(overEaves.add(0.9)).mul(mix(float(2.2), float(3.4), rollB))));
  const upright = smoothstep(float(0.78), float(0.96), fract(along.div(0.24)));
  const gableBoards = select(rollA.lessThan(0.55), burst.mul(0.14), upright.mul(0.22));
  const gableColour = mix(paint.mul(float(1).sub(gableBoards.mul(wall.fine))), trim, band(wall, overEaves, 0.02, 0.18));
  const fromRound = length(vec2(fromCentre, overEaves.sub(1.15)));
  const roundFrame = below(wall, fromRound, 0.5).mul(step(5, width));
  const roundPane = below(wall, fromRound, 0.38).mul(step(5, width));
  const gable = mix(mix(gableColour, trim, roundFrame), colour("wall-glass"), roundPane);
  out = mix(out, gable, inGable);
  return mix(out, colour("wall-plinth"), below(wall, up, PLINTH_M));
}

/** Brick in running bond, with stone sills, a course of soldiers over each window and a corbelled top. */
function brick(wall: Wall): V3 {
  const { along, up, width, eaves, fromCentre, paint, rollA, rollB, colour } = wall;
  const mortar = colour("brick-mortar");
  const course = floor(up.div(0.085));
  const inCourse = fract(up.div(0.085));
  const offset = fract(course.mul(0.5)).mul(2).mul(0.5);
  const brickX = along.div(0.25).add(offset);
  const tone = hash(floor(brickX).add(course.mul(7.31)).add(wall.seed)).sub(0.5).mul(0.17).mul(wall.fine).add(1);
  const bedJoint = smoothstep(float(0.74), float(0.9), inCourse).mul(wall.fine);
  const headJoint = smoothstep(float(0.9), float(0.97), fract(brickX)).mul(wall.fine);
  let out: V3 = mix(paint.mul(tone), mortar, max(bedJoint, headJoint).mul(0.62));

  const storeys = max(float(1), round(eaves.div(3.05)));
  const storey = eaves.div(storeys);
  const wide = step(0.5, rollA);
  const bay = width.div(max(float(1), round(width.div(mix(float(2.7), float(3.9), rollB)))));
  const inBay = fract(along.div(bay)).sub(0.5).mul(bay);
  const floorUp = fract(up.div(storey)).mul(storey);
  const halfWide = mix(float(0.58), bay.mul(0.36), wide);
  const halfTall = min(storey.mul(0.25), float(0.72));
  const y = floorUp.sub(storey.mul(0.52));
  const onWall = below(wall, up, eaves.sub(0.55)).mul(step(2.4, width));
  const axis = floor(along.div(bay)).add(floor(up.div(storey)).mul(17));

  const sill = box(wall, inBay, halfWide.add(0.1), y.add(halfTall).add(0.05), 0.05).mul(onWall);
  const soldiers = box(wall, inBay, halfWide.add(0.08), y.sub(halfTall).sub(0.11), 0.11).mul(onWall);
  const soldierLine = smoothstep(float(0.82), float(0.96), fract(along.div(0.09))).mul(wall.fine);
  out = mix(out, mix(paint.mul(0.86), mortar, soldierLine.mul(0.5)), soldiers);
  out = mix(out, colour("brick-stone"), sill);
  const frame = box(wall, inBay, halfWide, y, halfTall).mul(onWall);
  const pane = box(wall, inBay, halfWide.sub(0.07), y, halfTall.sub(0.07)).mul(onWall);
  const lights = max(float(1), floor(halfWide.mul(1.6)));
  const upright = below(wall, abs(fract(inBay.div(halfWide.mul(2)).add(0.5).mul(lights)).sub(0.5)).sub(0.5).negate(), 0.04);
  const bars = max(below(wall, abs(y.sub(halfTall.mul(0.3))), 0.025), upright);
  out = mix(out, colour("wall-trim"), frame);
  out = mix(out, mix(glass(wall, inBay, y, halfTall, axis), colour("wall-trim"), bars), pane);

  const door = box(wall, fromCentre, 0.75, up.sub(1.1), 1.1).mul(wall.hasDoor);
  const doorHead = box(wall, fromCentre, 0.95, up.sub(2.32), 0.13).mul(wall.hasDoor);
  out = mix(out, colour("brick-stone"), doorHead);
  out = mix(out, colour("wall-door"), door);

  // Two stepped courses under the eaves, and a stone plinth.
  const fromEaves = eaves.sub(up);
  const toothed = step(0.5, fract(along.div(0.5))).mul(step(0.55, rollB));
  const corbel = max(band(wall, fromEaves, 0.1, 0.27), band(wall, fromEaves, 0.27, 0.44).mul(toothed));
  out = mix(out, paint.mul(0.74), corbel);
  out = mix(out, colour("brick-stone"), band(wall, fromEaves, -0.2, 0.1));
  return mix(out, colour("brick-stone").mul(0.72), below(wall, up, 0.5));
}

/** A rendered block of the 1960s to 80s: ribbon windows over coloured spandrels, or punched ones, with stacks of balconies. */
function block(wall: Wall): V3 {
  const { along, up, width, eaves, fromCentre, paint, rollA, rollB, colour } = wall;
  const storeys = max(float(1), round(eaves.div(2.95)));
  const storey = eaves.div(storeys);
  const floorUp = fract(up.div(storey)).mul(storey);
  const level = floor(up.div(storey));
  const streak = hash(floor(along.div(1.4)).add(wall.seed)).sub(0.5).mul(0.07).mul(wall.fine).add(1);
  const panelJoint = below(wall, abs(fract(along.div(3.6)).sub(0.5).mul(3.6)).sub(1.78).negate(), 0).mul(wall.fine).mul(step(0.45, rollA)).mul(0.14);
  let out: V3 = paint.mul(streak).mul(float(1).sub(panelJoint));
  const body = above(wall, up, 0.75).mul(below(wall, up, eaves.sub(0.45))).mul(step(3, width));

  const spandrelPick = fract(rollB.mul(5.3));
  const spandrel = select(spandrelPick.lessThan(0.34), colour("render-spandrel-a"), select(spandrelPick.lessThan(0.67), colour("render-spandrel-b"), colour("render-spandrel-c")));
  const isRibbon = step(rollA, float(0.48));
  const ribbonTop = storey.mul(0.8);
  const ribbonBottom = storey.mul(0.34);
  const mullionStep = mix(float(1.15), float(1.6), rollB);
  const inMullion = fract(along.div(mullionStep)).sub(0.5).mul(mullionStep);
  const y = floorUp.sub(ribbonBottom.add(ribbonTop).mul(0.5));
  const halfTall = ribbonTop.sub(ribbonBottom).mul(0.5);
  const paneId = floor(along.div(mullionStep)).add(level.mul(23));
  const ribbon = band(wall, floorUp, ribbonBottom, ribbonTop).mul(band(wall, along, 0.9, width.sub(0.9)));
  const ribbonBand = band(wall, floorUp, ribbonBottom.sub(0.42), ribbonTop.add(0.14)).mul(band(wall, along, 0.72, width.sub(0.72)));
  const ribbonColour = mix(glass(wall, inMullion, y, halfTall, paneId), colour("wall-trim"), below(wall, abs(inMullion).sub(mullionStep.mul(0.5)).negate(), 0.035));
  const ribbonWall = mix(mix(out, spandrel, ribbonBand), ribbonColour, ribbon);

  const bay = width.div(max(float(1), round(width.div(mix(float(2.8), float(3.5), rollB)))));
  const inBay = fract(along.div(bay)).sub(0.5).mul(bay);
  const halfWide = mix(float(0.62), float(0.95), rollA);
  const bayId = floor(along.div(bay)).add(level.mul(19));
  const punched = box(wall, inBay, halfWide, y, halfTall.add(0.02));
  const punchedFrame = box(wall, inBay, halfWide.add(0.05), y, halfTall.add(0.07));
  const punchBar = below(wall, abs(inBay), 0.025);
  const punchedWall = mix(mix(out, colour("wall-trim"), punchedFrame), mix(glass(wall, inBay, y, halfTall, bayId), colour("wall-trim"), punchBar), punched);
  out = mix(out, mix(punchedWall, ribbonWall, isRibbon), body);

  // Balconies stacked in columns on a long facade: a dark recess with a door, a slab, a parapet panel, a shadow under.
  const every = mix(float(7.2), float(10.8), rollA);
  const balconyHalf = mix(float(1.5), float(2.1), rollB);
  const fromStack = fract(along.div(every).add(0.5 * 0.5)).sub(0.5).mul(every);
  const hasStack = step(9, width).mul(step(1.5, storeys));
  const inStack = below(wall, abs(fromStack), balconyHalf).mul(hasStack).mul(body).mul(above(wall, up, storey));
  const recess = colour("balcony-dark");
  const balconyDoor = box(wall, fromStack.sub(0.5), 0.42, floorUp.sub(1.15), 1.05);
  const railBottom = 0.12;
  const railTop = 1.05;
  const railKind = fract(rollA.mul(7.1));
  const railColour = select(railKind.lessThan(0.4), colour("balcony-slab"), select(railKind.lessThan(0.7), spandrel, colour("sky").mul(0.62)));
  const rail = band(wall, floorUp, railBottom, railTop);
  const railRib = smoothstep(float(0.7), float(0.9), fract(fromStack.div(0.2))).mul(wall.fine).mul(0.16).mul(step(0.7, railKind));
  const slab = below(wall, floorUp, railBottom);
  const shade = band(wall, floorUp, storey.sub(0.55), storey).mul(0.5);
  const balcony = mix(mix(mix(recess, recess.mul(1.6), balconyDoor), railColour.mul(float(1).sub(railRib)), rail), colour("balcony-slab"), slab);
  out = mix(out, mix(balcony, balcony.mul(0.72), shade), inStack);

  // A stair: a tall column of glass over the entrance, and the entrance itself.
  const stair = box(wall, fromCentre, 0.55, up.sub(eaves.mul(0.5).add(0.3)), eaves.mul(0.5).sub(0.9)).mul(wall.hasDoor).mul(step(1.5, storeys));
  const stairFloors = smoothstep(float(0.04), float(0.08), abs(fract(up.div(storey)).sub(0.5)).sub(0.42)).mul(0.6);
  out = mix(out, mix(glass(wall, fromCentre, up.sub(eaves.mul(0.5)), eaves.mul(0.5), wall.seed), colour("wall-trim"), stairFloors), stair);
  const entrance = box(wall, fromCentre, 0.95, up.sub(1.15), 1.15).mul(wall.hasDoor);
  const entranceBar = below(wall, abs(fromCentre), 0.04);
  out = mix(out, mix(colour("wall-glass"), colour("wall-trim"), entranceBar), entrance);

  // A coping along the top and a dark base.
  const coping = band(wall, eaves.sub(up), -0.2, 0.22);
  out = mix(out, colour("balcony-slab"), coping);
  return mix(out, colour("wall-plinth"), below(wall, up, 0.75));
}

/** Glass in a metal grid, with whole bays of panel, some of them timber. */
function curtain(wall: Wall): V3 {
  const { along, up, eaves, fromCentre, paint, rollA, rollB, colour } = wall;
  const storeys = max(float(1), round(eaves.div(3.4)));
  const storey = eaves.div(storeys);
  const cellWide = mix(float(1.2), float(1.6), rollA);
  const inModule = fract(along.div(cellWide)).sub(0.5).mul(cellWide);
  const floorUp = fract(up.div(storey)).mul(storey);
  const paneId = floor(along.div(cellWide)).add(floor(up.div(storey)).mul(31));
  const y = floorUp.sub(storey.mul(0.5));
  const bayWide = mix(float(4.2), float(7.8), rollB);
  const bay = floor(along.div(bayWide));
  const panelRoll = hash(bay.add(wall.seed).add(floor(up.div(storey).div(mix(float(1), float(3), rollA))).mul(3.3)));
  const panelShare = mix(float(0.22), float(0.55), rollB);
  const isPanel = step(panelRoll, panelShare);
  const useWood = step(0.72, rollA);
  const panelColour = select(step(panelRoll, panelShare.mul(0.5)).greaterThan(0.5), mix(colour("panel-light"), colour("panel-wood"), useWood), paint);
  const jointX = below(wall, abs(inModule).sub(cellWide.mul(0.5)).negate(), 0.012);
  const jointY = below(wall, abs(fract(up.div(0.8)).sub(0.5)).sub(0.5).negate(), 0.015);
  const panel = mix(panelColour, panelColour.mul(0.74), max(jointX, jointY).mul(wall.fine));
  // Glass takes the sky at the top of the wall and the street's dark at the foot, one big reflection across all the panes.
  const reflection = up.div(eaves).clamp(0, 1).add(sin(along.mul(0.17).add(up.mul(0.05))).mul(0.14)).clamp(0, 1);
  const sheet = mix(colour("curtain-glass"), colour("sky"), reflection.mul(reflection).mul(0.62));
  const tinted = sheet.mul(mix(float(0.9), float(1.1), hash(paneId)));
  const spandrel = below(wall, abs(y.add(storey.mul(0.42))), 0.32);
  const glazed = mix(tinted, tinted.mul(0.72), spandrel);
  const mullion = below(wall, abs(inModule).sub(cellWide.mul(0.5)).negate(), 0.045);
  const transom = below(wall, abs(y).sub(storey.mul(0.5)).negate(), 0.07);
  const grid = max(mullion, transom);
  let out: V3 = mix(mix(glazed, colour("curtain-frame"), grid), panel, isPanel);
  const entrance = box(wall, fromCentre, 1.3, up.sub(1.25), 1.25).mul(wall.hasDoor);
  const canopy = box(wall, fromCentre, 1.9, up.sub(2.72), 0.12).mul(wall.hasDoor);
  out = mix(out, mix(colour("wall-glass"), colour("curtain-frame"), below(wall, abs(fromCentre), 0.05)), entrance);
  out = mix(out, colour("curtain-frame"), canopy);
  out = mix(out, colour("curtain-frame"), band(wall, eaves.sub(up), -0.2, 0.26));
  return mix(out, colour("wall-plinth"), below(wall, up, 0.35));
}

/** A big box: ribbed sheet in long panels, a concrete base, a strip of light and a band of colour at the top. */
function hall(wall: Wall): V3 {
  const { along, up, width, eaves, fromCentre, paint, rollA, rollB, colour } = wall;
  const flat = step(0.7, rollA);
  const ribStep = mix(float(0.24), float(0.36), rollB);
  const rib = abs(fract(along.div(ribStep)).sub(0.5)).mul(2);
  const ribShade = mix(float(0.84), float(1.04), smoothstep(float(0.25), float(0.55), rib));
  const lines = fract(up.div(1.1));
  const flatJoint = smoothstep(float(0.93), float(0.98), lines).mul(0.3);
  const surface = mix(ribShade, float(1).sub(flatJoint), flat);
  const seam = hash(floor(along.div(mix(float(5.5), float(8.5), rollA))).add(wall.seed)).sub(0.5).mul(0.05).add(1);
  let out: V3 = paint.mul(mix(float(0.95), surface.mul(seam), wall.fine));
  const fromEaves = eaves.sub(up);
  const hasBand = step(0.35, rollB);
  const accent = band(wall, fromEaves, 0.1, 0.1 + 0.62).mul(hasBand);
  out = mix(out, select(step(0.6, fract(rollA.mul(3.3))).greaterThan(0.5), colour("clad-accent"), colour("clad-dark")), accent);
  out = mix(out, colour("clad-dark"), band(wall, fromEaves, -0.2, 0.1));
  // A strip of daylight panels high on the wall, broken every few metres.
  const stripOn = step(rollB, float(0.55));
  const strip = band(wall, up, eaves.sub(1.9), eaves.sub(1.25)).mul(step(0.22, abs(fract(along.div(6)).sub(0.5)))).mul(stripOn).mul(band(wall, along, 1.2, width.sub(1.2)));
  out = mix(out, mix(colour("wall-glass"), colour("sky"), float(0.3)), strip);
  // Roller doors at a seeded rhythm, the door facade's in the middle, with a walk-in door beside.
  const doorEvery = mix(float(14), float(26), rollA);
  const fromDoor = fract(along.div(doorEvery).add(rollB)).sub(0.5).mul(doorEvery);
  const rollerHalfWide = 2.1;
  const roller = box(wall, fromDoor, rollerHalfWide, up.sub(2.1), 2.1).mul(step(12, width));
  const slats = float(1).sub(smoothstep(float(0.8), float(0.95), fract(up.div(0.3))).mul(0.3).mul(wall.fine));
  out = mix(out, paint.mul(0.78).mul(slats), roller.mul(wall.hasDoor));
  const walkIn = box(wall, fromCentre.sub(3.3), 0.5, up.sub(1.05), 1.05).mul(wall.hasDoor);
  out = mix(out, colour("clad-dark"), walkIn);
  const base = below(wall, up, mix(float(0.5), float(1.15), rollA));
  return mix(out, colour("clad-base"), base);
}

/** Barn boards of three kinds, weathered by the plank, on a fieldstone foot, with a braced double door and a hay hatch. */
function barn(wall: Wall): V3 {
  const { along, up, width, eaves, fromCentre, paint, rollA, rollB, colour } = wall;
  const kind = fract(rollA.mul(3.1));
  const coarse = float(0.3);
  // Boards of uneven width: a cell's edge is moved by its own roll.
  const cellX = along.div(coarse);
  const cell = floor(cellX);
  const edge = hash(cell.add(wall.seed)).mul(0.5).add(0.25);
  const within = fract(cellX);
  const leftOf = step(within, edge);
  const plank = cell.add(leftOf.mul(0.5));
  const plankTone = hash(plank.mul(1.7)).sub(0.5).mul(0.24).add(1);
  const uneven = float(1).sub(max(smoothstep(float(0.03), float(0), abs(within.sub(edge))), smoothstep(float(0.96), float(1), within)).mul(0.42));
  const batten = float(1).sub(smoothstep(float(0.78), float(0.86), fract(along.div(0.46))).mul(smoothstep(float(0.99), float(0.92), fract(along.div(0.46)))).mul(0.4));
  const lap = float(1).sub(smoothstep(float(0.8), float(0.97), fract(up.div(0.19))).mul(0.38));
  const lines = select(kind.lessThan(0.5), uneven, select(kind.lessThan(0.8), batten, lap));
  const age = hash(floor(along.div(2.3)).add(wall.seed)).mul(0.1);
  const streak = mix(float(0.84).sub(age), float(1), smoothstep(float(0), float(2.4), up));
  let out: V3 = paint.mul(mix(float(0.96), plankTone.mul(lines), wall.fine)).mul(streak);

  // A double door with its brace, on the door facade or the long one, and a hatch high in the gable.
  const doorHalf = min(width.mul(0.2), float(1.9));
  const doorTall = min(eaves.sub(0.3), float(3.1));
  const doorAt = fromCentre.add(width.mul(rollB.sub(0.5)).mul(0.4));
  const door = box(wall, doorAt, doorHalf, up.sub(doorTall.mul(0.5)), doorTall.mul(0.5)).mul(step(5, width));
  const leaf = fract(doorAt.div(doorHalf).mul(0.5).add(0.5).mul(2));
  const braceY = up.div(doorTall).clamp(0, 1);
  const brace = max(below(wall, abs(leaf.sub(braceY)), 0.05), below(wall, abs(float(1).sub(leaf).sub(braceY)), 0.05));
  const doorPaint = out.mul(0.66);
  const frame = max(below(wall, abs(abs(doorAt).sub(doorHalf)), 0.07), below(wall, abs(up.sub(doorTall)), 0.07));
  const doorBoards = mix(mix(doorPaint, out.mul(1.25), brace), out.mul(1.35), frame);
  out = mix(out, doorBoards, door);
  const hatch = box(wall, fromCentre, 0.75, up.sub(eaves).sub(1.2), 0.65).mul(step(5, width));
  out = mix(out, out.mul(0.7), hatch);
  // A small window of four panes along the long side.
  const every = mix(float(5.5), float(8), rollA);
  const fromWindow = fract(along.div(every)).sub(0.5).mul(every);
  const windowY = up.sub(eaves.mul(0.62).min(1.9));
  const showsWindow = step(9, width).mul(float(1).sub(door));
  const pane = box(wall, fromWindow, 0.36, windowY, 0.3).mul(showsWindow);
  const barLines = max(below(wall, abs(fromWindow), 0.03), below(wall, abs(windowY), 0.03));
  const surround = box(wall, fromWindow, 0.46, windowY, 0.4).mul(showsWindow);
  out = mix(out, colour("wall-trim"), surround);
  out = mix(out, mix(colour("wall-glass"), colour("wall-trim"), barLines), pane);
  // Fieldstone under it: cells of rounded stones, each its own grey.
  const stoneTop = mix(float(0.55), float(1.0), rollB);
  const row = floor(up.div(0.3));
  const stoneX = along.div(0.46).add(row.mul(0.47));
  const stoneId = floor(stoneX).add(row.mul(5.1));
  const gapX = abs(fract(stoneX).sub(0.5)).mul(2);
  const gapY = abs(fract(up.div(0.3)).sub(0.5)).mul(2);
  const joint = smoothstep(float(0.8), float(0.96), max(gapX, gapY)).mul(wall.fine);
  const stone = mix(mix(colour("barn-stone"), colour("barn-stone-dark"), hash(stoneId)), colour("barn-stone-dark").mul(0.6), joint);
  return mix(out, stone, below(wall, up, stoneTop));
}

/** Rapakivi laid in rough courses: uneven blocks of pink and grey in pale lime mortar, for churches and their walls. */
function granite(wall: Wall): V3 {
  const { along, up, paint, colour } = wall;
  const courseM = 0.66;
  const course = floor(up.div(courseM));
  const inCourse = fract(up.div(courseM));
  const stoneX = along.div(mix(float(1.05), float(1.7), hash(course.mul(3.1)))).add(hash(course.mul(1.3)));
  const stoneId = floor(stoneX).add(course.mul(9.7));
  const inStone = fract(stoneX);
  const joint = max(smoothstep(float(0.035), float(0), inCourse.sub(hash(stoneId).mul(0.1))), smoothstep(float(0.955), float(0.99), inStone));
  const pick = hash(stoneId.add(wall.seed));
  const tone = select(pick.lessThan(0.5), colour("church-granite-pink"), select(pick.lessThan(0.82), paint, colour("church-granite-grey")));
  const drift = sin(along.mul(0.31).add(up.mul(0.7))).mul(sin(along.mul(0.13).sub(up.mul(0.29)))).mul(0.05).add(1);
  // Stones are big enough to outlast the fine lines: a church is judged from across a field.
  const stones = float(1).sub(smoothstep(float(0.1), float(0.28), wall.pixel));
  const block = mix(paint, tone.mul(mix(float(0.95), float(1.05), hash(stoneId.mul(2.3)))), stones);
  return mix(block.mul(drift), colour("church-mortar"), joint.mul(0.42).mul(stones));
}

/** A whole wall that is a sign: a canopy's fascia, a pylon's plate. */
function plate(wall: Wall, word: F, words: WordSheet): V3 {
  const { width, eaves, fromCentre, up, rollA, colour } = wall;
  const wordWide = min(width.mul(0.96), eaves.mul(words.aspect).mul(1.1));
  const letters = wordOn(wall, fromCentre, up.sub(eaves.mul(0.5)).negate(), wordWide, word, words);
  const pick = fract(rollA.mul(4));
  const fascia = select(pick.lessThan(0.34), colour("front-green"), select(pick.lessThan(0.67), colour("front-red"), colour("front-blue")));
  return mix(fascia, colour("sign-white"), letters);
}

/** How much a word lies on this spot, 0 to 1. `x` and `down` run from the word's middle, `wide` is its width. */
function wordOn(wall: Wall, x: F, down: F, wide: F, word: F, words: WordSheet): F {
  const wordX = x.mul(wall.reads).div(wide).add(0.5);
  const wordY = down.div(wide.div(words.aspect)).add(0.5);
  const row = floor(word.div(words.columns));
  const column = word.sub(row.mul(words.columns));
  const inWord = box(wall, wordX.sub(0.5), 0.5, wordY.sub(0.5), 0.5);
  const uv = vec2(column.add(wordX.clamp(0.002, 0.998)).div(words.columns), row.add(wordY.clamp(0.01, 0.99)).div(words.rows));
  // A sample in a branch can't use its derivatives: the level comes from the size of a pixel instead.
  const level = wall.pixel.mul(words.pixelsWide).div(wide).max(1).log2();
  return smoothstep(float(0.3), float(0.65), texture(words.texture, uv).level(level).r).mul(inWord);
}

/** A shop's ground floor or a supermarket's front, over whatever the wall already is, on the facade with the door. */
function front(wall: Wall, under: V3, kind: F, word: F, words: WordSheet): V3 {
  const { along, up, width, eaves, fromCentre, seed, rollA, colour } = wall;
  const big = step(1.5, kind);
  const signTop = mix(min(eaves.sub(0.2), float(3.25)), eaves.sub(0.3), big);
  const signTall = mix(float(0.62), float(1.3), big);
  const signBottom = signTop.sub(signTall);
  const reach = mix(width.mul(0.5).sub(0.45), min(width.mul(0.5).sub(0.5), float(9)), big);
  const inFront = below(wall, abs(fromCentre), reach);

  const fasciaRoll = fract(rollA.mul(4));
  const fascia = select(fasciaRoll.lessThan(0.3), colour("front-green"), select(fasciaRoll.lessThan(0.6), colour("front-red"), select(fasciaRoll.lessThan(0.85), colour("front-blue"), colour("shop-fascia-a"))));
  const riser = colour("shop-riser");
  const pane = mix(float(2.6), float(3.4), rollA);
  const inPane = fract(along.div(pane)).sub(0.5).mul(pane);
  const glazedTop = signBottom.sub(0.08);
  const glazed = below(wall, abs(inPane), pane.mul(0.5).sub(0.1)).mul(band(wall, up, 0.45, glazedTop));
  const height = up.div(glazedTop).clamp(0, 1);
  const room = mix(colour("shop-interior"), colour("shop-lit"), height.mul(height).mul(0.55));
  const shelves = smoothstep(float(0.6), float(0.72), fract(up.div(0.42))).mul(below(wall, up, glazedTop.sub(0.5))).mul(0.35);
  const inside = room.mul(float(1).sub(shelves)).mul(mix(float(0.82), float(1.06), hash(floor(along.div(pane)).add(seed))));
  const glassy = mix(inside, mix(colour("wall-glass"), colour("sky"), height), float(0.3));
  const door = box(wall, fromCentre, 0.7, up.sub(glazedTop.mul(0.5)), glazedTop.mul(0.5));
  const doorBar = below(wall, abs(fromCentre), 0.05).mul(door);

  const wordWide = mix(float(3.7), float(7.4), big);
  const wordMiddle = signBottom.add(signTall.mul(0.5));
  const letter = wordOn(wall, fromCentre, wordMiddle.sub(up), wordWide, word, words);
  const ink = select(fasciaRoll.lessThan(0.85), colour("sign-white"), colour("front-sun"));
  const signBand = band(wall, up, signBottom, signTop).mul(mix(float(1), below(wall, abs(fromCentre), wordWide.mul(0.5).add(0.7)), big));
  const signed = mix(fascia, ink, letter);

  let out: V3 = mix(under, riser, below(wall, up, 0.45).mul(inFront).mul(float(1).sub(big)));
  const shop = below(wall, up, signBottom).mul(inFront);
  const pier = mix(fascia, under, big);
  out = mix(out, pier, shop);
  out = mix(out, glassy, glazed.mul(inFront));
  out = mix(out, mix(mix(colour("wall-glass"), colour("sky"), height.mul(0.3)), colour("wall-trim"), doorBar), door.mul(inFront));
  return mix(out, signed, signBand.mul(inFront));
}

export function facadeArt({ along, up, width, eaves, tint, pixel, wall, colour, linear, words }: FacadeInput): V3 {
  const palette = uniformArray(PAINTS.map(linear));
  const farShades = uniformArray(FAR_SHADES);
  return Fn(() => {
    const style = round(tint.a.mul(255)).toVar();
    const reads = select(dFdx(along).lessThan(0), float(-1), float(1)).toVar();
    const result = wall.toVar();
    If(style.greaterThan(STYLE.villa - 0.5), () => {
      const redByte = round(tint.r.mul(255)).toVar();
      const greenByte = round(tint.g.mul(255)).toVar();
      const seed = round(tint.b.mul(255)).toVar();
      const paintAt = redByte.mod(32).toVar();
      const rollA = hash(seed.mul(0.137).add(width.mul(0.011))).toVar();
      const rollB = hash(seed.mul(0.291).add(1.7)).toVar();
      const shade = mix(float(0.93), float(1.07), hash(seed.mul(0.71)));
      const paint = vec3(palette.element(int(paintAt)) as unknown as V3).mul(shade).toVar();
      const soft = pixel.mul(0.5).max(0.002).toVar();
      const fine = float(1).sub(smoothstep(float(FINE_GONE[0]), float(FINE_GONE[1]), pixel)).toVar();
      const shows = float(1).sub(smoothstep(float(DETAIL_GONE[0]), float(DETAIL_GONE[1]), pixel)).toVar();
      const farShade = farShades.element(int(style.sub(STYLE.villa))) as unknown as F;
      result.assign(paint.mul(farShade));
      If(shows.greaterThan(0), () => {
        const drawn: Wall = { along, up, width, eaves, fromCentre: along.sub(width.mul(0.5)).toVar(), pixel, soft, fine, paint, seed, rollA, rollB, hasDoor: step(127.5, greenByte), reads, colour };
        const near = result.toVar();
        If(style.lessThan(STYLE.brick - 0.5), () => {
          near.assign(villa(drawn));
        })
          .ElseIf(style.lessThan(STYLE.block - 0.5), () => {
            near.assign(brick(drawn));
          })
          .ElseIf(style.lessThan(STYLE.glass - 0.5), () => {
            near.assign(block(drawn));
          })
          .ElseIf(style.lessThan(STYLE.hall - 0.5), () => {
            near.assign(curtain(drawn));
          })
          .ElseIf(style.lessThan(STYLE.barn - 0.5), () => {
            near.assign(hall(drawn));
          })
          .ElseIf(style.lessThan(STYLE.granite - 0.5), () => {
            near.assign(barn(drawn));
          })
          .Else(() => {
            near.assign(granite(drawn));
          });
        const frontKind = floor(redByte.div(32));
        If(frontKind.greaterThan(FRONT.supermarket + 0.5), () => {
          near.assign(plate(drawn, greenByte.mod(128), words));
        }).ElseIf(frontKind.greaterThan(FRONT.none + 0.5).and(greenByte.greaterThan(127.5)), () => {
          near.assign(front(drawn, near, frontKind, greenByte.mod(128), words));
        });
        result.assign(mix(result, near, shows));
      });
    });
    return result;
  })();
}
