import { abs, float, floor, fract, Fn, If, int, length, max, min, mix, round, select, sin, smoothstep, step, uniformArray, vec2, vec3 } from "three/tsl";
import type { Node, Vector3 } from "three/webgpu";
import { seedOf, unitOf } from "../hash";
import { band, pulses } from "../surfaces/coverage";
import IDS from "./facade-ids.json";

/*
 * Seven more ways for a wall to look, in the terms of the wall shader (`render/buildings.ts`): boxes and bands laid out
 * from each facade's real width and eaves, with no texture.
 *
 * Every shape is its share of the pixel (`art/surfaces/coverage.ts`): a window, a belt, a joint between bricks. Up close
 * it has a crisp edge, and far off it settles on its share of the wall by itself, so nothing fades in or out. What can't
 * be drawn as coverage, a shape that isn't a box or a colour that changes from cell to cell, gives way to its own average
 * while it is still a few pixels across, so that too changes nothing a driver can see.
 *
 * A wall's tint carries it all, so a building needs no new vertex data, only other numbers in those bytes:
 *   alpha  the style, as `facade-ids.json` numbers them (the pipeline's own three come first)
 *   red    the paint, low five bits; a front, the top three (drawn by `art/surfaces/shopfront.ts`)
 *   green  128 for the facade with the door, plus the word on its sign
 *   blue   the building's seed
 *
 * A style's cost is paid only by its own pixels: the styles are real branches, not a `select`, which would run all seven
 * for every pixel. Derivatives are read outside them, by the caller.
 */

const { styles: STYLE, paints: PAINTS } = IDS;

const PLINTH_M = 0.42;

type F = Node<"float">;
type V3 = Node<"vec3">;
type Value = F | number;

export interface FacadeInput {
  along: F;
  up: F;
  width: F;
  eaves: F;
  tint: Node<"vec4">;
  /** How far a pixel reaches along the wall and up it, metres: read outside any branch. */
  wide: F;
  tall: F;
  colour: (name: string) => V3;
  linear: (name: string) => Vector3;
}

interface Wall {
  along: F;
  up: F;
  width: F;
  eaves: F;
  fromCentre: F;
  wide: F;
  tall: F;
  pixel: F;
  paint: V3;
  seed: F;
  /** A second and third roll, for choices that shouldn't move together. */
  rollA: F;
  rollB: F;
  hasDoor: F;
  colour: (name: string) => V3;
}

/** A number from 0 to 1 for whole numbers: a cell, a pane, a building's seed (`art/hash.ts`). */
const roll = (salt: number, ...whole: F[]): F => unitOf(seedOf(...whole), salt);
const lit = (value: Value): F => (typeof value === "number" ? float(value) : value);

/** The share of the pixel between two places along the wall, or up it. */
const across = (wall: Wall, x: F, from: Value, to: Value) => band(x, from, to, wall.wide);
const rising = (wall: Wall, y: F, from: Value, to: Value) => band(y, from, to, wall.tall);
const under = (wall: Wall, y: F, edge: Value) => band(y, -1000, edge, wall.tall);
const rect = (wall: Wall, x: F, halfX: Value, y: F, halfY: Value) => across(wall, x, lit(halfX).negate(), halfX).mul(rising(wall, y, lit(halfY).negate(), halfY));
/** A row of shapes `half` either side of every multiple of `period`, along the wall or up it. */
const columns = (wall: Wall, x: F, period: Value, half: Value) => pulses(x, period, half, wall.wide);
const courses = (wall: Wall, y: F, period: Value, half: Value) => pulses(y, period, half, wall.tall);
/** 1 while something repeating every `period` metres can be drawn, and 0 by the time it would shimmer. */
const resolved = (size: F, period: Value) => float(1).sub(smoothstep(lit(period).mul(0.2), lit(period).mul(0.5), size));
/** A shape that isn't a box: drawn sharp near, and as its box's coverage times the share it fills once it's a few pixels. */
const outline = (wall: Wall, sharp: F, box: F, share: number, size: Value) => mix(sharp, box.mul(share), smoothstep(lit(size).mul(0.1), lit(size).mul(0.35), wall.pixel));
/** A soft edge a pixel wide, for the sharp version of such a shape: 1 where `value` is under 0. */
const inside = (wall: Wall, value: F) => float(1).sub(smoothstep(wall.pixel.mul(-0.5), wall.pixel.mul(0.5), value));

/** A pane's colour: dark glass taking the sky near its top, a little different in each, both even once panes are small. */
function glass(wall: Wall, height: F, id: F, shows: F): V3 {
  const light = mix(float(0.5), roll(1, id, wall.seed), shows);
  const sky = mix(float(1 / 3), height.clamp(0, 1).mul(height.clamp(0, 1)), shows);
  return mix(wall.colour("wall-glass"), wall.colour("sky"), sky.mul(0.42).add(light.mul(0.14)));
}

