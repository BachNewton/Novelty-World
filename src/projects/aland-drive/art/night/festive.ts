import { abs, atan, float, floor, fract, If, length, min, mix, select, smoothstep, vec2, vec3 } from "three/tsl";
import type { Node } from "three/webgpu";
import { seedOf, unitOf } from "../hash";
import { changeOf, type SeasonNodes } from "../season";
import { band, pulses } from "../surfaces/coverage";
import { nightColour, type F, type Night, type V3 } from "./night";

/*
 * The winter's lights on a house, for the wall shader (`render/buildings.ts`, `art/facades`): an electric Advent
 * candlestick on a window's sill or a paper star hung high in it, and a string of lights along the eaves. Each is drawn
 * as its share of the pixel (`art/surfaces/coverage.ts`), so a candlestick's seven bulbs read near and settle into the
 * pane's warm glow far off without shimmer. A home dresses its windows when the season's share of windows reaches its
 * own threshold, rolled from the building, and its eaves when the share of homes does: a street comes alight house by
 * house. Candlesticks and stars stay lit all night, as they're left; the eaves' strings are on timers, and some go off
 * in the small hours.
 */

const SALT = { home: 7101, pane: 7102, kind: 7103, advent: 7104, string: 7105, side: 7106, colours: 7107, hue: 7108, late: 7109 } as const;

/** Of a dressed home's windows, the share with something in them. */
const PANES_DRESSED = 0.55;
/** Of those, the share with a candlestick rather than a star, and of the candlesticks the share that are Advent's four candles. */
const CANDLESTICKS = 0.55;
const FOUR_CANDLES = 0.3;
/** What a candlestick or star shows by day, lit behind glass in the daylight, against its full glow at dusk. */
const DAY_SHINE = 0.22;

const CANDLE_STEP_M = 0.068;
const CANDLE_HALF_M = 0.0085;
const BULB_HALF_M = 0.013;
const BULB_TALL_M = 0.042;
const CANDLESTICK_BASE_M = 0.045;
const ADVENT_STEP_M = 0.12;
const BULB = 2.6;

const STAR_DROP_M = 0.1;
const STAR_RADIUS_M = 0.17;
const STAR_POINTS = 5;
const STAR = 1.25;

const STRING_DROP_M = 0.12;
const STRING_HOOK_M = 1.3;
const STRING_SAG_M = 0.08;
const STRING_BULB_EVERY_M = 0.2;
const STRING_BULB_HALF_M = 0.016;
const STRING = 2.4;
/** The wall under a string, lit by it: a band that reads from down the street, where the bulbs themselves are too small. */
const STRING_WASH_M = 0.45;
const STRING_WASH = 0.09;
/** The share of strings in colours rather than warm white, and of the strings that go off in the small hours. */
const COLOURED_STRINGS = 0.2;
const STRINGS_OFF_LATE = 0.4;
/** The share of dressed homes whose string goes all the way round, not only along the front. */
const ALL_ROUND = 0.35;

/** What a wall's season says about its lights: the dials, and how much its look is a home's. */
export interface WinterWall {
  season: SeasonNodes;
  /** 0 to 1: how likely a building of this look is to dress its windows (a villa's high, an office's low). */
  windows: F;
  /** The same for a string along its eaves. */
  eaves: F;
}

/** A pane in its own metres, for what stands in it. */
export interface PaneFrame {
  /** From the pane's middle, along the wall. */
  x: F;
  /** Up from the pane's foot, and the pane's height. */
  y: F;
  height: F;
  /** How far a pixel reaches along the wall and up it. */
  wide: F;
  tall: F;
}

/** What stands in a window: the light it gives, and how much of the room's light behind it it hides. */
export interface WindowDressing {
  glow: V3;
  cover: F;
}

const shine = (night: Night): F => mix(float(DAY_SHINE), float(1), smoothstep(float(0.25), float(0.6), night.amount));

/** 1 for a home that has dressed its windows this far into the season. */
const dressedHome = (winter: WinterWall, building: F): F => changeOf(winter.season.lightsWindows.mul(winter.windows), unitOf(seedOf(building), SALT.home));

