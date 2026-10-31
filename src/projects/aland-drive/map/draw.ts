import type { OverviewFormat } from "../render/tile";
import type { RoadGraph, Route } from "./road-graph";

/*
 * Drawing a map on a 2D canvas, for both maps: the land from the overview, the
 * roads from the road network, the route, street names and the car. Colours are
 * the game's own tokens. Everything is worked out by hand from one view, so
 * names stay upright on a map that turns with the car.
 */

export interface MapView {
  /** Pixels a metre, at the middle of the view. */
  scale: number;
  /** Radians clockwise that the map's top is from north. */
  turn: number;
  width: number;
  height: number;
  /** A place on the ground on the canvas. */
  toScreen: (x: number, z: number) => [number, number];
  /** The place on the ground under a point on the canvas. */
  toWorld: (screenX: number, screenY: number) => [number, number];
}

/** A flat map seen from straight above, centred at a point on the canvas. */
export function flatView(x: number, z: number, scale: number, turn: number, width: number, height: number, centreX: number, centreY: number): MapView {
  const [cos, sin] = [Math.cos(turn), Math.sin(turn)];
  return {
    scale,
    turn,
    width,
    height,
    toScreen: (placeX, placeZ) => [centreX + scale * ((placeX - x) * cos + (placeZ - z) * sin), centreY + scale * ((placeZ - z) * cos - (placeX - x) * sin)],
    toWorld: (screenX, screenY) => {
      const [dx, dy] = [(screenX - centreX) / scale, (screenY - centreY) / scale];
      return [x + dx * cos - dy * sin, z + dx * sin + dy * cos];
    },
  };
}

export interface MapInk {
  water: string;
  ink: string;
  shade: string;
  accent: string;
}

export function mapInk(): MapInk {
  const styles = getComputedStyle(document.documentElement);
  const token = (name: string) => styles.getPropertyValue(`--color-aland-drive-${name}`).trim();
  return { water: token("water"), ink: token("ui-ink"), shade: token("ui-shade"), accent: token("ui-accent") };
}

/** The land as an image a canvas can draw, from the overview's pixels. */
export function landImage(pixels: Uint8Array, format: OverviewFormat): OffscreenCanvas {
  const canvas = new OffscreenCanvas(format.imageWidth, format.imageHeight);
  const pen = canvas.getContext("2d");
  if (!pen) throw new Error("no 2D canvas for the map's land");
  pen.putImageData(new ImageData(new Uint8ClampedArray(pixels), format.imageWidth, format.imageHeight), 0, 0);
  return canvas;
}

export function drawLand(pen: CanvasRenderingContext2D, view: MapView, land: OffscreenCanvas, format: OverviewFormat, ink: MapInk, dim: number): void {
  pen.fillStyle = ink.water;
  pen.fillRect(0, 0, view.width, view.height);
  const metresWide = (format.columns - 1) * format.stepM;
  const pixel = (metresWide / format.imageWidth) * view.scale;
  const [cos, sin] = [Math.cos(view.turn), Math.sin(view.turn)];
  const [left, top] = view.toScreen(format.west, -format.north);
  pen.save();
  pen.setTransform(pixel * cos, -pixel * sin, pixel * sin, pixel * cos, left, top);
  pen.imageSmoothingEnabled = true;
  pen.drawImage(land, 0, 0);
  pen.restore();
  pen.globalAlpha = dim;
  pen.fillStyle = ink.shade;
  pen.fillRect(0, 0, view.width, view.height);
  pen.globalAlpha = 1;
}

/** What's in sight, as a box in the scene, whatever way the map is turned. */
function sightBox(view: MapView) {
  const corners = [[0, 0], [view.width, 0], [0, view.height], [view.width, view.height]].map(([x, y]) => view.toWorld(x, y));
  const xs = corners.map(([x]) => x);
  const zs = corners.map(([, z]) => z);
  return { west: Math.min(...xs), east: Math.max(...xs), top: Math.min(...zs), bottom: Math.max(...zs) };
}

const WIDTHS = [2.6, 2, 1.3, 0.9];
const ALPHAS = [1, 0.9, 0.7, 0.45];