/** The wall painted, boards and all, for the villas: lapped boards above a panelled base, with a belt between floors. */
function villa(wall: Wall): V3 {
  const { along, up, width, eaves, fromCentre, paint, rollA, rollB, colour } = wall;
  const trim = mix(colour("wall-trim"), colour("villa-trim-dark"), step(0.82, rollB));
  const storeys = max(float(1), round(eaves.div(3.1)));
  const storey = eaves.div(storeys);
  const bay = width.div(round(width.div(mix(float(2.5), float(3.2), rollA))).clamp(1, 11));
  const halfWide = mix(float(0.44), float(0.54), rollB);
  const halfTall = min(storey.mul(0.3), float(0.92));
  const middle = storey.mul(0.54);
  const onWall = under(wall, up, eaves.sub(0.5)).mul(step(2.2, width));
  const inBay = fract(along.div(bay)).sub(0.5).mul(bay);
  const inStorey = fract(up.div(storey)).mul(storey).sub(middle);
  const windowsShow = resolved(wall.wide, bay).mul(resolved(wall.tall, storey));
  const windowRow = (half: Value) => columns(wall, along.sub(bay.mul(0.5)), bay, half);
  const windowFloor = (offset: Value, half: Value) => courses(wall, up.sub(middle).sub(offset), storey, half);

  const lap = float(1).sub(courses(wall, up, 0.135, 0.012).mul(0.35));
  const panelled = rising(wall, up, PLINTH_M, 1.05);
  const panelBoards = float(1).sub(columns(wall, along, 0.3, 0.015).mul(0.3));
  let out: V3 = paint.mul(mix(lap, panelBoards, panelled));
  // Belts at the panel's top and between floors, and pilasters at the corners, with a capital under the frieze.
  const floorBelts = courses(wall, up, storey, 0.065).mul(rising(wall, up, storey.mul(0.5), eaves.sub(storey.mul(0.5))));
  const belt = max(rising(wall, up, 1.05, 1.2), floorBelts);
  const corners = across(wall, along, -1, 0.21).add(across(wall, along, width.sub(0.21), width.add(1))).min(1);
  const pilaster = corners.mul(under(wall, up, eaves));
  const capital = across(wall, along, -1, 0.3).add(across(wall, along, width.sub(0.3), width.add(1))).min(1).mul(rising(wall, up, eaves.sub(0.62), eaves.sub(0.42)));
  out = mix(out, trim, max(max(belt, pilaster), capital));

  // The frieze: a band under the eaves ending in a scalloped valance with its own shadow; the scallops even out far off.
  const fromEaves = eaves.sub(up);
  const scallopStep = mix(float(0.42), float(0.62), rollA);
  const scallop = mix(float(0.12 * (2 / Math.PI)), abs(sin(along.mul(Math.PI).div(scallopStep))).mul(0.12), resolved(wall.wide, scallopStep));
  const valance = float(0.2).add(scallop);
  out = mix(out, out.mul(0.72), rising(wall, fromEaves, valance, valance.add(0.09)));
  out = mix(out, trim, rising(wall, fromEaves, 0, valance));

  // A tall window with a cross of bars, a surround, and over it a pediment, a flat hood or an arched head.
  const pane = windowRow(halfWide).mul(windowFloor(0, halfTall));
  const surround = windowRow(halfWide.add(0.13)).mul(windowFloor(0, halfTall.add(0.13)));
  const head = halfTall.add(0.13);
  const overHead = inStorey.sub(head);
  const hoodKind = fract(rollA.mul(3.7));
  const pedimentBox = windowRow(halfWide.add(0.26)).mul(windowFloor(head.add(0.17), 0.17));
  const pedimentSharp = inside(wall, overHead.sub(float(0.34).mul(float(1).sub(abs(inBay).div(halfWide.add(0.26)))))).mul(inside(wall, overHead.negate())).mul(inside(wall, abs(inBay).sub(halfWide.add(0.26))));
  const pediment = outline(wall, pedimentSharp, pedimentBox, 0.5, 0.34);
  const flatHood = windowRow(halfWide.add(0.24)).mul(windowFloor(head.add(0.06), 0.07));
  const archRadius = halfWide.add(0.13);
  const archBox = windowRow(archRadius).mul(windowFloor(head.add(archRadius.div(2.8)), archRadius.div(2.8)));
  const archSharp = inside(wall, length(vec2(inBay, overHead.mul(1.4))).sub(archRadius)).mul(inside(wall, overHead.negate()));
  const arched = outline(wall, archSharp, archBox, Math.PI / 4, archRadius);
  const hood = select(hoodKind.lessThan(0.4), pediment, select(hoodKind.lessThan(0.72), flatHood, arched));
  const apron = windowRow(halfWide).mul(windowFloor(halfTall.add(0.24).negate(), 0.11));
  out = mix(out, trim, max(max(surround, hood), apron).mul(onWall));
  const bars = max(columns(wall, along.sub(bay.mul(0.5)), bay, 0.025), windowFloor(halfTall.mul(0.42), 0.025));
  const paneId = floor(along.div(bay)).add(floor(up.div(storey)).mul(13));
  const window = mix(glass(wall, inStorey.div(halfTall).mul(0.5).add(0.5), paneId, windowsShow), trim, bars);
  out = mix(out, window, pane.mul(onWall));

  // The door on the middle axis, panelled, with a fanlight.
  const door = rect(wall, fromCentre, 0.55, up.sub(1.15), 1.15).mul(wall.hasDoor);
  const doorFrame = rect(wall, fromCentre, 0.72, up.sub(1.3), 1.3).mul(wall.hasDoor);
  const fanlight = rect(wall, fromCentre, 0.5, up.sub(2.42), 0.1).mul(wall.hasDoor);
  const doorPanel = across(wall, abs(fromCentre), 0.09, 0.43).mul(courses(wall, up.sub(0.375), 0.75, 0.225));
  out = mix(out, trim, doorFrame);
  out = mix(out, mix(colour("wall-door"), colour("wall-door").mul(1.35), doorPanel), door);
  out = mix(out, colour("wall-glass"), fanlight);

  // A gable: a sunburst of boards round a little round window, or plain upright boards round it.
  const overEaves = up.sub(eaves);
  const inGable = rising(wall, overEaves, 0.02, 1000);
  const rays = mix(float(2.2), float(3.4), rollB);
  const rayStep = overEaves.add(0.9).div(rays);
  const burst = mix(float(0.5), smoothstep(float(0.4), float(0.6), fract(fromCentre.div(rayStep))), resolved(wall.wide, rayStep));
  const upright = columns(wall, along, 0.24, 0.02);
  const gableBoards = select(rollA.lessThan(0.55), burst.mul(0.14), upright.mul(0.4));
  const gableColour = mix(paint.mul(float(1).sub(gableBoards)), trim, rising(wall, overEaves, 0.02, 0.18));
  const fromRound = length(vec2(fromCentre, overEaves.sub(1.15)));
  const roundShown = step(5, width);
  const roundFrame = outline(wall, inside(wall, fromRound.sub(0.5)), rect(wall, fromCentre, 0.5, overEaves.sub(1.15), 0.5), Math.PI / 4, 1).mul(roundShown);
  const roundPane = outline(wall, inside(wall, fromRound.sub(0.38)), rect(wall, fromCentre, 0.38, overEaves.sub(1.15), 0.38), Math.PI / 4, 0.76).mul(roundShown);
  const gable = mix(mix(gableColour, trim, roundFrame), colour("wall-glass"), roundPane);
  out = mix(out, gable, inGable);
  return mix(out, colour("wall-plinth"), under(wall, up, PLINTH_M));
}