/** The seven-light stepped candlestick, its foot on the sill, or Advent's four candles lit as far as the Sundays have come. */
function candlestick(night: Night, winter: WinterWall, room: Node<"uint">, { x, y, wide, tall }: PaneFrame): WindowDressing {
  const advent = unitOf(room, SALT.advent).lessThan(FOUR_CANDLES);
  const halfRow = select(advent, float(ADVENT_STEP_M * 2), float(CANDLE_STEP_M * 3.5));
  const step = select(advent, float(ADVENT_STEP_M), float(CANDLE_STEP_M));
  const inRow = band(x, halfRow.negate(), halfRow, wide);
  // A seven-light steps down from its middle; Advent's four stand level.
  const fromMiddle = min(floor(abs(x).div(CANDLE_STEP_M).add(0.5)), float(3));
  const top = select(advent, float(CANDLESTICK_BASE_M + 0.1), float(CANDLESTICK_BASE_M + 0.07).add(float(3).sub(fromMiddle).mul(0.035)));
  // The seven-light has a candle on its middle; Advent's four stand either side of it, so their row is shifted half a step, and counted from the left as they're lit.
  const row = select(advent, x.add(ADVENT_STEP_M * 1.5), x);
  const candle = floor(x.add(ADVENT_STEP_M * 2).div(ADVENT_STEP_M));
  const candleLit = select(advent, select(candle.lessThan(winter.season.adventCandles.sub(0.5)), float(1), float(0)), float(1));
  const candles = pulses(row, step, CANDLE_HALF_M * 1.4, wide).mul(band(y, CANDLESTICK_BASE_M, top, tall)).mul(inRow);
  const bulbs = pulses(row, step, BULB_HALF_M, wide).mul(band(y, top, top.add(BULB_TALL_M), tall)).mul(inRow);
  const stepped = band(y, 0, select(advent, float(CANDLESTICK_BASE_M), mix(float(CANDLESTICK_BASE_M), top, 0.32)), tall).mul(inRow);
  const halo = float(1).sub(length(vec2(x.div(halfRow.add(0.12)), y.sub(0.13).div(0.2)))).max(0);
  const flame = nightColour("candle");
  const glow = flame
    .mul(bulbs.mul(BULB).mul(candleLit))
    .add(flame.mul(candles.mul(0.32).add(stepped.mul(0.12))))
    .add(flame.mul(halo.mul(halo).mul(0.32)));
  return { glow: glow.mul(shine(night)), cover: stepped.add(candles).min(1).mul(0.85) };
}

/** A paper star hung high in the window on its cord, lit from within. */
function star(night: Night, room: Node<"uint">, { x, y, height, wide, tall }: PaneFrame): WindowDressing {
  const radius = min(float(STAR_RADIUS_M), height.mul(0.16));
  const middle = height.sub(STAR_DROP_M).sub(radius);
  const from = vec2(x, y.sub(middle));
  const reach = length(from);
  // Fifths of a turn, from 0 at a point to 1 between two, the first point straight up.
  const turn = fract(atan(from.y, from.x).mul(STAR_POINTS / (2 * Math.PI)).add(0.75));
  const point = abs(turn.sub(0.5)).mul(2);
  const edge = radius.mul(mix(float(0.46), float(1), point));
  const pixel = wide.add(tall);
  const sharp = float(1).sub(smoothstep(pixel.mul(-0.5), pixel.mul(0.5), reach.sub(edge)));
  const box = band(x, radius.negate(), radius, wide).mul(band(y.sub(middle), radius.negate(), radius, tall));
  const far = smoothstep(radius.mul(0.15), radius.mul(0.6), pixel);
  const shape = mix(sharp, box.mul(0.5), far);
  const within = mix(mix(float(1.5), float(0.75), reach.div(radius).clamp(0, 1)), float(1), far);
  const cord = band(x, -0.005, 0.005, wide).mul(band(y, middle.add(radius.mul(0.9)), height, tall));
  const halo = float(1).sub(reach.div(radius.mul(2.4))).max(0);
  const paper = select(unitOf(room, SALT.hue).lessThan(0.25), nightColour("star-red"), nightColour("star"));
  const glow = paper.mul(shape.mul(within).mul(STAR).add(halo.mul(halo).mul(0.3).mul(float(1).sub(far))));
  return { glow: glow.mul(shine(night)), cover: shape.add(cord).min(1).mul(0.9) };
}

