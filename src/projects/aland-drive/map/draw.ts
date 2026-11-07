import type { OverviewFormat } from "../render/tile";
import type { Medal } from "../challenge/standings";
import type { ChallengeKind, RaceGround, RaceShape } from "../challenge/types";
import type { Place, PlaceKind } from "./places";
import type { RoadGraph, Route } from "./road-graph";

/*
 * Drawing a map on a 2D canvas, for both maps: the land from the overview, the
 * roads from the road network, the route, street names, the places to find and
 * the car. Colours are the game's own tokens. Everything is worked out by hand
 * from one view, so names stay upright on a map that turns with the car.
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
  /** Other players. */
  player: string;
  /** A place that's been found. */
  place: string;
  /** A challenge's start, and one that's been passed. */
  challenge: string;
  pass: string;
  /** A race's start, by what's under its wheels. */
  race: Record<RaceGround, string>;
  medal: Record<Medal, string>;
}

export function mapInk(): MapInk {
  const styles = getComputedStyle(document.documentElement);
  const token = (name: string) => styles.getPropertyValue(`--color-aland-drive-${name}`).trim();
  return {
    water: token("water"),
    ink: token("ui-ink"),
    shade: token("ui-shade"),
    accent: token("ui-accent"),
    player: token("ui-player"),
    place: token("ui-place"),
    challenge: token("ui-challenge"),
    pass: token("ui-pass"),
    race: { road: token("ui-race-road"), "cross-country": token("ui-race-cross-country"), "off-road": token("ui-race-off-road") },
    medal: { gold: token("ui-gold"), silver: token("ui-silver"), bronze: token("ui-bronze") },
  };
}

/** The land as an image a canvas can draw, from the overview's pixels. */
export function landImage(pixels: Uint8Array, format: OverviewFormat): OffscreenCanvas {
  const canvas = new OffscreenCanvas(format.imageWidth, format.imageHeight);
  const pen = canvas.getContext("2d");
  if (!pen) throw new Error("no 2D canvas for the map's land");
  pen.putImageData(new ImageData(new Uint8ClampedArray(pixels), format.imageWidth, format.imageHeight), 0, 0);
  return canvas;
}

/** The sharper land that's loaded just now, by tile. */
export class SharpLand {
  private readonly tiles = new Map<string, { x: number; z: number; image: ImageBitmap }>();
  /** Moves on whenever what's here changes. */
  revision = 0;

  constructor(private readonly tileM: number) {}

  add(name: string, column: number, row: number, image: ImageBitmap): void {
    this.tiles.set(name, { x: column * this.tileM, z: row * this.tileM, image });
    this.revision++;
  }

  remove(name: string): void {
    this.tiles.get(name)?.image.close();
    this.tiles.delete(name);
    this.revision++;
  }

  /** Each tile in sight, over what's already drawn. */
  draw(pen: CanvasRenderingContext2D, view: MapView): void {
    const { west, east, top, bottom } = sightBox(view);
    const [cos, sin] = [Math.cos(view.turn), Math.sin(view.turn)];
    pen.save();
    pen.imageSmoothingEnabled = true;
    for (const { x, z, image } of this.tiles.values()) {
      if (x > east || x + this.tileM < west || z > bottom || z + this.tileM < top) continue;
      const pixel = (this.tileM / image.width) * view.scale;
      const [left, up] = view.toScreen(x, z);
      pen.setTransform(pixel * cos, -pixel * sin, pixel * sin, pixel * cos, left, up);
      pen.drawImage(image, 0, 0);
    }
    pen.restore();
  }
}