/** Brick in running bond, with stone sills, a course of soldiers over each window and a corbelled top. */
function brick(wall: Wall): V3 {
  const { along, up, width, eaves, fromCentre, paint, rollA, rollB, colour } = wall;
  const mortar = colour("brick-mortar");
  const course = floor(up.div(0.085));
  const coursesShow = resolved(wall.tall, 0.085);
  // Every other course is offset by half a brick: once courses are too fine to tell apart, the joints are their share.
  const offset = fract(course.mul(0.5)).mul(0.25);
  const headJoint = mix(float(0.016 / 0.25), columns(wall, along.add(offset), 0.25, 0.008), coursesShow);
  const bedJoint = courses(wall, up, 0.085, 0.008);
  const tone = roll(2, floor(along.add(offset).div(0.25)), course, wall.seed).sub(0.5).mul(0.17).mul(coursesShow).mul(resolved(wall.wide, 0.25)).add(1);
  let out: V3 = mix(paint.mul(tone), mortar, max(bedJoint, headJoint).mul(0.62));

  const storeys = max(float(1), round(eaves.div(3.05)));
  const storey = eaves.div(storeys);
  const bay = width.div(max(float(1), round(width.div(mix(float(2.7), float(3.9), rollB)))));
  const halfWide = mix(float(0.58), bay.mul(0.36), step(0.5, rollA));
  const halfTall = min(storey.mul(0.25), float(0.72));
  const middle = storey.mul(0.52);
  const onWall = under(wall, up, eaves.sub(0.55)).mul(step(2.4, width));
  const inBay = fract(along.div(bay)).sub(0.5).mul(bay);
  const inStorey = fract(up.div(storey)).mul(storey).sub(middle);
  const windowsShow = resolved(wall.wide, bay).mul(resolved(wall.tall, storey));
  const windowRow = (half: Value) => columns(wall, along.sub(bay.mul(0.5)), bay, half);
  const windowFloor = (offset: Value, half: Value) => courses(wall, up.sub(middle).sub(offset), storey, half);

  const sill = windowRow(halfWide.add(0.1)).mul(windowFloor(halfTall.add(0.05).negate(), 0.05)).mul(onWall);
  const soldiers = windowRow(halfWide.add(0.08)).mul(windowFloor(halfTall.add(0.11), 0.11)).mul(onWall);
  out = mix(out, mix(paint.mul(0.86), mortar, columns(wall, along, 0.09, 0.008).mul(0.5)), soldiers);
  out = mix(out, colour("brick-stone"), sill);
  const frame = windowRow(halfWide).mul(windowFloor(0, halfTall)).mul(onWall);
  const pane = windowRow(halfWide.sub(0.07)).mul(windowFloor(0, halfTall.sub(0.07))).mul(onWall);
  const lights = max(float(1), floor(halfWide.mul(1.6)));
  const uprights = columns(wall, inBay.add(halfWide), halfWide.mul(2).div(lights), 0.02);
  const bars = max(windowFloor(halfTall.mul(-0.3), 0.025), uprights);
  const paneId = floor(along.div(bay)).add(floor(up.div(storey)).mul(17));
  out = mix(out, colour("wall-trim"), frame);
  out = mix(out, mix(glass(wall, inStorey.div(halfTall).mul(0.5).add(0.5), paneId, windowsShow), colour("wall-trim"), bars), pane);

  const door = rect(wall, fromCentre, 0.75, up.sub(1.1), 1.1).mul(wall.hasDoor);
  const doorHead = rect(wall, fromCentre, 0.95, up.sub(2.32), 0.13).mul(wall.hasDoor);
  out = mix(out, colour("brick-stone"), doorHead);
  out = mix(out, colour("wall-door"), door);

  // Two stepped courses under the eaves, the lower toothed on some, and a stone plinth.
  const fromEaves = eaves.sub(up);
  const toothed = columns(wall, along.sub(0.375), 0.5, 0.125).mul(step(0.55, rollB));
  const corbel = max(rising(wall, fromEaves, 0.1, 0.27), rising(wall, fromEaves, 0.27, 0.44).mul(toothed));
  out = mix(out, paint.mul(0.74), corbel);
  out = mix(out, colour("brick-stone"), rising(wall, fromEaves, -0.2, 0.1));
  return mix(out, colour("brick-stone").mul(0.72), under(wall, up, 0.5));
}

