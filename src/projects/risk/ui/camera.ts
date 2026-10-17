/*
 * The map's camera, pure. The map fills the screen and its scale is never the player's to choose:
 * it is the largest at which the whole board shows with no territory under an overlay. When even
 * the smallest scale a fingertip can use can't show it all, the board fills the screen one way
 * and pans the other way only. Across, it wraps as a globe does, repeating every board width.
 *
 * A board point (x, y) shows at (x * scale + left, y * scale + top) in CSS pixels of the map's
 * box, and, panning across, at every board width's worth of pixels either side of that too.
 */

export interface Camera {
  left: number;
  top: number;
  scale: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface BoardPoint {
  x: number;
  y: number;
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** How the board sits: all of it shown, panned across (wrapping, so without bounds), or panned
 *  up and down with its top edge between `min` and `max`. */
export type Pan = { axis: "none" } | { axis: "x" } | { axis: "y"; min: number; max: number };

export interface Frame {
  camera: Camera;
  pan: Pan;
}

export interface Scene {
  board: Size;
  view: Size;
  /** What floats over the map, in the box's CSS pixels. */
  overlays: readonly Rect[];
  /** What each territory draws (its marker and name), in board units: kept clear of the overlays. */
  footprints: readonly Rect[];
  /** The least scale a fingertip can use: every territory far enough from the next. */
  touch: number;
}

/** An overlay this near an edge of the box is anchored to it, so it covers that edge's band. */
const EDGE = 32;
/** How much smaller each scale tried is than the last, looking for one that clears the overlays. */
const SHRINK = 0.98;
/** How many places along each axis a board smaller than the box is tried at. */
const PLACES = 12;

const overlaps = (a: Rect, b: Rect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

function clearAt(scene: Scene, camera: Camera): boolean {
  return scene.footprints.every((f) => {
    const shown = { left: f.left * camera.scale + camera.left, top: f.top * camera.scale + camera.top, right: f.right * camera.scale + camera.left, bottom: f.bottom * camera.scale + camera.top };
    return scene.overlays.every((o) => !overlaps(shown, o));
  });
}

/** Where a board at `scale` can sit with every territory clear of the overlays, as near the
 *  middle of the box as it can; null when nowhere. */
function clearPlace(scene: Scene, scale: number): Camera | null {
  const slackX = scene.view.width - scene.board.width * scale;
  const slackY = scene.view.height - scene.board.height * scale;
  const places: Camera[] = [];
  for (let i = 0; i <= PLACES; i++) for (let j = 0; j <= PLACES; j++) places.push({ scale, left: (slackX * i) / PLACES, top: (slackY * j) / PLACES });
  const off = (c: Camera) => Math.hypot(c.left - slackX / 2, c.top - slackY / 2);
  places.sort((a, b) => off(a) - off(b));
  return places.find((camera) => clearAt(scene, camera)) ?? null;
}

/** How far the overlays anchored to the top and the bottom of the box reach into it. */
function bands(scene: Scene): { top: number; bottom: number } {
  const { overlays, view } = scene;
  const top = Math.max(0, ...overlays.filter((o) => o.top <= EDGE).map((o) => o.bottom));
  const bottom = Math.max(0, ...overlays.filter((o) => o.bottom >= view.height - EDGE).map((o) => view.height - o.top));
  return { top, bottom };
}

/** Where the board sits on this screen, as it starts. */
export function frameBoard(scene: Scene): Frame {
  const { board, view, touch } = scene;
  const fit = Math.min(view.width / board.width, view.height / board.height);
  for (let scale = fit; scale >= touch; scale *= SHRINK) {
    const camera = clearPlace(scene, scale);
    if (camera) return { camera, pan: { axis: "none" } };
  }

  // Panning across, the board fills the height between the overlays along the top and bottom.
  const band = bands(scene);
  const across = Math.max(touch, (view.height - band.top - band.bottom) / board.height);
  if (board.width * across >= view.width) {
    const top = band.top + (view.height - band.top - band.bottom - board.height * across) / 2;
    return panBy({ camera: { scale: across, left: (view.width - board.width * across) / 2, top }, pan: { axis: "x" } }, 0, 0, board);
  }

  // Panning up and down, it fills the width, and pans far enough to bring every territory out
  // from under the overlays along the top and bottom.
  const scale = Math.max(touch, view.width / board.width);
  const pan = { axis: "y" as const, min: view.height - band.bottom - board.height * scale, max: band.top };
  return { camera: { scale, left: (view.width - board.width * scale) / 2, top: (pan.min + pan.max) / 2 }, pan };
}

/** Moves the board by a drag, along the way it pans only. */
export function panBy(frame: Frame, dx: number, dy: number, board: Size): Frame {
  const { camera, pan } = frame;
  if (pan.axis === "x") {
    const period = board.width * camera.scale;
    return { pan, camera: { ...camera, left: (((camera.left + dx) % period) + period) % period - period } };
  }
  if (pan.axis === "y") return { pan, camera: { ...camera, top: Math.min(pan.max, Math.max(pan.min, camera.top + dy)) } };
  return frame;
}

/** The horizontal offsets the board is drawn at to cover the box: one, or, panning across, as
 *  many copies as reach it. */
export function copies(frame: Frame, board: Size, view: Size): number[] {
  if (frame.pan.axis !== "x") return [frame.camera.left];
  const period = board.width * frame.camera.scale;
  const out: number[] = [];
  for (let left = frame.camera.left; left < view.width; left += period) if (left + period > 0) out.push(left);
  return out;
}

export function toBoard(camera: Camera, screen: BoardPoint): BoardPoint {
  return { x: (screen.x - camera.left) / camera.scale, y: (screen.y - camera.top) / camera.scale };
}

export function toScreen(camera: Camera, point: BoardPoint): BoardPoint {
  return { x: point.x * camera.scale + camera.left, y: point.y * camera.scale + camera.top };
}

/** The least pan that brings a board point at least `margin` pixels inside the box, clear of the
 *  overlays along its top and bottom; panning across, to whichever copy of it is nearer. */
export function keepInView(frame: Frame, point: BoardPoint, margin: number, scene: Pick<Scene, "board" | "view" | "overlays">): Frame {
  const { camera, pan } = frame;
  const { view, board } = scene;
  if (pan.axis === "none") return frame;
  const at = toScreen(camera, point);
  if (pan.axis === "x") {
    const period = board.width * camera.scale;
    const m = Math.min(margin, view.width / 2);
    const xs = [at.x - period, at.x, at.x + period];
    if (xs.some((x) => x >= m && x <= view.width - m)) return frame;
    const dx = xs.map((x) => (x < m ? m - x : view.width - m - x)).reduce((a, b) => (Math.abs(a) <= Math.abs(b) ? a : b));
    return panBy(frame, dx, 0, board);
  }
  const band = bands({ ...scene, footprints: [], touch: 0 });
  const low = band.top + margin;
  const high = view.height - band.bottom - margin;
  const dy = at.y < low ? low - at.y : at.y > high ? high - at.y : 0;
  return dy === 0 ? frame : panBy(frame, 0, dy, board);
}

/** The board point in the middle of the box. */
export function centreOf(camera: Camera, view: Size, board: Size): BoardPoint {
  const middle = toBoard(camera, { x: view.width / 2, y: view.height / 2 });
  return { x: ((middle.x % board.width) + board.width) % board.width, y: middle.y };
}
