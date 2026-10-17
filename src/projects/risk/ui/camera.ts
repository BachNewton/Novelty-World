/*
 * The map's camera, pure. The map fills the screen and its scale is never the player's to choose:
 * it is the largest at which the whole board shows with no territory under an overlay. When even
 * the smallest scale a fingertip can use can't show it all, the board fills the screen one way
 * and pans the other way only. Across, it wraps as a globe does, repeating every board width.
 *
 * A board whose shape differs from the screen's is stretched to fill it, one way or both: the
 * places territories sit spread apart, while what each draws (its marker, ring and name) keeps its
 * size, so a stretch only ever adds room between them. A board point (x, y) shows at
 * (x * stretch.x * scale + left, y * stretch.y * scale + top) in CSS pixels of the map's box, and,
 * panning across, at every stretched board width's worth of pixels either side of that too.
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

/** How far the board's places spread apart, along each way. */
export interface Stretch {
  x: number;
  y: number;
}

/** How the board sits: all of it shown, panned across (wrapping, so without bounds), or panned
 *  up and down with its top edge between `min` and `max`. */
export type Pan = { axis: "none" } | { axis: "x" } | { axis: "y"; min: number; max: number };

export interface Frame {
  camera: Camera;
  pan: Pan;
  stretch: Stretch;
}

export interface Scene {
  board: Size;
  view: Size;
  /** What floats over the map, in the box's CSS pixels. */
  overlays: readonly Rect[];
  /** Where each territory sits, in board units. */
  places: readonly BoardPoint[];
  /** What each territory draws round its place (its marker, ring and name), in board units from
   *  it: kept clear of the overlays. */
  draws: readonly Rect[];
  /** The least scale a fingertip can use: every territory far enough from the next. */
  touch: number;
}

/** An overlay this near an edge of the box is anchored to it, so it covers that edge's band. */
const EDGE = 32;
/** How much smaller each scale tried is than the last, looking for one that clears the overlays. */
const SHRINK = 0.98;
/** How many places along each axis a board smaller than the box is tried at. */
const PLACES = 12;
/** The most the board stretches one way beyond the other: past it, its shape stops reading as
 *  the board players learn. */
const MOST_STRETCH = 2;
/** How many stretches along each way are tried, from the most down to none. */
const STRETCHES = 8;
/** The most of its size the board gives up to fill more of the screen, and how much more of it
 *  that must fill. */
const TRADE = 0.85;
const GAIN = 1.05;

const NONE: Stretch = { x: 1, y: 1 };