/** A rendered block of the 1960s to 80s: ribbon windows over coloured spandrels, or punched ones, with stacks of balconies. */
function block(wall: Wall): V3 {
  const { along, up, width, eaves, fromCentre, paint, rollA, rollB, colour } = wall;
  const storeys = max(float(1), round(eaves.div(2.95)));
  const storey = eaves.div(storeys);
  const level = floor(up.div(storey));
  const floorUp = fract(up.div(storey)).mul(storey);
  const streak = roll(3, floor(along.div(1.4)), wall.seed).sub(0.5).mul(0.07).mul(resolved(wall.wide, 1.4)).add(1);
  const panelJoint = columns(wall, along.sub(1.8), 3.6, 0.02).mul(step(0.45, rollA)).mul(0.14);
  let out: V3 = paint.mul(streak).mul(float(1).sub(panelJoint));
  const body = rising(wall, up, 0.75, eaves.sub(0.45)).mul(step(3, width));
  const storeysShow = resolved(wall.tall, storey);

  const spandrelPick = fract(rollB.mul(5.3));
  const spandrel = select(spandrelPick.lessThan(0.34), colour("render-spandrel-a"), select(spandrelPick.lessThan(0.67), colour("render-spandrel-b"), colour("render-spandrel-c")));
  const ribbonTop = storey.mul(0.8);
  const ribbonBottom = storey.mul(0.34);
  const middle = ribbonBottom.add(ribbonTop).mul(0.5);
  const halfTall = ribbonTop.sub(ribbonBottom).mul(0.5);
  const height = floorUp.sub(ribbonBottom).div(halfTall.mul(2));
  const windowFloor = (offset: Value, half: Value) => courses(wall, up.sub(middle).sub(offset), storey, half);

  const mullionStep = mix(float(1.15), float(1.6), rollB);
  const ribbon = windowFloor(0, halfTall).mul(across(wall, along, 0.9, width.sub(0.9)));
  const ribbonBand = windowFloor(-0.14, halfTall.add(0.28)).mul(across(wall, along, 0.72, width.sub(0.72)));
  const ribbonGlass = glass(wall, height, floor(along.div(mullionStep)).add(level.mul(23)), resolved(wall.wide, mullionStep).mul(storeysShow));
  const ribbonColour = mix(ribbonGlass, colour("wall-trim"), columns(wall, along, mullionStep, 0.035));
  const ribbonWall = mix(mix(out, spandrel, ribbonBand), ribbonColour, ribbon);

  const bay = width.div(max(float(1), round(width.div(mix(float(2.8), float(3.5), rollB)))));
  const halfWide = mix(float(0.62), float(0.95), rollA);
  const windowRow = (half: Value) => columns(wall, along.sub(bay.mul(0.5)), bay, half);
  const punched = windowRow(halfWide).mul(windowFloor(0, halfTall.add(0.02)));
  const punchedFrame = windowRow(halfWide.add(0.05)).mul(windowFloor(0, halfTall.add(0.07)));
  const punchedGlass = glass(wall, height, floor(along.div(bay)).add(level.mul(19)), resolved(wall.wide, bay).mul(storeysShow));
  const punchedColour = mix(punchedGlass, colour("wall-trim"), columns(wall, along.sub(bay.mul(0.5)), bay, 0.025));
  const punchedWall = mix(mix(out, colour("wall-trim"), punchedFrame), punchedColour, punched);
  out = mix(out, select(rollA.lessThan(0.48), ribbonWall, punchedWall), body);

  // Balconies stacked in columns on a long facade: a dark recess with a door, a slab, a parapet panel, a shadow under.
  const every = mix(float(7.2), float(10.8), rollA);
  const balconyHalf = mix(float(1.5), float(2.1), rollB);
  const fromStack = fract(along.div(every).add(0.25)).sub(0.5).mul(every);
  const hasStack = step(9, width).mul(step(1.5, storeys));
  const inStack = columns(wall, along.sub(every.mul(0.25)), every, balconyHalf).mul(hasStack).mul(body).mul(rising(wall, up, storey, 1000));
  const recess = colour("balcony-dark");
  const balconyDoor = across(wall, fromStack.sub(0.5), -0.42, 0.42).mul(courses(wall, up.sub(1.15), storey, 1.05));
  const railKind = fract(rollA.mul(7.1));
  const railColour = select(railKind.lessThan(0.4), colour("balcony-slab"), select(railKind.lessThan(0.7), spandrel, colour("sky").mul(0.62)));
  const rail = courses(wall, up.sub(0.585), storey, 0.465);
  const railRib = columns(wall, fromStack, 0.2, 0.02).mul(0.16).mul(step(0.7, railKind));
  const slab = courses(wall, up.sub(0.06), storey, 0.06);
  const shade = courses(wall, up.add(0.275), storey, 0.275).mul(0.5);
  const balcony = mix(mix(mix(recess, recess.mul(1.6), balconyDoor), railColour.mul(float(1).sub(railRib)), rail), colour("balcony-slab"), slab);
  out = mix(out, mix(balcony, balcony.mul(0.72), shade), inStack);

  // A stair: a tall column of glass over the entrance, and the entrance itself.
  const stair = rect(wall, fromCentre, 0.55, up.sub(eaves.mul(0.5).add(0.3)), eaves.mul(0.5).sub(0.9)).mul(wall.hasDoor).mul(step(1.5, storeys));
  const stairFloors = courses(wall, up, storey, storey.mul(0.06)).mul(0.6);
  const stairGlass = glass(wall, up.div(eaves), wall.seed, float(1));
  out = mix(out, mix(stairGlass, colour("wall-trim"), stairFloors), stair);
  const entrance = rect(wall, fromCentre, 0.95, up.sub(1.15), 1.15).mul(wall.hasDoor);
  out = mix(out, mix(colour("wall-glass"), colour("wall-trim"), across(wall, fromCentre, -0.04, 0.04)), entrance);

  // A coping along the top and a dark base.
  out = mix(out, colour("balcony-slab"), rising(wall, eaves.sub(up), -0.2, 0.22));
  return mix(out, colour("wall-plinth"), under(wall, up, 0.75));
}