/** What a pane holds: a candlestick, a star or nothing, chosen by the pane once its home has dressed its windows. */
export function windowDressing(night: Night, winter: WinterWall, building: F, room: Node<"uint">, pane: PaneFrame): WindowDressing {
  const dressed = dressedHome(winter, building).mul(select(unitOf(room, SALT.pane).lessThan(PANES_DRESSED), float(1), float(0)));
  const isCandlestick = unitOf(room, SALT.kind).lessThan(CANDLESTICKS);
  const stick = candlestick(night, winter, room, pane);
  const hung = star(night, room, pane);
  return {
    glow: select(isCandlestick, stick.glow, hung.glow).mul(dressed),
    cover: select(isCandlestick, stick.cover, hung.cover).mul(dressed),
  };
}

/** What a dressed home's windows add to a wall too far off for its panes: a little more warmth. */
export function farDressing(night: Night, winter: WinterWall, building: F): V3 {
  return nightColour("candle").mul(dressedHome(winter, building).mul(shine(night)).mul(0.05));
}

export interface EavesInput {
  along: F;
  up: F;
  width: F;
  eaves: F;
  wide: F;
  tall: F;
  building: F;
  /** 1 on the wall with the front door. */
  front: F;
}

/** A string of lights along a dressed home's eaves, hung in shallow loops between hooks, and the wall it lights. */
function eavesString(night: Night, winter: WinterWall, { along, up, width, eaves, wide, tall, building, front }: EavesInput): V3 {
  const seed = seedOf(building);
  const round = select(unitOf(seed, SALT.side).lessThan(ALL_ROUND), float(1), front);
  const hung = changeOf(winter.season.lightsHomes.mul(winter.eaves), unitOf(seed, SALT.string)).mul(round);
  const late = select(unitOf(seed, SALT.late).lessThan(STRINGS_OFF_LATE), night.late, float(0));
  const on = hung.mul(night.lampsOn).mul(float(1).sub(late));
  const loop = fract(along.div(STRING_HOOK_M));
  const line = eaves.sub(STRING_DROP_M).sub(loop.mul(float(1).sub(loop)).mul(4 * STRING_SAG_M));
  const span = band(along, 0.2, width.sub(0.2), wide);
  const bulbs = pulses(along.sub(STRING_BULB_EVERY_M * 0.5), STRING_BULB_EVERY_M, STRING_BULB_HALF_M, wide).mul(band(up, line.sub(STRING_BULB_HALF_M * 1.4), line.add(STRING_BULB_HALF_M * 1.4), tall));
  const wash = band(up, line.sub(STRING_WASH_M), line, tall).mul(smoothstep(line.sub(STRING_WASH_M), line, up));
  const bulb = floor(along.div(STRING_BULB_EVERY_M)).mod(4);
  const coloured = select(
    bulb.lessThan(0.5),
    nightColour("string-red"),
    select(bulb.lessThan(1.5), nightColour("string-green"), select(bulb.lessThan(2.5), nightColour("string-blue"), nightColour("string-amber"))),
  );
  const isColoured = unitOf(seed, SALT.colours).lessThan(COLOURED_STRINGS);
  // Far off, a coloured string's bulbs blur into their mix: the warm white stands in for it.
  const bulbColour = select(isColoured, mix(coloured, nightColour("string-warm"), smoothstep(float(STRING_BULB_EVERY_M * 0.5), float(STRING_BULB_EVERY_M * 2), wide)), nightColour("string-warm"));
  return bulbColour.mul(bulbs.mul(STRING)).add(nightColour("string-warm").mul(wash.mul(STRING_WASH))).mul(span).mul(on);
}

/** `eavesString`, skipped by every wall out of season: the dial is a uniform, so the branch is the same for every pixel. */
export function eavesLights(night: Night, winter: WinterWall, input: EavesInput): V3 {
  const light = vec3(0).toVar();
  If(winter.season.lightsHomes.greaterThan(0), () => {
    light.assign(eavesString(night, winter, input));
  });
  return light;
}