export function drawLand(pen: CanvasRenderingContext2D, view: MapView, land: OffscreenCanvas, format: OverviewFormat, sharp: SharpLand, ink: MapInk, dim: number): void {
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
  sharp.draw(pen, view);
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

/** A challenge's line still to cross, on a map: a gate, the finish or a camera. */
export interface MapGate {
  x: number;
  z: number;
  /** The way along the road, anticlockwise from north, as the road lines have it. */
  heading: number;
  next: boolean;
  finish: boolean;
}

const GATE_HALF_PX = 9;

/** The lines still to cross, each a bar across the road at a size on screen, the next one bold in the challenge colour and the finish in the pass colour. */
export function drawGates(pen: CanvasRenderingContext2D, view: MapView, gates: readonly MapGate[], ink: MapInk): void {
  // The later ones first, so the next one lies on top.
  for (const { x, z, heading, next, finish } of [...gates].reverse()) {
    const [centreX, centreY] = view.toScreen(x, z);
    const [acrossX, acrossY] = view.toScreen(x + Math.cos(heading), z - Math.sin(heading));
    const length = Math.hypot(acrossX - centreX, acrossY - centreY) || 1;
    const half = next ? GATE_HALF_PX : GATE_HALF_PX * 0.7;
    const dx = ((acrossX - centreX) / length) * half;
    const dy = ((acrossY - centreY) / length) * half;
    pen.beginPath();
    pen.moveTo(centreX - dx, centreY - dy);
    pen.lineTo(centreX + dx, centreY + dy);
    pen.lineCap = "round";
    pen.strokeStyle = ink.shade;
    pen.lineWidth = next ? 8 : 5;
    pen.stroke();
    pen.strokeStyle = finish ? ink.pass : next ? ink.challenge : ink.ink;
    pen.lineWidth = next ? 5 : 2.5;
    pen.stroke();
  }
  pen.lineCap = "butt";
}

/** The route still to drive, from the car's own place on it rather than the next of its points, which a long straight can leave far ahead. */
export function drawRoute(pen: CanvasRenderingContext2D, view: MapView, route: Route, fromAlong: number, ink: MapInk): void {
  const { line } = route;
  const { points, lengths } = line;
  const from = line.at(fromAlong);
  pen.beginPath();
  pen.moveTo(...view.toScreen(from.x, from.z));
  for (let point = 0; point < lengths.length; point++) {
    if (lengths[point] <= fromAlong) continue;
    pen.lineTo(...view.toScreen(points[point * 3], points[point * 3 + 2]));
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
  arrow(pen, view.toScreen(x, z), headingClockwise - view.turn, size, ink.accent, ink);
}

function arrow(pen: CanvasRenderingContext2D, [screenX, screenY]: [number, number], turn: number, size: number, fill: string, ink: MapInk): void {
  pen.save();
  pen.translate(screenX, screenY);
  pen.rotate(turn);
  pen.beginPath();
  pen.moveTo(0, -size);
  pen.lineTo(size * 0.7, size * 0.8);
  pen.lineTo(0, size * 0.4);
  pen.lineTo(-size * 0.7, size * 0.8);
  pen.closePath();
  pen.fillStyle = fill;
  pen.strokeStyle = ink.shade;
  pen.lineWidth = 2;
  pen.fill();
  pen.stroke();
  pen.restore();
}

/** A place's symbol, in a box from -1 to 1, y down: filled shapes, with lines for what's thinner. */
const GLYPHS: Record<PlaceKind, (pen: CanvasRenderingContext2D) => void> = {
  church: (pen) => {
    fill(pen, [-0.55, 0.75], [-0.55, -0.05], [0, -0.5], [0.55, -0.05], [0.55, 0.75]);
    line(pen, [0, -0.5], [0, -0.95]);
    line(pen, [-0.2, -0.75], [0.2, -0.75]);
  },
  castle: (pen) => fill(pen, [-0.75, 0.75], [-0.75, -0.55], [-0.45, -0.55], [-0.45, -0.3], [-0.15, -0.3], [-0.15, -0.8], [0.15, -0.8], [0.15, -0.3], [0.45, -0.3], [0.45, -0.55], [0.75, -0.55], [0.75, 0.75]),
  fort: (pen) => fill(pen, ...Array.from({ length: 10 }, (_, corner): [number, number] => {
    const radius = corner % 2 === 0 ? 0.85 : 0.45;
    const angle = (corner * Math.PI) / 5 - Math.PI / 2;
    return [radius * Math.cos(angle), radius * Math.sin(angle)];
  })),
  ancient: (pen) => {
    fill(pen, [-0.75, 0.7], [-0.7, -0.15], [-0.4, -0.25], [-0.35, 0.7]);
    fill(pen, [-0.2, 0.7], [-0.2, -0.65], [0.2, -0.75], [0.25, 0.7]);
    fill(pen, [0.4, 0.7], [0.45, -0.3], [0.75, -0.2], [0.75, 0.7]);
  },
  graves: (pen) => {
    pen.beginPath();
    pen.moveTo(-0.5, 0.75);
    pen.lineTo(-0.5, -0.2);
    pen.arc(0, -0.2, 0.5, Math.PI, 0);
    pen.lineTo(0.5, 0.75);
    pen.closePath();
    pen.fill();
  },
  monument: (pen) => {
    fill(pen, [-0.6, 0.8], [-0.6, 0.5], [0.6, 0.5], [0.6, 0.8]);
    fill(pen, [-0.3, 0.5], [-0.18, -0.6], [0, -0.9], [0.18, -0.6], [0.3, 0.5]);
  },
  museum: (pen) => {
    fill(pen, [-0.85, -0.35], [0, -0.85], [0.85, -0.35]);
    fill(pen, [-0.85, 0.85], [-0.85, 0.6], [0.85, 0.6], [0.85, 0.85]);
    for (const x of [-0.6, -0.2, 0.2, 0.6]) fill(pen, [x - 0.11, 0.6], [x - 0.11, -0.25], [x + 0.11, -0.25], [x + 0.11, 0.6]);
  },
  landmark: (pen) => fill(pen, ...Array.from({ length: 8 }, (_, corner): [number, number] => {
    const radius = corner % 2 === 0 ? 0.9 : 0.32;
    const angle = (corner * Math.PI) / 4 - Math.PI / 2;
    return [radius * Math.cos(angle), radius * Math.sin(angle)];
  })),
  lighthouse: (pen) => {
    fill(pen, [-0.36, 0.85], [-0.2, -0.4], [0.2, -0.4], [0.36, 0.85]);
    fill(pen, [-0.24, -0.45], [-0.24, -0.68], [0.24, -0.68], [0.24, -0.45]);
    fill(pen, [-0.32, -0.7], [0, -0.95], [0.32, -0.7]);
    line(pen, [-0.42, -0.57], [-0.85, -0.7]);
    line(pen, [0.42, -0.57], [0.85, -0.7]);
  },
  viewpoint: (pen) => {
    fill(pen, [-0.9, 0.7], [-0.25, -0.45], [0.05, 0.05], [0.3, -0.25], [0.9, 0.7]);
    pen.beginPath();
    pen.arc(0.5, -0.6, 0.22, 0, Math.PI * 2);
    pen.fill();
  },
  ship: (pen) => {
    fill(pen, [-0.85, 0.35], [0.85, 0.35], [0.55, 0.8], [-0.55, 0.8]);
    fill(pen, [-0.05, 0.2], [-0.05, -0.9], [-0.7, 0.2]);
    fill(pen, [0.1, 0.2], [0.1, -0.7], [0.65, 0.2]);
  },
  golf: (pen) => {
    line(pen, [-0.3, 0.8], [-0.3, -0.85]);
    fill(pen, [-0.3, -0.85], [0.65, -0.55], [-0.3, -0.25]);
    pen.beginPath();
    pen.ellipse(-0.1, 0.8, 0.55, 0.14, 0, 0, Math.PI * 2);
    pen.fill();
  },
};

function fill(pen: CanvasRenderingContext2D, ...points: [number, number][]): void {
  pen.beginPath();
  points.forEach(([x, y], index) => (index === 0 ? pen.moveTo(x, y) : pen.lineTo(x, y)));
  pen.closePath();
  pen.fill();
}

function line(pen: CanvasRenderingContext2D, from: [number, number], to: [number, number]): void {
  pen.beginPath();
  pen.moveTo(...from);
  pen.lineTo(...to);
  pen.stroke();
}

/** A place on a map. */
export interface MapPlace {
  place: Place;
  found: boolean;
}

/** Every place in sight, as its symbol on a disc: in the place's colour once found, and faint until then. Found places are named when `named`. */
export function drawPlaces(pen: CanvasRenderingContext2D, view: MapView, places: readonly MapPlace[], size: number, ink: MapInk, named: boolean): void {
  pen.font = "600 12px system-ui, sans-serif";
  pen.textAlign = "center";
  pen.textBaseline = "top";
  pen.lineJoin = "round";
  // Found places last, so they sit over any faint one they touch.
  for (const { place, found } of [...places].sort((a, b) => Number(a.found) - Number(b.found))) {
    const [x, y] = view.toScreen(place.x, place.z);
    if (x < -size || y < -size || x > view.width + size || y > view.height + size) continue;
    pen.globalAlpha = found ? 1 : 0.55;
    pen.fillStyle = found ? ink.place : ink.shade;
    pen.strokeStyle = found ? ink.shade : ink.ink;
    pen.lineWidth = 1.5;
    pen.beginPath();
    pen.arc(x, y, size, 0, Math.PI * 2);
    pen.fill();
    pen.stroke();
    pen.save();
    pen.translate(x, y);
    pen.scale(size * 0.62, size * 0.62);
    pen.fillStyle = ink.ink;
    pen.strokeStyle = ink.ink;
    pen.lineWidth = 0.2;
    pen.lineCap = "round";
    GLYPHS[place.kind](pen);
    pen.restore();
    if (named && found) {
      pen.strokeStyle = ink.shade;
      pen.lineWidth = 3;
      pen.strokeText(place.name, x, y + size + 3);
      pen.fillStyle = ink.place;
      pen.fillText(place.name, x, y + size + 3);
    }
  }
  pen.globalAlpha = 1;
}

/** The place or challenge start whose symbol is under a point on the canvas, if any. */
export function placeAt<T extends { x: number; z: number }>(view: MapView, places: readonly T[], screenX: number, screenY: number, size: number): T | null {
  let best: T | null = null;
  let nearest = size;
  for (const place of places) {
    const [x, y] = view.toScreen(place.x, place.z);
    const distance = Math.hypot(x - screenX, y - screenY);
    if (distance <= nearest) {
      nearest = distance;
      best = place;
    }
  }
  return best;
}

/** Another player on a map. */
export interface MapPlayer {
  x: number;
  z: number;
  headingClockwise: number;
  name: string;
}

/** Where on the canvas every player has to stay: a circle (the mini map) or the whole canvas less a margin. */
export type MapBounds = { circle: [x: number, y: number, radius: number] } | { margin: number };

/** Where a place falls on the canvas, held to the bounds, and whether it had to be. */
function heldIn([x, y]: [number, number], view: MapView, bounds: MapBounds): { at: [number, number]; held: boolean } {
  if ("circle" in bounds) {
    const [centreX, centreY, radius] = bounds.circle;
    const out = Math.hypot(x - centreX, y - centreY);
    if (out <= radius) return { at: [x, y], held: false };
    return { at: [centreX + ((x - centreX) * radius) / out, centreY + ((y - centreY) * radius) / out], held: true };
  }
  const { margin } = bounds;
  const at: [number, number] = [Math.min(Math.max(x, margin), view.width - margin), Math.min(Math.max(y, margin), view.height - margin)];
  return { at, held: at[0] !== x || at[1] !== y };
}

/** Every other player, wherever they are: one off the map waits at its edge, the way they lie. */
export function drawPlayers(pen: CanvasRenderingContext2D, view: MapView, players: readonly MapPlayer[], size: number, ink: MapInk, bounds: MapBounds, named: boolean): void {
  pen.font = "600 12px system-ui, sans-serif";
  pen.textAlign = "left";
  pen.textBaseline = "middle";
  pen.lineJoin = "round";
  for (const { x, z, headingClockwise, name } of players) {
    const { at, held } = heldIn(view.toScreen(x, z), view, bounds);
    pen.globalAlpha = held ? 0.75 : 1;
    arrow(pen, at, headingClockwise - view.turn, held ? size * 0.8 : size, ink.player, ink);
    if (named) {
      const [textX, textY] = [at[0] + size + 4, at[1]];
      pen.strokeStyle = ink.shade;
      pen.lineWidth = 3;
      pen.strokeText(name, textX, textY);
      pen.fillStyle = ink.player;
      pen.fillText(name, textX, textY);
    }
  }
  pen.globalAlpha = 1;
}

/** A challenge's start on a map. */
export interface MapChallenge {
  x: number;
  z: number;
  id: string;
  title: string;
  kind: ChallengeKind;
  passed: boolean;
  /** A race's own: what the maps show of it and its best medal. */
  race?: { number: string; ground: RaceGround; shape: RaceShape; laps: number; lengthM: number; medal: Medal | null };
}

/** A challenge's symbol, in the same box as a place's: a chequered flag for a Route, a dial at its top for a Speed trap. */
const CHALLENGE_GLYPHS: Record<ChallengeKind, (pen: CanvasRenderingContext2D) => void> = {
  route: (pen) => {
    line(pen, [-0.55, 0.85], [-0.55, -0.85]);
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 4; column++) {
        if ((row + column) % 2 === 1) continue;
        const [left, top] = [-0.55 + column * 0.33, -0.85 + row * 0.3];
        fill(pen, [left, top], [left + 0.33, top], [left + 0.33, top + 0.3], [left, top + 0.3]);
      }
    }
  },
  // A race's start is a diamond of its own, drawn by `drawRace`.
  race: () => undefined,
  "speed-trap": (pen) => {
    pen.beginPath();
    pen.arc(0, 0.35, 0.8, Math.PI, 0);
    pen.stroke();
    line(pen, [0, 0.35], [0.55, -0.25]);
    pen.beginPath();
    pen.arc(0, 0.35, 0.16, 0, Math.PI * 2);
    pen.fill();
  },
};

