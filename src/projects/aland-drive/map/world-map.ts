import { drawCar, drawNames, drawRoads, drawRoute, type MapInk, type MapView } from "./draw";
import type { RoadGraph, Route } from "./road-graph";

/*
 * What's drawn over the game's render on the way up to the map, and the input for
 * going there. The map is no screen of its own: `render/map-camera.ts` is one path
 * of the camera from the car to the whole island, and this holds where along it
 * the player wants to be and how far they've panned, by mouse or by controller,
 * and draws the road network, route, names and car on a clear canvas above the
 * render. Roads keep a width on screen, so they stay legible from any height, and
 * the canvas fades in with altitude as the car becomes too small to see.
 */

export interface PadSteer {
  stickX: number;
  stickY: number;
  panX: number;
  panY: number;
  /** Positive zooms in. */
  zoom: number;
}

/** A pull of the wheel, in pixels of the browser's reckoning, as a share of the whole path. */
const WHEEL_ZOOM_SHARE = 0.0004;
const PAD_ZOOM_SHARE_S = 0.35;
const PAD_PAN_PX_S = 700;
/** The ease of the zoom: it follows its goal like a critically damped spring, so it can turn round at any moment with no jump. */
const ZOOM_SPRING_S = 2.8;
const SETTLED_ZOOM = 0.0008;
/** Past this zoom, streets; past the next, everything, with room for more names. */
const STREETS_FROM_SCALE = 0.05;
const ALL_FROM_SCALE = 0.13;
const MAIN_NAMES = 18;
const STREET_NAMES = 40;
const ALL_NAMES = 60;
const ROADS_THICKEN_FROM_SCALE = 0.02;

