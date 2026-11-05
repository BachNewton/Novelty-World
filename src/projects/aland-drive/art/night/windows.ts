import { float, If, mix, select, smoothstep } from "three/tsl";
import type { Node } from "three/webgpu";
import { seedOf, unitOf } from "../hash";
import { farDressing, windowDressing, type PaneFrame, type WinterWall } from "./festive";
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

const homeIn = (building: F): F => select(unitOf(seedOf(building), 1).greaterThan(DARK_HOUSES), float(1), float(0));

export interface WindowPane {
  /** A whole number that differs from pane to pane of a building. */
  id: F;
  /** A whole number the same across a building and different from the next. */
  building: F;
  /** Up the pane, 0 to 1. */
  up: F;
  /** 1 while panes can be seen, 0 once they've faded to wall. */
  shown: F;
  /** The season's lights, and the pane in its own metres, for a wall whose windows may hold a candlestick or a star. */
  winter?: { wall: WinterWall; frame: PaneFrame };
}

/** 1 for a room lit now. */
function roomLit(night: Night, room: Node<"uint">): F {
  const onAt = mix(float(ROOM_LIT_FROM), float(ROOM_LIT_TO), unitOf(room, 2));
  const off = select(unitOf(room, 3).greaterThan(STILL_UP), float(1), float(0)).mul(night.late);
  return smoothstep(onAt, onAt.add(ROOM_ON_WIDTH), night.amount).mul(float(1).sub(off));
}

/** Added to a wall's colour after its haze, wherever the pane's mask is. */
export function windowLight(night: Night, { id, building, up, shown, winter }: WindowPane): V3 {
  const room = seedOf(id, building);
  const lit = roomLit(night, room).mul(homeIn(building));
  const hue = unitOf(room, 4);
  const warm = mix(mix(nightColour("window-amber"), nightColour("window-warm"), hue.mul(3).clamp(0, 1)), nightColour("window-pale"), hue.sub(0.4).mul(1.6).clamp(0, 1));
  const colour: V3 = select(hue.greaterThan(1 - SCREEN_SHARE), nightColour("window-screen").mul(0.75), warm);
  const shade = mix(float(PANE_FOOT), float(1), up.clamp(0, 1)).mul(unitOf(room, 5).mul(0.55).add(0.55));
  const roomLight = colour.mul(lit).mul(shade).mul(GLOW).mul(shown);
  if (winter === undefined) return roomLight;
  // Out of season every wall skips the dressing's sums: the dial is a uniform, so the branch is the same for every pixel.
  const light = roomLight.toVar();
  If(winter.wall.season.lightsWindows.greaterThan(0), () => {
    const { glow, cover } = windowDressing(night, winter.wall, building, room, winter.frame);
    light.assign(roomLight.mul(float(1).sub(cover)).add(glow.mul(shown)));
  });
  return light;
}

/** Added to a wall past where its panes have faded: a house with people in it, warm and faint, so a town doesn't go dark at a distance. */
export function farWindowLight(night: Night, building: F, shown: F, winter?: WinterWall): V3 {
  const fill = unitOf(seedOf(building), 6).mul(0.7).add(0.3);
  const evening = night.lampsOn.mul(float(1).sub(night.late.mul(0.45)));
  const rooms = nightColour("window-warm").mul(homeIn(building).mul(fill).mul(evening).mul(FAR_GLOW));
  const dressed = winter === undefined ? rooms : rooms.add(farDressing(night, winter, building));
  return dressed.mul(float(1).sub(shown));
}

/** A sign, or a shopfront's lit board: its own colour by day, the same colour lit from within after dark, with the night's sign white where `mask` says the lettering is. */
export function litSign(night: Night, colour: V3, mask: F = float(0)): V3 {
  const glowing: V3 = colour.mul(1.1).add(nightColour("sign").mul(mask.mul(0.6)));
  return mix(colour, glowing, night.lampsOn);
}