/** Every challenge's start in sight, on a square so it reads apart from the places' discs: in the challenge colour, or the pass colour once passed. Named when `named`. */
export function drawChallenges(pen: CanvasRenderingContext2D, view: MapView, challenges: readonly MapChallenge[], size: number, ink: MapInk, named: boolean): void {
  pen.font = "600 12px system-ui, sans-serif";
  pen.textAlign = "center";
  pen.textBaseline = "top";
  pen.lineJoin = "round";
  for (const { x: placeX, z: placeZ, title, kind, passed, race } of challenges) {
    const [x, y] = view.toScreen(placeX, placeZ);
    if (x < -size || y < -size || x > view.width + size || y > view.height + size) continue;
    if (race) {
      drawRace(pen, x, y, size, race, ink);
      if (named) {
        pen.strokeStyle = ink.shade;
        pen.lineWidth = 3;
        pen.strokeText(title, x, y + size * 1.3 + 3);
        pen.fillStyle = ink.race[race.ground];
        pen.fillText(title, x, y + size * 1.3 + 3);
      }
      continue;
    }
    const colour = passed ? ink.pass : ink.challenge;
    pen.fillStyle = colour;
    pen.strokeStyle = ink.shade;
    pen.lineWidth = 2;
    pen.beginPath();
    pen.roundRect(x - size, y - size, size * 2, size * 2, size * 0.35);
    pen.fill();
    pen.stroke();
    pen.save();
    pen.translate(x, y);
    pen.scale(size * 0.62, size * 0.62);
    pen.fillStyle = ink.shade;
    pen.strokeStyle = ink.shade;
    pen.lineWidth = 0.22;
    pen.lineCap = "round";
    CHALLENGE_GLYPHS[kind](pen);
    pen.restore();
    if (named) {
      pen.strokeStyle = ink.shade;
      pen.lineWidth = 3;
      pen.strokeText(title, x, y + size + 3);
      pen.fillStyle = colour;
      pen.fillText(title, x, y + size + 3);
    }
  }
}