/** Glass in a metal grid, with whole bays of panel, some of them timber. */
function curtain(wall: Wall): V3 {
  const { along, up, eaves, fromCentre, paint, rollA, rollB, colour } = wall;
  const storeys = max(float(1), round(eaves.div(3.4)));
  const storey = eaves.div(storeys);
  const cellWide = mix(float(1.2), float(1.6), rollA);
  const bayWide = mix(float(4.2), float(7.8), rollB);
  const panelShare = mix(float(0.22), float(0.55), rollB);
  const panelRoll = roll(4, floor(along.div(bayWide)), wall.seed, floor(up.div(storey).div(mix(float(1), float(3), rollA))));
  // Which bays are panel is a roll per bay: once bays are small that's the mix of the two, as the eye sees it.
  const baysShow = resolved(wall.wide, bayWide).mul(resolved(wall.tall, storey));
  const isPanel = mix(panelShare, step(panelRoll, panelShare), baysShow);
  const lightPanel = mix(float(0.5), step(panelRoll, panelShare.mul(0.5)), baysShow);
  const panelColour = mix(paint, mix(colour("panel-light"), colour("panel-wood"), step(0.72, rollA)), lightPanel);
  const joints = max(columns(wall, along.sub(cellWide.mul(0.5)), cellWide, 0.012), courses(wall, up, 0.8, 0.015));
  const panel = mix(panelColour, panelColour.mul(0.74), joints);
  // Glass takes the sky at the top of the wall and the street's dark at the foot, one big reflection across all the panes.
  const reflection = up.div(eaves).clamp(0, 1).add(sin(along.mul(0.17).add(up.mul(0.05))).mul(0.14)).clamp(0, 1);
  const sheet = mix(colour("curtain-glass"), colour("sky"), reflection.mul(reflection).mul(0.62));
  const paneTint = mix(float(1), mix(float(0.9), float(1.1), roll(5, floor(along.div(cellWide)), floor(up.div(storey)))), resolved(wall.wide, cellWide).mul(resolved(wall.tall, storey)));
  const tinted = sheet.mul(paneTint);
  const spandrel = courses(wall, up.sub(storey.mul(0.08)), storey, 0.32);
  const glazed = mix(tinted, tinted.mul(0.72), spandrel);
  const grid = max(columns(wall, along.sub(cellWide.mul(0.5)), cellWide, 0.045), courses(wall, up, storey, 0.07));
  let out: V3 = mix(mix(glazed, colour("curtain-frame"), grid), panel, isPanel);
  const entrance = rect(wall, fromCentre, 1.3, up.sub(1.25), 1.25).mul(wall.hasDoor);
  const canopy = rect(wall, fromCentre, 1.9, up.sub(2.72), 0.12).mul(wall.hasDoor);
  out = mix(out, mix(colour("wall-glass"), colour("curtain-frame"), across(wall, fromCentre, -0.05, 0.05)), entrance);
  out = mix(out, colour("curtain-frame"), canopy);
  out = mix(out, colour("curtain-frame"), rising(wall, eaves.sub(up), -0.2, 0.26));
  return mix(out, colour("wall-plinth"), under(wall, up, 0.35));
}

