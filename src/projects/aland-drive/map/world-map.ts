import type { ChallengeBoard } from "../challenge/board";
import type { Discovery } from "./discovery";
import { drawCar, drawChallenges, drawNames, drawPlaces, drawPlayers, drawRoads, drawRoute, placeAt, type MapInk, type MapPlayer, type MapView } from "./draw";
import type { MapTarget } from "../render/map-camera";
import type { RoadGraph, Route } from "./road-graph";

/*
 * What's drawn over the game's render on the way up to the map, and the input
 * there. The map is no screen of its own: `render/map-camera.ts` flies the camera
 * from the car to a view of the main island, north up. This holds how far along
 * that flight things are, and takes the mouse and a pad to zoom, pan and pick once
 * it has arrived: none of that moves the flight, so zooming can't leave the map.
 * It draws the road network, route, names, the places to find and the car on a
 * clear canvas above the render, with the challenges' starts. A pick on a place routes to the place itself, and on a challenge to its start ring. Roads keep a width on screen, so they stay legible from any height, and
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

const FLIGHT_S = 1.6;
const PAD_CURSOR_PX_S = 420;
const PAD_PAN_PX_S = 700;
const PAD_ZOOM_S = 2.5;
const WHEEL_ZOOM = 1.0015;
/** The closest the map comes: streets and their names, with the land's height still small against the camera's. */
const LOWEST_M = 3000;
/** Past this zoom, streets; past the next, everything, with room for more names. */
const STREETS_FROM_SCALE = 0.05;
const ALL_FROM_SCALE = 0.13;
const MAIN_NAMES = 18;
const STREET_NAMES = 40;
const ALL_NAMES = 60;
const ROADS_THICKEN_FROM_SCALE = 0.02;
/** Another player moving this far on screen redraws the map. */
const PLAYER_REDRAW_PX = 2;
/** Other players stay this far inside the canvas's edge. */
const PLAYER_MARGIN_PX = 16;
const PLACE_PX = 10;
/** A found place's note, under the cursor, wraps at this width. */
const NOTE_WIDTH_PX = 300;

