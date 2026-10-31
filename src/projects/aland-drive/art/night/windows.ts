import { float, fract, mix, select, sin, smoothstep } from "three/tsl";
import { nightColour, type F, type Night, type V3 } from "./night";

/*
 * Lit windows, for a wall shader that knows which pane a pixel is in. A house is home or it isn't; in one that is, each
 * room comes on at its own moment of the evening and some go out again by the small hours, so a street is warm and
 * sparse, never a lit grid. All of it is rolled from a pane's numbers: there's no state and no list of houses.
 */

/** The share of buildings nobody's home in. */
const DARK_HOUSES = 0.34;
const ROOM_LIT_FROM = 0.42;
const ROOM_LIT_TO = 0.92;
/** Of the rooms that came on, the share still lit at the deepest night. */
const STILL_UP = 0.5;
const ROOM_ON_WIDTH = 0.025;
const SCREEN_SHARE = 0.09;
const GLOW = 1.15;
/** What a wall gains from the rooms lit in it, seen too far off to be panes. */
const FAR_GLOW = 0.16;
const PANE_FOOT = 0.7;

const roll = (value: F): F => fract(sin(value.mul(91.345)).mul(47453.5453));
const homeIn = (building: F): F => select(roll(building.mul(17.3).add(2.7)).greaterThan(DARK_HOUSES), float(1), float(0));

export interface WindowPane {
  /** Any number that differs from pane to pane of a building. */
  id: F;
  /** Any number the same across a building and different from the next. */
  building: F;
  /** Up the pane, 0 to 1. */
  up: F;
  /** 1 while panes can be seen, 0 once they've faded to wall. */
  shown: F;
}

/** 1 for a room lit now. */
function roomLit(night: Night, room: F): F {
  const onAt = mix(float(ROOM_LIT_FROM), float(ROOM_LIT_TO), room);
  const off = select(roll(room.add(4.1)).greaterThan(STILL_UP), float(1), float(0)).mul(smoothstep(float(0.8), float(1), night.amount));
  return smoothstep(onAt, onAt.add(ROOM_ON_WIDTH), night.amount).mul(float(1).sub(off));
}

/** Added to a wall's colour after its haze, wherever the pane's mask is. */
export function windowLight(night: Night, { id, building, up, shown }: WindowPane): V3 {
  const room = roll(id.add(building.mul(113.1)));
  const lit = roomLit(night, room).mul(homeIn(building));
  const hue = roll(room.add(1.3));
  const warm = mix(mix(nightColour("window-amber"), nightColour("window-warm"), hue.mul(3).clamp(0, 1)), nightColour("window-pale"), hue.sub(0.4).mul(1.6).clamp(0, 1));
  const colour: V3 = select(hue.greaterThan(1 - SCREEN_SHARE), nightColour("window-screen").mul(0.75), warm);
  const shade = mix(float(PANE_FOOT), float(1), up.clamp(0, 1)).mul(roll(room.add(7.7)).mul(0.55).add(0.55));
  return colour.mul(lit).mul(shade).mul(GLOW).mul(shown);
}

/** Added to a wall past where its panes have faded: a house with people in it, warm and faint, so a town doesn't go dark at a distance. */
export function farWindowLight(night: Night, building: F, shown: F): V3 {
  const fill = roll(building.add(5.9)).mul(0.7).add(0.3);
  const evening = night.lampsOn.mul(float(1).sub(smoothstep(float(0.8), float(1), night.amount).mul(0.45)));
  return nightColour("window-warm").mul(homeIn(building).mul(fill).mul(evening).mul(float(1).sub(shown)).mul(FAR_GLOW));
}

/** A sign, or a shopfront's lit board: its own colour by day, the same colour lit from within after dark, with the night's sign white where `mask` says the lettering is. */
export function litSign(night: Night, colour: V3, mask: F = float(0)): V3 {
  const glowing: V3 = colour.mul(1.1).add(nightColour("sign").mul(mask.mul(0.6)));
  return mix(colour, glowing, night.lampsOn);
}