/** A big box: ribbed sheet in long panels, a concrete base, a strip of light and a band of colour at the top. */
function hall(wall: Wall): V3 {
  const { along, up, width, eaves, fromCentre, paint, rollA, rollB, colour } = wall;
  const ribStep = mix(float(0.24), float(0.36), rollB);
  const rib = abs(fract(along.div(ribStep)).sub(0.5)).mul(2);
  // A rib's light and shade, and its average once ribs are finer than a pixel.
  const ribShade = mix(float(0.96), mix(float(0.84), float(1.04), smoothstep(float(0.25), float(0.55), rib)), resolved(wall.wide, ribStep));
  const flatJoint = float(1).sub(courses(wall, up, 1.1, 0.02).mul(0.3));
  const surface = mix(ribShade, flatJoint, step(0.7, rollA));
  const seamStep = mix(float(5.5), float(8.5), rollA);
  const seam = roll(6, floor(along.div(seamStep)), wall.seed).sub(0.5).mul(0.05).mul(resolved(wall.wide, seamStep)).add(1);
  let out: V3 = paint.mul(surface.mul(seam));
  const fromEaves = eaves.sub(up);
  const accent = rising(wall, fromEaves, 0.1, 0.72).mul(step(0.35, rollB));
  out = mix(out, select(step(0.6, fract(rollA.mul(3.3))).greaterThan(0.5), colour("clad-accent"), colour("clad-dark")), accent);
  out = mix(out, colour("clad-dark"), rising(wall, fromEaves, -0.2, 0.1));
  // A strip of daylight panels high on the wall, broken every few metres.
  const strip = rising(wall, up, eaves.sub(1.9), eaves.sub(1.25)).mul(float(1).sub(columns(wall, along.sub(3), 6, 1.32))).mul(step(rollB, float(0.55))).mul(across(wall, along, 1.2, width.sub(1.2)));
  out = mix(out, mix(colour("wall-glass"), colour("sky"), float(0.3)), strip);
  // Roller doors at a seeded rhythm on the door facade, with a walk-in door beside the middle.
  const doorEvery = mix(float(14), float(26), rollA);
  const roller = columns(wall, along.sub(doorEvery.mul(float(0.5).sub(rollB))), doorEvery, 2.1).mul(under(wall, up, 4.2)).mul(step(12, width));
  const slats = float(1).sub(courses(wall, up, 0.3, 0.02).mul(0.3));
  out = mix(out, paint.mul(0.78).mul(slats), roller.mul(wall.hasDoor));
  const walkIn = rect(wall, fromCentre.sub(3.3), 0.5, up.sub(1.05), 1.05).mul(wall.hasDoor);
  out = mix(out, colour("clad-dark"), walkIn);
  return mix(out, colour("clad-base"), under(wall, up, mix(float(0.5), float(1.15), rollA)));
}

