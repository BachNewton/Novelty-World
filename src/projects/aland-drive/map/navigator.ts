import type { ChallengeBoard } from "../challenge/board";
import type { Discovery } from "./discovery";
import { drawCar, drawChallenges, drawLand, drawNames, drawPlaces, drawPlayers, drawRoads, drawRoute, flatView, type MapInk, type MapPlayer, type SharpLand } from "./draw";
import type { RoadGraph, Route } from "./road-graph";
import type { OverviewFormat } from "../render/tile";

/*
 * The car's place on the road network, as the drive goes on: the road it's on,
 * the GPS route and the next direction, and the mini map, which turns with the
 * car, with the places to find and the challenges' starts on it. A
 * challenge's route is held as it is, never rerouted, since its gates are on
 * it. Each frame hands it the car and it works
 * out what changed; nothing here has a clock.
 */

/** What the HUD shows of the route. */
export interface RouteCue {
  /** Radians clockwise of the next turn, 0 when the road just goes on to the end. */
  radians: number;
  /** To the turn. */
  metres: number;
  /** To the end of the route. */
  remainingM: number;
}

export interface NavigatorEvents {
  /** The car has entered a named road. */
  onRoad: (name: string) => void;
}

/** Off the road by more than this, the name stays what it was. */
const ON_ROAD_M = 14;
/** A new name has to last this far, so crossing a junction shows nothing. */
const ROAD_SETTLES_M = 25;
const OFF_ROUTE_M = 60;
/** After a reroute, how far the car must go before another. */
const REROUTE_EVERY_M = 120;
const ARRIVED_M = 40;
const FOLLOW_SEARCH_M = 90;
const FOLLOW_STEP_M = 3;
/** A pixel or two on the mini map: drawing it costs the frame more than a step behind costs the eye. */
const REDRAW_MOVED_M = 6;
const REDRAW_TURNED_RADIANS = 0.04;
const MINI_NEAR_SCALE = 0.34;
const MINI_FAR_SCALE = 0.17;
const MINI_FAR_SPEED_MS = 45;
const MINI_LAND_DIM = 0.35;
const MINI_NAMES = 4;
const MINI_PLACE_PX = 7;
/** Other players stay this far inside the mini map's rim. */
const MINI_RIM_PX = 12;

export class Navigator {
  route: Route | null = null;
  /** A challenge's route, which the car is sent back to rather than rerouted from. */
  private held = false;
  private along = 0;
  private shownRoad = "";
  private pendingRoad = "";
  private pendingSince = { x: 0, z: 0 };
  private lastRoute = { x: Number.NaN, z: Number.NaN };
  private lastRead = { x: Number.NaN, z: Number.NaN };
  private lastDraw = { x: Number.NaN, z: Number.NaN, turn: 0, route: null as Route | null, land: 0, found: 0, challenges: 0 };
  private lastPlayers: readonly MapPlayer[] = [];
  /** How many other players the mini map last drew. */
  playersDrawn = 0;
  private readonly pen: CanvasRenderingContext2D;

  constructor(
    private readonly graph: RoadGraph,
    private readonly land: OffscreenCanvas,
    private readonly format: OverviewFormat,
    private readonly sharp: SharpLand,
    private readonly mini: HTMLCanvasElement,
    private readonly ink: MapInk,
    private readonly discovery: Discovery,
    private readonly challenges: ChallengeBoard,
    private readonly events: NavigatorEvents,
  ) {
    const pen = mini.getContext("2d");
    if (!pen) throw new Error("no 2D canvas for the mini map");
    this.pen = pen;
  }

  /** Sets the GPS to a place on the map, from where the car is. False when no road leads there. */
  setDestination(fromX: number, fromZ: number, headingClockwise: number, toX: number, toZ: number): boolean {
    const route = this.graph.route(fromX, fromZ, headingClockwise, toX, toZ);
    this.route = route;
    this.held = false;
    this.along = 0;
    this.lastRoute = { x: fromX, z: fromZ };
    return route !== null;
  }

  /** A route laid elsewhere, a challenge's, kept as it is however far the car strays from it. */
  holdRoute(route: Route): void {
    this.route = route;
    this.held = true;
    this.along = 0;
  }

  clearRoute(): void {
    this.route = null;
    this.held = false;
  }

  get alongRoute(): number {
    return this.along;
  }