/** Roads up to a rank, the greatest on top. */
export function drawRoads(pen: CanvasRenderingContext2D, view: MapView, graph: RoadGraph, mostRank: number, ink: MapInk, widthShare = 1): void {
  const { west, east, top, bottom } = sightBox(view);
  const { first, pointX, pointZ, kind, ranks } = graph.data;
  const paths = WIDTHS.map(() => new Path2D());
  graph.forRoadsIn(west, east, top, bottom, (edge) => {
    const rank = ranks[kind[edge]];
    if (rank > mostRank) return;
    const path = paths[rank];
    for (let point = first[edge]; point < first[edge + 1]; point++) {
      const [x, y] = view.toScreen(pointX[point], pointZ[point]);
      if (point === first[edge]) path.moveTo(x, y);
      else path.lineTo(x, y);
    }
  });
  pen.lineCap = "round";
  pen.lineJoin = "round";
  for (let rank = mostRank; rank >= 0; rank--) {
    pen.strokeStyle = ink.ink;
    pen.globalAlpha = ALPHAS[rank];
    pen.lineWidth = WIDTHS[rank] * widthShare;
    pen.stroke(paths[rank]);
  }
  pen.globalAlpha = 1;
}

export function drawRoute(pen: CanvasRenderingContext2D, view: MapView, route: Route, fromAlong: number, ink: MapInk): void {
  const { points, lengths } = route.line;
  pen.beginPath();
  let started = false;
  for (let point = 0; point < lengths.length; point++) {
    if (lengths[point] < fromAlong) continue;
    const [x, y] = view.toScreen(points[point * 3], points[point * 3 + 2]);
    if (started) pen.lineTo(x, y);
    else pen.moveTo(x, y);
    started = true;
  }
  pen.strokeStyle = ink.shade;
  pen.lineWidth = 7;
  pen.stroke();
  pen.strokeStyle = ink.accent;
  pen.lineWidth = 4;
  pen.stroke();
  const [endX, endY] = view.toScreen(route.end.x, route.end.z);
  pen.fillStyle = ink.accent;
  pen.strokeStyle = ink.shade;
  pen.lineWidth = 2;
  pen.beginPath();
  pen.arc(endX, endY, 7, 0, Math.PI * 2);
  pen.fill();
  pen.stroke();
}

/** Names along the roads in sight, the greatest roads first, none on top of another. */
export function drawNames(pen: CanvasRenderingContext2D, view: MapView, graph: RoadGraph, mostRank: number, room: number, ink: MapInk): void {
  const { west, east, top, bottom } = sightBox(view);
  const { first, pointX, pointZ, kind, ranks, name, length } = graph.data;
  const longest = new Map<number, number>();
  graph.forRoadsIn(west, east, top, bottom, (edge) => {
    if (name[edge] === 0 || ranks[kind[edge]] > mostRank) return;
    const shown = longest.get(name[edge]);
    if (shown === undefined || length[edge] > length[shown]) longest.set(name[edge], edge);
  });
  const edges = [...longest.values()].sort((a, b) => ranks[kind[a]] - ranks[kind[b]] || length[b] - length[a]);
  pen.font = "600 12px system-ui, sans-serif";
  pen.textAlign = "center";
  pen.textBaseline = "middle";
  pen.lineJoin = "round";
  const taken: { x: number; y: number; half: number }[] = [];
  for (const edge of edges) {
    if (taken.length >= room) break;
    const middle = Math.floor((first[edge] + first[edge + 1]) / 2);
    const [x, y] = view.toScreen(pointX[middle], pointZ[middle]);
    if (x < 0 || y < 0 || x > view.width || y > view.height) continue;
    const text = graph.roadName(edge);
    const half = pen.measureText(text).width / 2 + 4;
    if (taken.some((other) => Math.abs(other.x - x) < other.half + half && Math.abs(other.y - y) < 16)) continue;
    taken.push({ x, y, half });
    pen.strokeStyle = ink.shade;
    pen.lineWidth = 3;
    pen.strokeText(text, x, y);
    pen.fillStyle = ink.ink;
    pen.fillText(text, x, y);
  }
}

/** The car: an arrow pointing the way it faces, on the map's own turn. */
export function drawCar(pen: CanvasRenderingContext2D, view: MapView, x: number, z: number, headingClockwise: number, size: number, ink: MapInk): void {
  const [screenX, screenY] = view.toScreen(x, z);
  pen.save();
  pen.translate(screenX, screenY);
  pen.rotate(headingClockwise - view.turn);
  pen.beginPath();
  pen.moveTo(0, -size);
  pen.lineTo(size * 0.7, size * 0.8);
  pen.lineTo(0, size * 0.4);
  pen.lineTo(-size * 0.7, size * 0.8);
  pen.closePath();
  pen.fillStyle = ink.accent;
  pen.strokeStyle = ink.shade;
  pen.lineWidth = 2;
  pen.fill();
  pen.stroke();
  pen.restore();
}
