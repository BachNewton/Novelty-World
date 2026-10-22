/*
 * The screen's layout and the map's camera, pure. The board and the game's two panels are one
 * composition, designed once for each orientation, and the scale is the only thing a screen
 * changes; the board is never stretched. A board point (x, y) shows at
 * (x * scale + left, y * scale + top) in CSS pixels of the screen, and, panning across, at every
 * board width's worth of pixels either side of that too.
 *
 * - Landscape: the board is as large as fits, centred, and its two open slots hold the panels:
 *   spare height grows them to the screen's top and bottom edges, and spare width stays as sea.
 * - Landscape on a short screen, whose slots would come out smaller than the panels: the board
 *   fills the height, and the panels are columns in the gutters either side.
 * - Portrait: the panels are bands across the top and bottom, and the board fills the height
 *   between them, panning across.
 *
 * Across, the board wraps as a globe does, repeating every board width. It never pans up and down.
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

/** How the board sits: all of it shown, or panned across (wrapping, so without bounds) with the
 *  span of the screen between `left` and `right` showing it, clear of the panels. */
export type Pan = { axis: "none" } | { axis: "x"; left: number; right: number };

export interface Frame {
  camera: Camera;
  pan: Pan;
}

export type Form = "landscape" | "short" | "portrait";

/** The two panels' boxes, in the screen's CSS pixels. */
export interface Panels {
  players: Rect;
  action: Rect;
  /** A wider, shorter box the action panel may take instead, when its step fits in it. */
  actionWide?: Rect;
}

/** The panels' type: its size in CSS pixels, and how far the panels keep from the screen's edges,
 *  in ems of it. */
export interface Type {
  size: number;
  inset: number;
}

/** A landscape type, from the screen width it starts at, and the sizes each panel's content fits
 *  at it, in ems, any one of which will do: a panel may need less height when it has more width. */
export interface LandscapeType extends Type {
  from: number;
  least: { players: readonly Size[]; action: readonly Size[] };
}

export interface ScreenLayout {
  form: Form;
  view: Size;
  frame: Frame;
  panels: Panels;
  type: Type;
}

/** What a layout is made from: the board, what it draws and where its panels go, in board units,
 *  the panels' type, and the least the panels and the territories need, in ems of that type, CSS
 *  pixels or a scale. */
export interface Composition {
  board: Size;
  /** The part of the board its territories draw (their rings and names), which the short form
   *  and portrait fit to the height they have. */
  drawn: Rect;
  /** The board's open slots, for the landscape panels. */
  slots: Required<Panels>;
  /** The type a landscape screen may take, largest first, each from the width it starts at, with
   *  the sizes each panel's content fits at it: the largest whose panels fit their slots is the one
   *  taken. */
  landscapeTypes: readonly LandscapeType[];
  /** The type of every other screen: a portrait or short one, by the width it starts at, narrowest
   *  first. */
  otherTypes: readonly (Type & { from: number })[];
  /** The least width of a column on a short landscape screen. */
  column: number;
  /** The heights of the portrait bands. */
  bands: { top: number; bottom: number };
  /** The least scale a fingertip can use: every territory far enough from the next. */
  touch: number;
}

const width = (r: Rect) => r.right - r.left;
const height = (r: Rect) => r.bottom - r.top;

/** Where the board and the panels sit on this screen, as it starts. */
export function layoutScreen(view: Size, c: Composition): ScreenLayout {
  const other = c.otherTypes.findLast((type) => view.width >= type.from) ?? c.otherTypes[0];
  if (view.width < view.height) return { ...portrait(view, c), type: other };
  for (const type of c.landscapeTypes) {
    if (view.width < type.from) continue;
    const laid = landscape(view, c, type);
    if (laid) return { ...laid, type };
  }
  return { ...short(view, c), type: other };
}

/** The composition scaled as one piece, or null when its slots would be smaller than the panels
 *  need at this type, room kept for their insets. */
function landscape(view: Size, c: Composition, type: LandscapeType): Omit<ScreenLayout, "type"> | null {
  const scale = Math.min(view.width / c.board.width, view.height / c.board.height);
  const left = (view.width - c.board.width * scale) / 2;
  const top = (view.height - c.board.height * scale) / 2;
  const at = (r: Rect): Rect => ({ left: left + r.left * scale, top: top + r.top * scale, right: left + r.right * scale, bottom: top + r.bottom * scale });
  const panels = { players: { ...at(c.slots.players), top: 0 }, action: { ...at(c.slots.action), bottom: view.height }, actionWide: { ...at(c.slots.actionWide), bottom: view.height } };
  // Each panel keeps the inset from the screen's edges and half an em from the board.
  const across = 2 * type.inset * type.size;
  const down = (type.inset + 0.5) * type.size;
  const fits = (r: Rect, least: readonly Size[]) => least.some((size) => width(r) - across >= size.width * type.size && height(r) - down >= size.height * type.size);
  if (!fits(panels.players, type.least.players) || !fits(panels.action, type.least.action)) return null;
  return { form: "landscape", view, frame: { camera: { left, top, scale }, pan: { axis: "none" } }, panels };
}