  private follow(x: number, z: number): number {
    const line = (this.route as Route).line;
    let nearest = Infinity;
    let best = this.along;
    for (let along = Math.max(0, this.along - FOLLOW_SEARCH_M); along <= Math.min(line.length, this.along + FOLLOW_SEARCH_M); along += FOLLOW_STEP_M) {
      const point = line.at(along);
      const distance = Math.hypot(point.x - x, point.z - z);
      if (distance < nearest) {
        nearest = distance;
        best = along;
      }
    }
    this.along = best;
    return nearest;
  }

  /** Where the route has got to, once per frame. */
  private updateRoute(x: number, z: number, headingClockwise: number): RouteCue | null {
    if (!this.route) return null;
    const off = this.follow(x, z);
    const { line, turns, end } = this.route;
    if (Math.hypot(end.x - x, end.z - z) < ARRIVED_M) {
      this.route = null;
      return null;
    }
    if (!this.held && off > OFF_ROUTE_M && Math.hypot(this.lastRoute.x - x, this.lastRoute.z - z) > REROUTE_EVERY_M) {
      this.setDestination(x, z, headingClockwise, end.x, end.z);
      return null;
    }
    const remainingM = line.length - this.along;
    const next = turns.find((turn) => turn.along > this.along);
    return next ? { radians: next.radians, metres: next.along - this.along, remainingM } : { radians: 0, metres: remainingM, remainingM };
  }

  private updateRoad(x: number, z: number): void {
    if (Math.hypot(this.lastRead.x - x, this.lastRead.z - z) < 4) return;
    this.lastRead = { x, z };
    const spot = this.graph.nearest(x, z, ON_ROAD_M);
    const name = spot ? this.graph.roadName(spot.edge) : "";
    if (name === "" || name === this.shownRoad) {
      this.pendingRoad = "";
      return;
    }
    if (name !== this.pendingRoad) {
      this.pendingRoad = name;
      this.pendingSince = { x, z };
      return;
    }
    if (Math.hypot(this.pendingSince.x - x, this.pendingSince.z - z) < ROAD_SETTLES_M) return;
    this.shownRoad = name;
    this.pendingRoad = "";
    this.events.onRoad(name);
  }

  private playersMoved(players: readonly MapPlayer[]): boolean {
    const last = this.lastPlayers;
    return players.length !== last.length || players.some((player, index) => player.name !== last[index].name || Math.hypot(player.x - last[index].x, player.z - last[index].z) >= REDRAW_MOVED_M);
  }

  private drawMini(x: number, z: number, headingClockwise: number, speedMS: number, players: readonly MapPlayer[]): void {
    const last = this.lastDraw;
    const unchanged = Math.hypot(last.x - x, last.z - z) < REDRAW_MOVED_M && Math.abs(last.turn - headingClockwise) < REDRAW_TURNED_RADIANS && last.route === this.route && last.land === this.sharp.revision && last.found === this.discovery.revision && last.challenges === this.challenges.revision && !this.playersMoved(players);
    if (unchanged) return;
    this.lastDraw = { x, z, turn: headingClockwise, route: this.route, land: this.sharp.revision, found: this.discovery.revision, challenges: this.challenges.revision };
    this.lastPlayers = players;
    const { width, height } = this.mini;
    const share = Math.min(speedMS / MINI_FAR_SPEED_MS, 1);
    const view = flatView(x, z, MINI_NEAR_SCALE + share * (MINI_FAR_SCALE - MINI_NEAR_SCALE), headingClockwise, width, height, width / 2, height * 0.62);
    const { pen, ink } = this;
    drawLand(pen, view, this.land, this.format, this.sharp, ink, MINI_LAND_DIM);
    drawRoads(pen, view, this.graph, 3, ink);
    if (this.route) drawRoute(pen, view, this.route, this.along, ink);
    drawNames(pen, view, this.graph, 2, MINI_NAMES, ink);
    drawPlaces(pen, view, this.discovery.places.map((place) => ({ place, found: this.discovery.isFound(place) })), MINI_PLACE_PX, ink, false);
    drawChallenges(pen, view, this.challenges.marks(), MINI_PLACE_PX, ink, false);
    drawPlayers(pen, view, players, 8, ink, { circle: [width / 2, height / 2, width / 2 - MINI_RIM_PX] }, false);
    this.playersDrawn = players.length;
    drawCar(pen, view, x, z, headingClockwise, 9, ink);
  }

  /** Every frame the car can move, with everyone else who's online. */
  update(x: number, z: number, headingClockwise: number, speedMS: number, players: readonly MapPlayer[]): RouteCue | null {
    const cue = this.updateRoute(x, z, headingClockwise);
    this.updateRoad(x, z);
    this.drawMini(x, z, headingClockwise, speedMS, players);
    return cue;
  }
}