export class WorldMap {
  /** Where along the camera's path things are, 0 at the car and 1 at the top, and where the player wants to be. */
  zoom = 0;
  goal = 0;
  private speed = 0;
  panX = 0;
  panZ = 0;
  /** The screen's place a wheel is zooming about, held until the zoom settles. */
  private anchor: { x: number; y: number; worldX: number; worldZ: number } | null = null;
  private view: MapView | null = null;
  private cursor: { x: number; y: number } | null = null;
  private car = { x: 0, z: 0, heading: 0 };
  private route: Route | null = null;
  private along = 0;
  private dragFrom: { x: number; y: number; moved: boolean } | null = null;
  private readonly pen: CanvasRenderingContext2D;
  private readonly abort = new AbortController();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly graph: RoadGraph,
    private readonly ink: MapInk,
    private readonly onPick: (x: number, z: number) => void,
    private readonly onLeave: () => void,
  ) {
    const pen = canvas.getContext("2d");
    if (!pen) throw new Error("no 2D canvas for the world map");
    this.pen = pen;
    const { signal } = this.abort;
    canvas.addEventListener("pointerdown", (event) => {
      this.dragFrom = { x: event.offsetX, y: event.offsetY, moved: false };
    }, { signal });
    canvas.addEventListener("pointermove", (event) => {
      this.cursor = { x: event.offsetX, y: event.offsetY };
      const drag = this.dragFrom;
      const view = this.view;
      if (drag && view && Math.hypot(event.offsetX - drag.x, event.offsetY - drag.y) > 4) {
        drag.moved = true;
        const [fromX, fromZ] = view.toWorld(drag.x, drag.y);
        const [toX, toZ] = view.toWorld(event.offsetX, event.offsetY);
        this.panX += fromX - toX;
        this.panZ += fromZ - toZ;
        drag.x = event.offsetX;
        drag.y = event.offsetY;
      }
    }, { signal });
    canvas.addEventListener("pointerup", (event) => {
      if (this.dragFrom && !this.dragFrom.moved && this.view) {
        const [x, z] = this.view.toWorld(event.offsetX, event.offsetY);
        this.onPick(x, z);
      }
      this.dragFrom = null;
    }, { signal });
    canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      if (this.view) {
        const [worldX, worldZ] = this.view.toWorld(event.offsetX, event.offsetY);
        this.anchor = { x: event.offsetX, y: event.offsetY, worldX, worldZ };
      }
      this.moveGoal(-event.deltaY * WHEEL_ZOOM_SHARE);
    }, { signal, passive: false });
  }

  private moveGoal(by: number): void {
    this.goal = Math.max(0, Math.min(1, this.goal + by));
  }

  /** Is the camera on its way or up there. */
  get isUp(): boolean {
    return this.zoom > 0 || this.goal > 0;
  }

  /** The map key: to the top, or home to the car. */
  toggle(): void {
    this.goal = this.goal > 0 ? 0 : 1;
    this.anchor = null;
  }

  startAt(carX: number, carZ: number, heading: number, route: Route | null, along: number): void {
    this.car = { x: carX, z: carZ, heading };
    this.route = route;
    this.along = along;
    this.panX = 0;
    this.panZ = 0;
    this.canvas.width = this.canvas.clientWidth;
    this.canvas.height = this.canvas.clientHeight;
  }

  setRoute(route: Route | null): void {
    this.route = route;
    this.along = 0;
    this.view = this.view && { ...this.view };
  }

  /** The cursor's place, for a pad's press. */
  pick(): void {
    if (!this.view) return;
    const { x, y } = this.cursor ?? { x: this.view.width / 2, y: this.view.height / 2 };
    const [worldX, worldZ] = this.view.toWorld(x, y);
    this.onPick(worldX, worldZ);
  }

  /** Moves the zoom on by a frame, and a pad's steady inputs with it. */
  step({ stickX, stickY, panX, panY, zoom }: PadSteer, seconds: number): void {
    const view = this.view;
    if (zoom !== 0) {
      this.moveGoal(zoom * PAD_ZOOM_SHARE_S * seconds);
      this.anchor = null;
    }
    if (view && (stickX !== 0 || stickY !== 0 || panX !== 0 || panY !== 0)) {
      // Left stick pans the map: the right stick does too, so either hand can.
      const metres = (PAD_PAN_PX_S * seconds) / view.scale;
      const [right, up] = [stickX + panX, stickY + panY];
      const [cos, sin] = [Math.cos(view.turn), Math.sin(view.turn)];
      this.panX += metres * (right * cos - up * sin);
      this.panZ += metres * (right * sin + up * cos);
    }
    const pull = ZOOM_SPRING_S;
    const acceleration = pull * pull * (this.goal - this.zoom) - 2 * pull * this.speed;
    this.speed += acceleration * seconds;
    this.zoom += this.speed * seconds;
    if (Math.abs(this.goal - this.zoom) < SETTLED_ZOOM && Math.abs(this.speed) < SETTLED_ZOOM) {
      this.zoom = this.goal;
      this.speed = 0;
      this.anchor = null;
      if (this.zoom === 0) this.onLeave();
    }
    this.zoom = Math.max(0, Math.min(1, this.zoom));
  }

  /** Holds the zoom at a place along the path, for tools. */
  holdAt(zoom: number): void {
    this.zoom = this.goal = zoom;
    this.speed = 0;
  }

  /** Keeps the point a wheel is zooming about under the cursor. */
  private holdAnchor(view: MapView): void {
    if (!this.anchor) return;
    const [x, z] = view.toWorld(this.anchor.x, this.anchor.y);
    this.panX += this.anchor.worldX - x;
    this.panZ += this.anchor.worldZ - z;
  }

  /** Draws what goes over the render, seen from this frame's camera, faded by `shown`. */
  draw(view: MapView, shown: number): void {
    this.holdAnchor(view);
    const last = this.view;
    this.view = view;
    this.canvas.style.opacity = String(shown);
    if (shown === 0) return;
    if (last && last.scale === view.scale && last.turn === view.turn && last.toScreen(0, 0)[0] === view.toScreen(0, 0)[0] && last.toScreen(0, 0)[1] === view.toScreen(0, 0)[1] && last.toScreen(1000, 1000)[1] === view.toScreen(1000, 1000)[1]) return;
    const { pen, graph, ink, cursor, car } = this;
    pen.clearRect(0, 0, view.width, view.height);
    const zoomedIn = view.scale >= ALL_FROM_SCALE;
    const streets = view.scale >= STREETS_FROM_SCALE;
    // Thin near the car, where the road itself shows, and full width by the time it can't.
    drawRoads(pen, view, graph, zoomedIn ? 3 : streets ? 2 : 1, ink, Math.min(1, 0.5 + ROADS_THICKEN_FROM_SCALE / view.scale));
    if (this.route) drawRoute(pen, view, this.route, this.along, ink);
    drawNames(pen, view, graph, zoomedIn ? 3 : streets ? 2 : 0, zoomedIn ? ALL_NAMES : streets ? STREET_NAMES : MAIN_NAMES, ink);
    drawCar(pen, view, car.x, car.z, car.heading, 11, ink);
    if (cursor) {
      pen.strokeStyle = ink.accent;
      pen.lineWidth = 2;
      pen.beginPath();
      pen.arc(cursor.x, cursor.y, 12, 0, Math.PI * 2);
      pen.stroke();
    }
  }

  dispose(): void {
    this.abort.abort();
  }
}
