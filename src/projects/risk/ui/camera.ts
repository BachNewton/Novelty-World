/*
 * The map's camera, pure: where the board sits on the screen and how large. A board point
 * (x, y) shows at (x * scale + left, y * scale + top) in CSS pixels of the map's box.
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

/** How far in a camera zooms, as a multiple of the whole board fitting the box. */
export const MAX_ZOOM = 6;

/** The scale at which the whole board fits the box. */
export function fitScale(board: Size, view: Size): number {
  return Math.min(view.width / board.width, view.height / board.height);
}

/** The scale a camera starts at: the whole board, except in a portrait box (a phone held
 *  upright), where the board would be a thin strip, so it fills the box's height and is panned
 *  across instead. */
export function startScale(board: Size, view: Size): number {
  return view.width < view.height ? view.height / board.height : fitScale(board, view);
}

/** Keeps the board on the screen: never smaller than fitting the box, never past `MAX_ZOOM`,
 *  and centred along an axis it doesn't fill, else with no gap at either edge. */
export function clampCamera(camera: Camera, board: Size, view: Size): Camera {
  const fit = fitScale(board, view);
  const scale = Math.min(fit * MAX_ZOOM, Math.max(fit, camera.scale));
  const axis = (offset: number, boardLength: number, viewLength: number) => {
    const shown = boardLength * scale;
    if (shown <= viewLength) return (viewLength - shown) / 2;
    return Math.min(0, Math.max(viewLength - shown, offset));
  };
  return { scale, left: axis(camera.left, board.width, view.width), top: axis(camera.top, board.height, view.height) };
}

/** A camera at `scale` with the board point in the middle of the box. */
export function centredOn(point: BoardPoint, scale: number, board: Size, view: Size): Camera {
  return clampCamera({ scale, left: view.width / 2 - point.x * scale, top: view.height / 2 - point.y * scale }, board, view);
}

/** Zooms by `factor` about a point of the box, which stays where it is on the screen. */
export function zoomAbout(camera: Camera, factor: number, at: BoardPoint, board: Size, view: Size): Camera {
  const scale = camera.scale * factor;
  const point = toBoard(camera, at);
  return clampCamera({ scale, left: at.x - point.x * scale, top: at.y - point.y * scale }, board, view);
}

export function panBy(camera: Camera, dx: number, dy: number, board: Size, view: Size): Camera {
  return clampCamera({ ...camera, left: camera.left + dx, top: camera.top + dy }, board, view);
}

export function toBoard(camera: Camera, screen: BoardPoint): BoardPoint {
  return { x: (screen.x - camera.left) / camera.scale, y: (screen.y - camera.top) / camera.scale };
}

export function toScreen(camera: Camera, point: BoardPoint): BoardPoint {
  return { x: point.x * camera.scale + camera.left, y: point.y * camera.scale + camera.top };
}

/** The least pan that brings a board point at least `margin` pixels inside the box. */
export function keepInView(camera: Camera, point: BoardPoint, margin: number, board: Size, view: Size): Camera {
  const at = toScreen(camera, point);
  const m = Math.min(margin, view.width / 2, view.height / 2);
  const dx = at.x < m ? m - at.x : at.x > view.width - m ? view.width - m - at.x : 0;
  const dy = at.y < m ? m - at.y : at.y > view.height - m ? view.height - m - at.y : 0;
  return dx === 0 && dy === 0 ? camera : panBy(camera, dx, dy, board, view);
}