/** Barn boards of three kinds, weathered by the plank, on a fieldstone foot, with a braced double door and a hay hatch. */
function barn(wall: Wall): V3 {
  const { along, up, width, eaves, fromCentre, paint, rollA, rollB, colour } = wall;
  const kind = fract(rollA.mul(3.1));
  const boardsShow = resolved(wall.wide, 0.3);
  // Boards of uneven width: a cell's edge is moved by its own roll.
  const cellX = along.div(0.3);
  const cell = floor(cellX);
  const edge = roll(7, cell, wall.seed).mul(0.5).add(0.25);
  const within = fract(cellX);
  const plankTone = roll(8, cell, step(within, edge)).sub(0.5).mul(0.24).mul(boardsShow).add(1);
  const unevenLines = max(smoothstep(float(0.03), float(0), abs(within.sub(edge))), smoothstep(float(0.96), float(1), within));
  const uneven = float(1).sub(mix(float(0.03), unevenLines, boardsShow).mul(0.42));
  const batten = float(1).sub(columns(wall, along, 0.46, 0.035).mul(0.4));
  const lap = float(1).sub(courses(wall, up, 0.19, 0.015).mul(0.38));
  const lines = select(kind.lessThan(0.5), uneven, select(kind.lessThan(0.8), batten, lap));
  const age = roll(9, floor(along.div(2.3)), wall.seed).mul(0.1).mul(resolved(wall.wide, 2.3));
  const streak = mix(float(0.84).sub(age), float(1), smoothstep(float(0), float(2.4), up));
  let out: V3 = paint.mul(plankTone.mul(lines)).mul(streak);

  // A double door with its brace, and a hatch high in the gable.
  const doorHalf = min(width.mul(0.2), float(1.9));
  const doorTall = min(eaves.sub(0.3), float(3.1));
  const doorAt = fromCentre.add(width.mul(rollB.sub(0.5)).mul(0.4));
  const big = step(5, width);
  const door = rect(wall, doorAt, doorHalf, up.sub(doorTall.mul(0.5)), doorTall.mul(0.5)).mul(big);
  const leaf = fract(doorAt.div(doorHalf).mul(0.5).add(0.5).mul(2));
  const braceY = up.div(doorTall).clamp(0, 1);
  const braceSharp = max(inside(wall, abs(leaf.sub(braceY)).sub(0.05)), inside(wall, abs(float(1).sub(leaf).sub(braceY)).sub(0.05)));
  const brace = outline(wall, braceSharp, float(1), 0.19, doorHalf.mul(0.5));
  const frame = max(across(wall, abs(doorAt).sub(doorHalf), -0.07, 0.07), rising(wall, up.sub(doorTall), -0.07, 0.07));
  out = mix(out, mix(mix(out.mul(0.66), out.mul(1.25), brace), out.mul(1.35), frame), door);
  const hatch = rect(wall, fromCentre, 0.75, up.sub(eaves).sub(1.2), 0.65).mul(big);
  out = mix(out, out.mul(0.7), hatch);
  // A small window of four panes every few metres along a long side.
  const every = mix(float(5.5), float(8), rollA);
  const windowUp = up.sub(eaves.mul(0.62).min(1.9));
  // No window where the door is: a window's middle, from the door's.
  const windowAt = floor(along.div(every)).add(0.5).mul(every);
  const showsWindow = step(9, width).mul(step(doorHalf.add(0.6), abs(windowAt.sub(width.mul(0.5)).add(doorAt.sub(fromCentre)))).max(float(1).sub(big)));
  const pane = columns(wall, along.sub(every.mul(0.5)), every, 0.36).mul(rising(wall, windowUp, -0.3, 0.3)).mul(showsWindow);
  const surround = columns(wall, along.sub(every.mul(0.5)), every, 0.46).mul(rising(wall, windowUp, -0.4, 0.4)).mul(showsWindow);
  const barLines = max(columns(wall, along.sub(every.mul(0.5)), every, 0.03), rising(wall, windowUp, -0.03, 0.03));
  out = mix(out, colour("wall-trim"), surround);
  out = mix(out, mix(colour("wall-glass"), colour("wall-trim"), barLines), pane);
  // Fieldstone under it: rows of rounded stones, each its own grey, the rows offset.
  const stoneTop = mix(float(0.55), float(1.0), rollB);
  const row = floor(up.div(0.3));
  const rowsShow = resolved(wall.tall, 0.3);
  const stoneX = along.add(row.mul(0.47 * 0.46));
  const stonesShow = rowsShow.mul(resolved(wall.wide, 0.46));
  const stoneTone = mix(float(0.5), roll(10, floor(stoneX.div(0.46)), row), stonesShow);
  const joint = max(courses(wall, up, 0.3, 0.02), mix(float(0.04 / 0.46), columns(wall, stoneX, 0.46, 0.02), rowsShow));
  const stone = mix(mix(colour("barn-stone"), colour("barn-stone-dark"), stoneTone), colour("barn-stone-dark").mul(0.6), joint);
  return mix(out, stone, under(wall, up, stoneTop));
}