const overlaps = (a: Rect, b: Rect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/** The board's size as it is drawn, in board units: its places spread by the stretch. */
export function stretched(board: Size, stretch: Stretch): Size {
  return { width: board.width * stretch.x, height: board.height * stretch.y };
}

function clearAt(scene: Scene, camera: Camera, stretch: Stretch): boolean {
  const { scale } = camera;
  return scene.places.every((p, i) => {
    const d = scene.draws[i];
    const x = p.x * stretch.x * scale + camera.left;
    const y = p.y * stretch.y * scale + camera.top;
    const shown = { left: x + d.left * scale, top: y + d.top * scale, right: x + d.right * scale, bottom: y + d.bottom * scale };
    return scene.overlays.every((o) => !overlaps(shown, o));
  });
}

/** Where a board at `scale` and `stretch` can sit with every territory clear of the overlays, as
 *  near the middle of the box as it can; null when nowhere. */
function clearPlace(scene: Scene, scale: number, stretch: Stretch): Camera | null {
  const size = stretched(scene.board, stretch);
  const slackX = scene.view.width - size.width * scale;
  const slackY = scene.view.height - size.height * scale;
  const places: Camera[] = [];
  for (let i = 0; i <= PLACES; i++) for (let j = 0; j <= PLACES; j++) places.push({ scale, left: (slackX * i) / PLACES, top: (slackY * j) / PLACES });
  const off = (c: Camera) => Math.hypot(c.left - slackX / 2, c.top - slackY / 2);
  places.sort((a, b) => off(a) - off(b));
  return places.find((camera) => clearAt(scene, camera, stretch)) ?? null;
}

/** The stretches a board at `scale` can take and still fit the box, the roomiest first. */
function stretchesAt(scene: Scene, scale: number): Stretch[] {
  const most = (room: number, size: number) => Math.max(1, Math.min(MOST_STRETCH, room / (size * scale)));
  const steps = (top: number) => Array.from({ length: STRETCHES }, (_, i) => top - ((top - 1) * i) / (STRETCHES - 1));
  const out: Stretch[] = [];
  for (const x of steps(most(scene.view.width, scene.board.width)))
    for (const y of steps(most(scene.view.height, scene.board.height))) if (Math.max(x / y, y / x) <= MOST_STRETCH) out.push({ x, y });
  return out.sort((a, b) => b.x * b.y - a.x * a.y);
}

/** How far the overlays anchored to the top and the bottom of the box reach into it. */
function bands(scene: Pick<Scene, "overlays" | "view">): { top: number; bottom: number } {
  const { overlays, view } = scene;
  const top = Math.max(0, ...overlays.filter((o) => o.top <= EDGE).map((o) => o.bottom));
  const bottom = Math.max(0, ...overlays.filter((o) => o.bottom >= view.height - EDGE).map((o) => view.height - o.top));
  return { top, bottom };
}

/** The roomiest way a board at `scale` shows whole, clear of the overlays; null when none does. */
function wholeAt(scene: Scene, scale: number): Frame | null {
  for (const stretch of stretchesAt(scene, scale)) {
    const camera = clearPlace(scene, scale, stretch);
    if (camera) return { camera, pan: { axis: "none" }, stretch };
  }
  return null;
}

/** Where the board sits on this screen, as it starts: its territories as large as they can be,
 *  spread as far as the screen has room for. A little of their size is given up where that
 *  spreads the board over clearly more of the screen. */
export function frameBoard(scene: Scene): Frame {
  const { board, view, touch } = scene;
  const fit = Math.min(view.width / board.width, view.height / board.height);
  const covers = ({ camera, stretch }: Frame) => board.width * stretch.x * board.height * stretch.y * camera.scale ** 2;
  for (let scale = fit; scale >= touch; scale *= SHRINK) {
    let best = wholeAt(scene, scale);
    if (!best) continue;
    for (let smaller = scale * SHRINK; smaller >= Math.max(touch, scale * TRADE); smaller *= SHRINK) {
      const other = wholeAt(scene, smaller);
      if (other && covers(other) > covers(best) * GAIN) best = other;
    }
    return best;
  }

  // Panning across, the board fills the height between the overlays along the top and bottom.
  const band = bands(scene);
  const across = Math.max(touch, (view.height - band.top - band.bottom) / board.height);
  if (board.width * across >= view.width) {
    const top = band.top + (view.height - band.top - band.bottom - board.height * across) / 2;
    return panBy({ camera: { scale: across, left: (view.width - board.width * across) / 2, top }, pan: { axis: "x" }, stretch: NONE }, 0, 0, board);
  }

  // Panning up and down, it fills the width, and pans far enough to bring every territory out
  // from under the overlays along the top and bottom.
  const scale = Math.max(touch, view.width / board.width);
  const pan = { axis: "y" as const, min: view.height - band.bottom - board.height * scale, max: band.top };
  return { camera: { scale, left: (view.width - board.width * scale) / 2, top: (pan.min + pan.max) / 2 }, pan, stretch: NONE };
}

/** Moves the board by a drag, along the way it pans only. */
export function panBy(frame: Frame, dx: number, dy: number, board: Size): Frame {
  const { camera, pan } = frame;
  if (pan.axis === "x") {
    const period = stretched(board, frame.stretch).width * camera.scale;
    return { ...frame, camera: { ...camera, left: (((camera.left + dx) % period) + period) % period - period } };
  }
  if (pan.axis === "y") return { ...frame, camera: { ...camera, top: Math.min(pan.max, Math.max(pan.min, camera.top + dy)) } };
  return frame;
}

/** The horizontal offsets the board is drawn at to cover the box: one, or, panning across, as
 *  many copies as reach it. */
export function copies(frame: Frame, board: Size, view: Size): number[] {
  if (frame.pan.axis !== "x") return [frame.camera.left];
  const period = stretched(board, frame.stretch).width * frame.camera.scale;
  const out: number[] = [];
  for (let left = frame.camera.left; left < view.width; left += period) if (left + period > 0) out.push(left);
  return out;
}

export function toScreen(frame: Frame, point: BoardPoint): BoardPoint {
  const { camera, stretch } = frame;
  return { x: point.x * stretch.x * camera.scale + camera.left, y: point.y * stretch.y * camera.scale + camera.top };
}

export function toBoard(frame: Frame, screen: BoardPoint): BoardPoint {
  const { camera, stretch } = frame;
  return { x: (screen.x - camera.left) / camera.scale / stretch.x, y: (screen.y - camera.top) / camera.scale / stretch.y };
}

/** The least pan that brings a board point at least `margin` pixels inside the box, clear of the
 *  overlays along its top and bottom; panning across, to whichever copy of it is nearer. */
export function keepInView(frame: Frame, point: BoardPoint, margin: number, scene: Pick<Scene, "board" | "view" | "overlays">): Frame {
  const { pan } = frame;
  const { view, board } = scene;
  if (pan.axis === "none") return frame;
  const at = toScreen(frame, point);
  if (pan.axis === "x") {
    const period = stretched(board, frame.stretch).width * frame.camera.scale;
    const m = Math.min(margin, view.width / 2);
    const xs = [at.x - period, at.x, at.x + period];
    if (xs.some((x) => x >= m && x <= view.width - m)) return frame;
    const dx = xs.map((x) => (x < m ? m - x : view.width - m - x)).reduce((a, b) => (Math.abs(a) <= Math.abs(b) ? a : b));
    return panBy(frame, dx, 0, board);
  }
  const band = bands(scene);
  const low = band.top + margin;
  const high = view.height - band.bottom - margin;
  const dy = at.y < low ? low - at.y : at.y > high ? high - at.y : 0;
  return dy === 0 ? frame : panBy(frame, 0, dy, board);
}

/** The board point in the middle of the box. */
export function centreOf(frame: Frame, view: Size, board: Size): BoardPoint {
  const middle = toBoard(frame, { x: view.width / 2, y: view.height / 2 });
  return { x: ((middle.x % board.width) + board.width) % board.width, y: middle.y };
}