/** The board filling the height, whole, with the panels as columns either side. A screen too
 *  narrow for that shrinks the board to leave the columns their width, and below the fingertip
 *  scale the board pans across between them instead. */
function short(view: Size, c: Composition): Omit<ScreenLayout, "type"> {
  const room = width(c.drawn);
  const between = (view.width - 2 * c.column) / room;
  const scale = Math.max(c.touch, Math.min(view.height / height(c.drawn), between));
  const gutter = (view.width - room * scale) / 2;
  const pans = scale > between;
  const column = pans ? c.column : gutter;
  const top = (view.height - height(c.drawn) * scale) / 2 - c.drawn.top * scale;
  const panels = { players: { left: 0, top: 0, right: column, bottom: view.height }, action: { left: view.width - column, top: 0, right: view.width, bottom: view.height } };
  if (!pans) return { form: "short", view, frame: { camera: { left: gutter - c.drawn.left * scale, top, scale }, pan: { axis: "none" } }, panels };
  return { form: "short", view, frame: across(view, c, { left: column, right: view.width - column }, scale, top), panels };
}

/** The bands across the top and bottom, and the board filling the height between them. */
function portrait(view: Size, c: Composition): Omit<ScreenLayout, "type"> {
  const { top, bottom } = c.bands;
  const scale = (view.height - top - bottom) / height(c.drawn);
  const panels = { players: { left: 0, top: 0, right: view.width, bottom: top }, action: { left: 0, top: view.height - bottom, right: view.width, bottom: view.height } };
  return { form: "portrait", view, frame: across(view, c, { left: 0, right: view.width }, scale, top - c.drawn.top * scale), panels };
}

/** A board panning across the span between `left` and `right`, its middle there to start. */
function across(view: Size, c: Composition, span: { left: number; right: number }, scale: number, top: number): Frame {
  const left = (span.left + span.right) / 2 - (c.board.width * scale) / 2;
  return panBy({ camera: { left, top, scale }, pan: { axis: "x", ...span } }, 0, c.board);
}

/** Moves the board across by a drag, when it pans. */
export function panBy(frame: Frame, dx: number, board: Size): Frame {
  const { camera, pan } = frame;
  if (pan.axis === "none") return frame;
  const period = board.width * camera.scale;
  return { ...frame, camera: { ...camera, left: ((((camera.left + dx) % period) + period) % period) - period } };
}

/** The horizontal offsets the board is drawn at to cover the screen: one, or, panning across, as
 *  many copies as reach it. */
export function copies(frame: Frame, board: Size, view: Size): number[] {
  if (frame.pan.axis === "none") return [frame.camera.left];
  const period = board.width * frame.camera.scale;
  const out: number[] = [];
  for (let left = frame.camera.left; left < view.width; left += period) if (left + period > 0) out.push(left);
  return out;
}

export function toScreen({ camera }: Frame, point: BoardPoint): BoardPoint {
  return { x: point.x * camera.scale + camera.left, y: point.y * camera.scale + camera.top };
}

export function toBoard({ camera }: Frame, screen: BoardPoint): BoardPoint {
  return { x: (screen.x - camera.left) / camera.scale, y: (screen.y - camera.top) / camera.scale };
}

/** The least pan that brings a board point at least `margin` pixels inside the span that shows
 *  the board, to whichever copy of it is nearer. */
export function keepInView(frame: Frame, point: BoardPoint, margin: number, board: Size): Frame {
  const { pan } = frame;
  if (pan.axis === "none") return frame;
  const period = board.width * frame.camera.scale;
  const m = Math.min(margin, (pan.right - pan.left) / 2);
  const x = toScreen(frame, point).x;
  const xs = [x - period, x, x + period];
  if (xs.some((at) => at >= pan.left + m && at <= pan.right - m)) return frame;
  const dx = xs.map((at) => (at < pan.left + m ? pan.left + m - at : pan.right - m - at)).reduce((a, b) => (Math.abs(a) <= Math.abs(b) ? a : b));
  return panBy(frame, dx, board);
}

/** The board point in the middle of what shows the board. */
export function centreOf(frame: Frame, view: Size, board: Size): BoardPoint {
  const x = frame.pan.axis === "none" ? view.width / 2 : (frame.pan.left + frame.pan.right) / 2;
  const middle = toBoard(frame, { x, y: view.height / 2 });
  return { x: ((middle.x % board.width) + board.width) % board.width, y: middle.y };
}