/** Rapakivi laid in rough courses: uneven blocks of pink and grey in pale lime mortar, for churches and their walls. */
function granite(wall: Wall): V3 {
  const { along, up, paint, colour } = wall;
  const courseM = 0.66;
  const course = floor(up.div(courseM));
  const stoneLength = mix(float(1.05), float(1.7), roll(11, course));
  const stoneX = along.div(stoneLength).add(roll(12, course));
  const coursesShow = resolved(wall.tall, courseM);
  const stonesShow = coursesShow.mul(resolved(wall.wide, 1.05));
  // A stone's own colour, and the mix of them, as the eye sees a far wall.
  const pick = roll(13, floor(stoneX), course, wall.seed);
  const tone = select(pick.lessThan(0.5), colour("church-granite-pink"), select(pick.lessThan(0.82), paint, colour("church-granite-grey")));
  const mean = colour("church-granite-pink").mul(0.5).add(paint.mul(0.32)).add(colour("church-granite-grey").mul(0.18));
  const stone = mix(mean, tone.mul(mix(float(0.95), float(1.05), roll(14, floor(stoneX), course))), stonesShow);
  const drift = sin(along.mul(0.31).add(up.mul(0.7))).mul(sin(along.mul(0.13).sub(up.mul(0.29)))).mul(0.05).add(1);
  const headJoint = mix(float(0.035 / 1.35), pulses(stoneX, 1, 0.0175, wall.wide.div(stoneLength)), coursesShow);
  const joint = max(courses(wall, up, courseM, 0.012), headJoint);
  return mix(stone.mul(drift), colour("church-mortar"), joint.mul(0.42));
}

/** A wall in one of the styles here, which its tint says it is. */
export function facadeArt({ along, up, width, eaves, tint, wide, tall, colour, linear }: FacadeInput): V3 {
  const palette = uniformArray(PAINTS.map(linear));
  return Fn(() => {
    const style = round(tint.a.mul(255)).toVar();
    const seed = round(tint.b.mul(255)).toVar();
    const shade = mix(float(0.93), float(1.07), roll(15, seed));
    const drawn: Wall = {
      along,
      up,
      width,
      eaves,
      fromCentre: along.sub(width.mul(0.5)).toVar(),
      wide,
      tall,
      pixel: wide.add(tall).toVar(),
      paint: vec3(palette.element(int(round(tint.r.mul(255)).mod(32))) as unknown as V3).mul(shade).toVar(),
      seed,
      rollA: roll(16, seed, width.mul(100).add(0.5)).toVar(),
      rollB: roll(17, seed).toVar(),
      hasDoor: step(127.5, round(tint.g.mul(255))).toVar(),
      colour,
    };
    const result = vec3(0).toVar();
    If(style.lessThan(STYLE.brick - 0.5), () => {
      result.assign(villa(drawn));
    })
      .ElseIf(style.lessThan(STYLE.block - 0.5), () => {
        result.assign(brick(drawn));
      })
      .ElseIf(style.lessThan(STYLE.glass - 0.5), () => {
        result.assign(block(drawn));
      })
      .ElseIf(style.lessThan(STYLE.hall - 0.5), () => {
        result.assign(curtain(drawn));
      })
      .ElseIf(style.lessThan(STYLE.barn - 0.5), () => {
        result.assign(hall(drawn));
      })
      .ElseIf(style.lessThan(STYLE.granite - 0.5), () => {
        result.assign(barn(drawn));
      })
      .Else(() => {
        result.assign(granite(drawn));
      });
    return result;
  })();
}
