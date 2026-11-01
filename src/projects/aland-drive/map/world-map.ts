import { drawCar, drawNames, drawRoads, drawRoute, type MapInk, type MapView } from "./draw";
import type { RoadGraph, Route } from "./road-graph";

/*
 * What's drawn over the game's render on the way up to the map, and the input
 * there. The map is no screen of its own: `render/map-camera.ts` flies the camera
 * from the car to one fixed view of the whole island, north up. This holds how far
 * along that flight things are, takes a place to go to from the mouse or a pad,
 * and draws the road network, route, names and car on a clear canvas above the
 * render. Roads keep a width on screen, so they stay legible from any height, and
 * the canvas fades in with altitude as the car becomes too small to see.
 */

const FLIGHT_S = 1.6;
const PAD_CURSOR_PX_S = 420;
/** Past this zoom, streets; past the next, everything, with room for more names. */
const STREETS_FROM_SCALE = 0.05;
const ALL_FROM_SCALE = 0.13;
const MAIN_NAMES = 18;
const STREET_NAMES = 40;
const ALL_NAMES = 60;
const ROADS_THICKEN_FROM_SCALE = 0.02;

export class WorldMap {
  /** How far along the camera's flight things are, 0 at the car and 1 at the map, and which way it's going. */
  flight = 0;
  wanted = false;
  private view: MapView | null = null;
  private stale = true;
  private cursor: { x: number; y: number } | null = null;
  private car = { x: 0, z: 0, heading: 0 };
  private route: Route | null = null;
  private along = 0;
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
    canvas.addEventListener("pointermove", (event) => {
      this.moveCursor(event.offsetX, event.offsetY);
    }, { signal });
    canvas.addEventListener("click", (event) => {
      this.pickAt(event.offsetX, event.offsetY);
    }, { signal });
  }

  private moveCursor(x: number, y: number): void {
    this.cursor = { x, y };
    this.stale = true;
  }

  private pickAt(x: number, y: number): void {
    if (!this.view || this.flight < 1) return;
    const [worldX, worldZ] = this.view.toWorld(x, y);
    this.onPick(worldX, worldZ);
  }

  startAt(carX: number, carZ: number, heading: number, route: Route | null, along: number): void {
    this.car = { x: carX, z: carZ, heading };
    this.route = route;
    this.along = along;
    this.cursor = null;
    this.stale = true;
    this.canvas.width = this.canvas.clientWidth;
    this.canvas.height = this.canvas.clientHeight;
  }

  setRoute(route: Route | null): void {
    this.route = route;
    this.along = 0;
    this.stale = true;
  }

  /** The cursor's place, for a pad's press. */
  pick(): void {
    if (!this.view) return;
    const { x, y } = this.cursor ?? { x: this.view.width / 2, y: this.view.height / 2 };
    this.pickAt(x, y);
  }

  /** Moves the flight on by a frame, and a pad's cursor with it. */
  step(stick: { x: number; y: number }, seconds: number): void {
    const view = this.view;
    if (view && this.flight === 1 && (stick.x !== 0 || stick.y !== 0)) {
      const { x, y } = this.cursor ?? { x: view.width / 2, y: view.height / 2 };
      this.moveCursor(
        Math.max(0, Math.min(view.width, x + stick.x * PAD_CURSOR_PX_S * seconds)),
        Math.max(0, Math.min(view.height, y + stick.y * PAD_CURSOR_PX_S * seconds)),
      );
    }
    const next = Math.max(0, Math.min(1, this.flight + ((this.wanted ? 1 : -1) * seconds) / FLIGHT_S));
    if (next !== this.flight) this.stale = true;
    this.flight = next;
    if (next === 0 && !this.wanted) this.onLeave();
  }

  /** Holds the camera at a place along the flight, for tools. */
  holdAt(flight: number): void {
    this.flight = flight;
    this.wanted = flight > 0;
    this.stale = true;
  }

  /** Draws what goes over the render, seen from this frame's camera, faded by `shown`. */
  draw(view: MapView, shown: number): void {
    this.view = view;
    this.canvas.style.opacity = String(shown);
    if (shown === 0 || !this.stale) return;
    this.stale = false;
    const { pen, graph, ink, cursor, car } = this;
    pen.clearRect(0, 0, view.width, view.height);
    const zoomedIn = view.scale >= ALL_FROM_SCALE;
    const streets = view.scale >= STREETS_FROM_SCALE;
    // Thin near the car, where the road itself shows, and full width by the time it can't.
    drawRoads(pen, view, graph, zoomedIn ? 3 : streets ? 2 : 1, ink, Math.min(1, 0.5 + ROADS_THICKEN_FROM_SCALE / view.scale));
    if (this.route) drawRoute(pen, view, this.route, this.along, ink);
    drawNames(pen, view, graph, zoomedIn ? 3 : streets ? 2 : 0, zoomedIn ? ALL_NAMES : streets ? STREET_NAMES : MAIN_NAMES, ink);
    drawCar(pen, view, car.x, car.z, car.heading, 11, ink);
    if (cursor && this.flight === 1) {
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