export class WorldMap {
  /** How far along the camera's flight things are, 0 at the car and 1 at the map, and which way it's going. */
  flight = 0;
  wanted = false;
  /** The map's own view: how high as a share of the height that shows all of Åland, and how far from that view's middle. */
  private heightShare = 1;
  private opened = false;
  private panX = 0;
  private panZ = 0;
  private whole: MapTarget | null = null;
  private view: MapView | null = null;
  private stale = true;
  private cursor: { x: number; y: number } | null = null;
  private car = { x: 0, z: 0, heading: 0 };
  private route: Route | null = null;
  private along = 0;
  private players: readonly MapPlayer[] = [];
  private drawnPlayers: readonly MapPlayer[] = [];
  /** How many other players the map last drew. */
  playersDrawn = 0;
  private drawnFound = -1;
  private drawnChallenges = -1;
  private dragFrom: { x: number; y: number; moved: boolean } | null = null;
  private readonly pen: CanvasRenderingContext2D;
  private readonly abort = new AbortController();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly graph: RoadGraph,
    private readonly ink: MapInk,
    private readonly discovery: Discovery,
    private readonly challenges: ChallengeBoard,
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
      this.moveCursor(event.offsetX, event.offsetY);
      const drag = this.dragFrom;
      if (drag && Math.hypot(event.offsetX - drag.x, event.offsetY - drag.y) > 4) {
        drag.moved = true;
        this.panBy(drag.x - event.offsetX, drag.y - event.offsetY);
        drag.x = event.offsetX;
        drag.y = event.offsetY;
      }
    }, { signal });
    canvas.addEventListener("pointerup", (event) => {
      if (this.dragFrom && !this.dragFrom.moved) this.pickAt(event.offsetX, event.offsetY);
      this.dragFrom = null;
    }, { signal });
    canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      this.zoomAt(event.offsetX, event.offsetY, WHEEL_ZOOM ** event.deltaY);
    }, { signal, passive: false });
  }

  private panBy(screenX: number, screenY: number): void {
    if (!this.view || this.flight < 1) return;
    this.panX += screenX / this.view.scale;
    this.panZ += screenY / this.view.scale;
    this.stale = true;
  }

  /** Changes the height by a factor, keeping the ground under a point of the screen where it is. */
  private zoomAt(screenX: number, screenY: number, by: number): void {
    const { view, whole } = this;
    if (!view || !whole || this.flight < 1) return;
    const next = Math.max(LOWEST_M / whole.heightM, Math.min(1, this.heightShare * by));
    const [groundX, groundZ] = view.toWorld(screenX, screenY);
    const kept = next / this.heightShare;
    this.panX = groundX + (whole.x + this.panX - groundX) * kept - whole.x;
    this.panZ = groundZ + (whole.z + this.panZ - groundZ) * kept - whole.z;
    this.heightShare = next;
    this.stale = true;
  }

  /** Where the flight ends, from the view that shows all of Åland, how far that view reaches from its middle, and the view the map opens on. */
  target(whole: MapTarget, reachX: number, reachZ: number, opening: MapTarget): MapTarget {
    this.whole = whole;
    if (!this.opened) {
      this.opened = true;
      this.heightShare = Math.min(1, opening.heightM / whole.heightM);
      this.panX = opening.x - whole.x;
      this.panZ = opening.z - whole.z;
    }
    const roomX = reachX * (1 - this.heightShare);
    const roomZ = reachZ * (1 - this.heightShare);
    this.panX = Math.max(-roomX, Math.min(roomX, this.panX));
    this.panZ = Math.max(-roomZ, Math.min(roomZ, this.panZ));
    return { ...whole, x: whole.x + this.panX, z: whole.z + this.panZ, heightM: whole.heightM * this.heightShare };
  }

  private moveCursor(x: number, y: number): void {
    this.cursor = { x, y };
    this.stale = true;
  }

  private pickAt(x: number, y: number): void {
    if (!this.view || this.flight < 1) return;
    const place = placeAt(this.view, this.challenges.marks(), x, y, PLACE_PX + 4) ?? placeAt(this.view, this.discovery.places, x, y, PLACE_PX + 4);
    const [worldX, worldZ] = place ? [place.x, place.z] : this.view.toWorld(x, y);
    this.onPick(worldX, worldZ);
  }

  startAt(carX: number, carZ: number, heading: number, route: Route | null, along: number): void {
    this.car = { x: carX, z: carZ, heading };
    this.route = route;
    this.along = along;
    this.cursor = null;
    this.opened = false;
    this.stale = true;
    this.canvas.width = this.canvas.clientWidth;
    this.canvas.height = this.canvas.clientHeight;
  }

  /** Everyone else who's online, each frame: the map redraws once one has moved enough to see. */
  setPlayers(players: readonly MapPlayer[]): void {
    this.players = players;
    const last = this.drawnPlayers;
    const scale = this.view?.scale ?? 0;
    if (players.length !== last.length || players.some((player, index) => player.name !== last[index].name || Math.hypot(player.x - last[index].x, player.z - last[index].z) * scale >= PLAYER_REDRAW_PX)) this.stale = true;
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

  /** Moves the flight on by a frame, and a pad's steady inputs with it. */
  step({ stickX, stickY, panX, panY, zoom }: PadSteer, seconds: number): void {
    const view = this.view;
    if (view && this.flight === 1) {
      const { x, y } = this.cursor ?? { x: view.width / 2, y: view.height / 2 };
      if (stickX !== 0 || stickY !== 0) {
        this.moveCursor(
          Math.max(0, Math.min(view.width, x + stickX * PAD_CURSOR_PX_S * seconds)),
          Math.max(0, Math.min(view.height, y + stickY * PAD_CURSOR_PX_S * seconds)),
        );
      }
      if (panX !== 0 || panY !== 0) this.panBy(panX * PAD_PAN_PX_S * seconds, panY * PAD_PAN_PX_S * seconds);
      if (zoom !== 0) this.zoomAt(x, y, Math.exp(-zoom * PAD_ZOOM_S * seconds));
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
    if (this.drawnFound !== this.discovery.revision || this.drawnChallenges !== this.challenges.revision) this.stale = true;
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
    const { discovery } = this;
    drawPlaces(pen, view, discovery.places.map((place) => ({ place, found: discovery.isFound(place) })), PLACE_PX, ink, streets);
    this.drawnFound = discovery.revision;
    const challenges = this.challenges.marks();
    drawChallenges(pen, view, challenges, PLACE_PX, ink, streets);
    this.drawnChallenges = this.challenges.revision;
    drawPlayers(pen, view, this.players, 10, ink, { margin: PLAYER_MARGIN_PX }, true);
    this.drawnPlayers = this.players;
    this.playersDrawn = this.players.length;
    drawCar(pen, view, car.x, car.z, car.heading, 11, ink);
    if (cursor && this.flight === 1) {
      pen.strokeStyle = ink.accent;
      pen.lineWidth = 2;
      pen.beginPath();
      pen.arc(cursor.x, cursor.y, 12, 0, Math.PI * 2);
      pen.stroke();
      const challenge = placeAt(view, challenges, cursor.x, cursor.y, PLACE_PX + 4);
      const place = challenge ? null : placeAt(view, discovery.places, cursor.x, cursor.y, PLACE_PX + 4);
      if (challenge) this.drawCard({ name: challenge.title, note: null, colour: challenge.passed ? ink.pass : ink.challenge }, cursor.x, cursor.y);
      else if (place) {
        const found = discovery.isFound(place);
        this.drawCard({ name: place.name, note: found ? place.note : null, colour: found ? ink.place : ink.ink }, cursor.x, cursor.y);
      }
    }
  }

  /** A name by the cursor, in its colour, with a note under it where there is one: a found place's. */
  private drawCard({ name, note, colour }: { name: string; note: string | null; colour: string }, x: number, y: number): void {
    const { pen, ink, view } = this;
    if (!view) return;
    pen.font = "600 14px system-ui, sans-serif";
    const nameWidth = pen.measureText(name).width;
    const lines = [{ text: name, bold: true }];
    if (note !== null) {
      pen.font = "400 13px system-ui, sans-serif";
      let current = "";
      for (const word of note.split(" ")) {
        const next = current === "" ? word : `${current} ${word}`;
        if (pen.measureText(next).width > NOTE_WIDTH_PX && current !== "") {
          lines.push({ text: current, bold: false });
          current = word;
        } else current = next;
      }
      if (current !== "") lines.push({ text: current, bold: false });
    }
    const pad = 10;
    const lineHeight = 18;
    const width = Math.max(nameWidth, note !== null ? NOTE_WIDTH_PX : 0) + pad * 2;
    const height = lines.length * lineHeight + pad * 2 - 4;
    const left = Math.min(x + 18, view.width - width - 4);
    const top = Math.min(y + 18, view.height - height - 4);
    pen.globalAlpha = 0.92;
    pen.fillStyle = ink.shade;
    pen.fillRect(left, top, width, height);
    pen.globalAlpha = 1;
    pen.strokeStyle = colour;
    pen.lineWidth = 1.5;
    pen.strokeRect(left, top, width, height);
    pen.textAlign = "left";
    pen.textBaseline = "top";
    lines.forEach(({ text, bold }, index) => {
      pen.font = bold ? "600 14px system-ui, sans-serif" : "400 13px system-ui, sans-serif";
      pen.fillStyle = bold ? colour : ink.ink;
      pen.fillText(text, left + pad, top + pad + index * lineHeight);
    });
  }

  dispose(): void {
    this.abort.abort();
  }
}