/** A race's symbol: a loop for a circuit, a start and a flag for a sprint. */
const RACE_GLYPHS: Record<RaceShape, (pen: CanvasRenderingContext2D) => void> = {
  circuit: (pen) => {
    const [radius, end] = [0.62, Math.PI * 1.4];
    pen.beginPath();
    pen.arc(0, 0, radius, -Math.PI * 0.25, end);
    pen.stroke();
    // An arrowhead where the loop ends, pointing on round it.
    const [outX, outY] = [Math.cos(end), Math.sin(end)];
    const [onX, onY] = [-outY, outX];
    const [x, y] = [radius * outX, radius * outY];
    fill(pen, [x + onX * 0.42, y + onY * 0.42], [x + outX * 0.3, y + outY * 0.3], [x - outX * 0.3, y - outY * 0.3]);
  },
  sprint: (pen) => {
    pen.beginPath();
    pen.arc(-0.6, 0.55, 0.2, 0, Math.PI * 2);
    pen.fill();
    line(pen, [-0.45, 0.4], [0.3, -0.35]);
    line(pen, [0.3, 0.6], [0.3, -0.8]);
    fill(pen, [0.3, -0.8], [0.85, -0.6], [0.3, -0.4]);
  },
};

/** A race's start on a map: a diamond in its ground's colour with its shape's glyph, and its best medal as a disc on its shoulder. */
function drawRace(pen: CanvasRenderingContext2D, x: number, y: number, size: number, race: NonNullable<MapChallenge["race"]>, ink: MapInk): void {
  const reach = size * 1.3;
  pen.fillStyle = ink.race[race.ground];
  pen.strokeStyle = ink.shade;
  pen.lineWidth = 2;
  pen.beginPath();
  pen.moveTo(x, y - reach);
  pen.lineTo(x + reach, y);
  pen.lineTo(x, y + reach);
  pen.lineTo(x - reach, y);
  pen.closePath();
  pen.fill();
  pen.stroke();
  pen.save();
  pen.translate(x, y);
  pen.scale(size * 0.62, size * 0.62);
  pen.fillStyle = ink.shade;
  pen.strokeStyle = ink.shade;
  pen.lineWidth = 0.22;
  pen.lineCap = "round";
  RACE_GLYPHS[race.shape](pen);
  pen.restore();
  if (race.medal) {
    pen.fillStyle = ink.medal[race.medal];
    pen.strokeStyle = ink.shade;
    pen.lineWidth = 1.5;
    pen.beginPath();
    pen.arc(x + reach * 0.62, y - reach * 0.62, size * 0.42, 0, Math.PI * 2);
    pen.fill();
    pen.stroke();
  }
}

/** A race's whole route on the world map, under the cursor: a broad line in its ground's colour. */
export function drawRaceRoute(pen: CanvasRenderingContext2D, view: MapView, points: Float32Array, ground: RaceGround, ink: MapInk): void {
  pen.lineJoin = "round";
  pen.lineCap = "round";
  for (const [colour, width] of [[ink.shade, 7], [ink.race[ground], 4]] as const) {
    pen.strokeStyle = colour;
    pen.lineWidth = width;
    pen.beginPath();
    for (let at = 0; at < points.length / 3; at++) {
      const [x, y] = view.toScreen(points[at * 3], points[at * 3 + 2]);
      if (at === 0) pen.moveTo(x, y);
      else pen.lineTo(x, y);
    }
    pen.stroke();
  }
}
