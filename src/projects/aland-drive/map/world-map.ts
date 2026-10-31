import { drawCar, drawNames, drawRoads, drawRoute, toWorld, type MapInk, type MapView } from "./draw";
import type { RoadGraph, Route } from "./road-graph";

/*
 * The world map's view and what's drawn over it. The map is the game's own render
 * from high up, north up and straight down (`render/game.ts` flies the camera to
 * this view): this holds where that view is, takes the mouse and a pad to pan,
 * zoom and pick, and draws the road network, route, names and car on a clear
 * canvas above it, at a fixed width on screen so roads stay legible from any
 * height. It draws when something changes, never on a loop of its own: a pad's
 * sticks arrive through `pad` each frame the game draws.
 */

export interface PadSteer {
  stickX: number;
  stickY: number;
  panX: number;
  panY: number;
  /** Positive zooms in. */
  zoom: number;
}

/** About the car's surroundings on a tall screen, with the land's height still small against the camera's. */
const MOST_SCALE = 0.25;
const FIT_MARGIN = 0.92;
const WHEEL_ZOOM = 1.0015;
const PAD_CURSOR_PX_S = 420;
const PAD_PAN_PX_S = 700;
const PAD_ZOOM_S = 2.5;
/** Past this zoom, streets; past the next, everything, with room for more names. */
const STREETS_FROM_SCALE = 0.05;
const ALL_FROM_SCALE = 0.13;
const MAIN_NAMES = 18;
const STREET_NAMES = 40;
const ALL_NAMES = 60;

export class WorldMap {
  isOpen = false;
  private readonly pen: CanvasRenderingContext2D;
  view: MapView;
  private fitScale = 0.01;
  private cursor: { x: number; y: number } | null = null;
  private car = { x: 0, z: 0, heading: 0 };
  private route: Route | null = null;
  private along = 0;
  private dragFrom: { x: number; y: number; moved: boolean } | null = null;
  private readonly abort = new AbortController();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly graph: RoadGraph,
    private readonly ink: MapInk,
    private readonly onPick: (x: number, z: number) => void,
  ) {
    const pen = canvas.getContext("2d");
    if (!pen) throw new Error("no 2D canvas for the world map");
    this.pen = pen;
    this.view = { x: 0, z: 0, scale: 0.01, turn: 0, width: 1, height: 1, centreX: 0, centreY: 0 };
    const { signal } = this.abort;
    canvas.addEventListener("pointerdown", (event) => {
      this.dragFrom = { x: event.offsetX, y: event.offsetY, moved: false };
    }, { signal });
    canvas.addEventListener("pointermove", (event) => {
      this.cursor = { x: event.offsetX, y: event.offsetY };
      const drag = this.dragFrom;
      if (drag && Math.hypot(event.offsetX - drag.x, event.offsetY - drag.y) > 4) {
        drag.moved = true;
        this.view.x -= (event.offsetX - drag.x) / this.view.scale;
        this.view.z -= (event.offsetY - drag.y) / this.view.scale;
        drag.x = event.offsetX;
        drag.y = event.offsetY;
      }
      this.draw();
    }, { signal });
    canvas.addEventListener("pointerup", (event) => {
      if (this.dragFrom && !this.dragFrom.moved) {
        const [x, z] = toWorld(this.view, event.offsetX, event.offsetY);
        this.onPick(x, z);
      }
      this.dragFrom = null;
    }, { signal });
    canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      this.zoomAt(event.offsetX, event.offsetY, WHEEL_ZOOM ** -event.deltaY);
    }, { signal, passive: false });
  }

  private zoomAt(screenX: number, screenY: number, by: number): void {
    const before = toWorld(this.view, screenX, screenY);
    this.view.scale = Math.max(this.fitScale, Math.min(MOST_SCALE, this.view.scale * by));
    const after = toWorld(this.view, screenX, screenY);
    this.view.x += before[0] - after[0];
    this.view.z += before[1] - after[1];
    this.draw();
  }

  open(carX: number, carZ: number, heading: number, route: Route | null, along: number): void {
    this.isOpen = true;
    this.car = { x: carX, z: carZ, heading };
    this.route = route;
    this.along = along;
    const { clientWidth, clientHeight } = this.canvas;
    this.canvas.width = clientWidth;
    this.canvas.height = clientHeight;
    const { west, east, top, bottom } = this.graph.bounds;
    this.fitScale = Math.min(clientWidth / (east - west), clientHeight / (bottom - top)) * FIT_MARGIN;
    this.view = { x: (west + east) / 2, z: (top + bottom) / 2, scale: this.fitScale, turn: 0, width: clientWidth, height: clientHeight, centreX: clientWidth / 2, centreY: clientHeight / 2 };
    this.cursor = null;
    this.draw();
  }

  close(): void {
    this.isOpen = false;
  }

  setRoute(route: Route | null): void {
    this.route = route;
    this.along = 0;
    this.draw();
  }

  /** The cursor's place, for a pad's press. */
  pick(): void {
    const { width, height } = this.view;
    const { x, y } = this.cursor ?? { x: width / 2, y: height / 2 };
    const [worldX, worldZ] = toWorld(this.view, x, y);
    this.onPick(worldX, worldZ);
  }

  /** A pad's steady inputs, for one frame. */
  pad({ stickX, stickY, panX, panY, zoom }: PadSteer, seconds: number): void {
    if (stickX === 0 && stickY === 0 && panX === 0 && panY === 0 && zoom === 0) return;
    const { width, height } = this.view;
    const cursor = this.cursor ?? { x: width / 2, y: height / 2 };
    this.cursor = { x: Math.max(0, Math.min(width, cursor.x + stickX * PAD_CURSOR_PX_S * seconds)), y: Math.max(0, Math.min(height, cursor.y + stickY * PAD_CURSOR_PX_S * seconds)) };
    this.view.x += (panX * PAD_PAN_PX_S * seconds) / this.view.scale;
    this.view.z += (panY * PAD_PAN_PX_S * seconds) / this.view.scale;
    if (zoom !== 0) this.zoomAt(this.cursor.x, this.cursor.y, Math.exp(zoom * PAD_ZOOM_S * seconds));
    else this.draw();
  }

  redraw(): void {
    this.draw();
  }

  private draw(): void {
    if (!this.isOpen) return;
    const { pen, view, graph, ink, cursor, car } = this;
    pen.clearRect(0, 0, view.width, view.height);
    const zoomedIn = view.scale >= ALL_FROM_SCALE;
    const streets = view.scale >= STREETS_FROM_SCALE;
    drawRoads(pen, view, graph, zoomedIn ? 3 : streets ? 2 : 1, ink);
    if (this.route) drawRoute(pen, view, this.route, this.along, ink);
    drawNames(pen, view, graph, zoomedIn ? 3 : streets ? 2 : 0, zoomedIn ? ALL_NAMES : streets ? STREET_NAMES : MAIN_NAMES, ink);
    drawCar(pen, view, car.x, car.z, car.heading, 11, ink);
    if (cursor) {
      pen.strokeStyle = ink.accent;
      pen.lineWidth = 2;
      pen.beginPath();
      pen.arc(cursor.x, cursor.y, 12, 0, Math.PI * 2);
      pen.moveTo(cursor.x - 18, cursor.y);
      pen.lineTo(cursor.x + 18, cursor.y);
      pen.moveTo(cursor.x, cursor.y - 18);
      pen.lineTo(cursor.x, cursor.y + 18);
      pen.stroke();
    }
  }

  dispose(): void {
    this.abort.abort();
  }
}
