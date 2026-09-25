/**
 * Canvas drawing shared by the play and edit canvases: map tiles and
 * character avatars.
 */

import { CELL_PX } from "./tiles";
import { animSrcCol, sheetForTileSrc } from "./tile-anim";
import { getTileImage } from "./tile-variants";
import {
  idleStripsFor,
  walkStripsFor,
  type AvatarDir,
  type CharacterId,
} from "./characters";
import type { PlacedTile } from "./world-map";

export const AVATAR_FRAME_PX = 64;
const AVATAR_FRAME_COUNT = 6;
const IDLE_FRAME_MS = 200;
const WALK_FRAME_MS = 120;

function isLoaded(img: HTMLImageElement): boolean {
  return img.complete && img.naturalWidth > 0;
}

/** Draw map cell (c, r) at canvas (x, y), `size` px square. */
export function drawTile(
  ctx: CanvasRenderingContext2D,
  tile: PlacedTile,
  c: number,
  r: number,
  x: number,
  y: number,
  size: number,
  nowMs: number,
): void {
  const img = getTileImage(tile.src);
  if (!isLoaded(img)) return;
  const sheet = sheetForTileSrc(tile.src);
  const srcCol = sheet === undefined ? tile.sx : animSrcCol(sheet, tile.sx, nowMs, c, r);
  ctx.drawImage(img, srcCol * CELL_PX, tile.sy * CELL_PX, CELL_PX, CELL_PX, x, y, size, size);
}

export interface AvatarPose {
  characterId: CharacterId;
  dir: AvatarDir;
  flip: boolean;
  moving: boolean;
}

const stripsByCharacter = new Map<CharacterId, { idle: Record<AvatarDir, HTMLImageElement>; walk: Record<AvatarDir, HTMLImageElement> }>();

function loadStrips(srcs: Record<AvatarDir, string>): Record<AvatarDir, HTMLImageElement> {
  const load = (src: string) => {
    const img = new Image();
    img.src = src;
    return img;
  };
  return { front: load(srcs.front), side: load(srcs.side), back: load(srcs.back) };
}

/** All of a character's strips, loaded together on first use so turning or
 * starting to walk never waits on a strip that hasn't been fetched yet. */
function stripsFor(characterId: CharacterId) {
  let strips = stripsByCharacter.get(characterId);
  if (strips === undefined) {
    strips = { idle: loadStrips(idleStripsFor(characterId)), walk: loadStrips(walkStripsFor(characterId)) };
    stripsByCharacter.set(characterId, strips);
  }
  return strips;
}

/**
 * Draw an avatar centred on (centerX, centerY), `size` px square.
 * `animMs` is time into the current idle/walk cycle.
 */
export function drawAvatar(
  ctx: CanvasRenderingContext2D,
  pose: AvatarPose,
  centerX: number,
  centerY: number,
  size: number,
  animMs: number,
): void {
  const strips = stripsFor(pose.characterId);
  const img = (pose.moving ? strips.walk : strips.idle)[pose.dir];
  if (!isLoaded(img)) return;
  const frameMs = pose.moving ? WALK_FRAME_MS : IDLE_FRAME_MS;
  const frame = Math.floor(animMs / frameMs) % AVATAR_FRAME_COUNT;
  // Snap to whole device pixels so pixel art stays crisp.
  const dpr = ctx.getTransform().a;
  const x = Math.round((centerX - size / 2) * dpr) / dpr;
  const y = Math.round((centerY - size / 2) * dpr) / dpr;
  ctx.save();
  if (pose.flip) {
    ctx.translate(2 * x + size, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(img, frame * AVATAR_FRAME_PX, 0, AVATAR_FRAME_PX, AVATAR_FRAME_PX, x, y, size, size);
  ctx.restore();
}
