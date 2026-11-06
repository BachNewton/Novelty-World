import { BufferAttribute, BufferGeometry, ClampToEdgeWrapping, DataTexture, Group, LinearFilter, LinearMipmapLinearFilter, Matrix4, Mesh, MeshBasicNodeMaterial, NoColorSpace, PerspectiveCamera, Plane, PlaneGeometry, Raycaster, RGBAFormat, Scene, TimestampQuery, Vector2, Vector3, WebGPURenderer, type Node, type Texture } from "three/webgpu";
import { all, attribute, cameraPosition, dFdx, dFdy, exp, float, fwidth, greaterThanEqual, int, ivec2, lessThan, max, mix, positionWorld, select, smoothstep, texture, textureLoad, uniform, vec2, vec3 } from "three/tsl";
import { themeColor } from "@/shared/lib/three/theme-color";
import { startFreeCamera, type View } from "./free-camera";
import { createLaneOverlay } from "./lane-overlay";
import { LaneNet } from "../traffic/lane-net";
import { TrafficContact } from "../traffic/contact";
import { LaneTraffic, type LaneCar } from "../traffic/lane-driver";
import { eyeOf, sees, type Eye } from "../traffic/sight";
import { createLaneTrafficView, sightOf, TRAFFIC_KINDS } from "./lane-traffic";
import { createCyclistsView } from "./cyclists";
import { Bubble } from "../traffic/bubble";
import { REACH_M as CAR_REACH_M } from "../art/cars/fleet";
import { BIKE_REACH_M } from "../art/bikes";
import { indicatorClock } from "../art/cars/material";
import { BAKED_SKY_SHARE, BAKED_SUN_SHARE, FLAT_LIGHT, RING_POINTS, SHADE_SHARE, type WorldManifest } from "./tile";
import { startChaseCamera } from "./chase-camera";
import { buildingMaterial, buildingMeshes } from "./buildings";
import { createDocks } from "./docks";
import { createBoatsUnderWay, type UnderWay } from "./boats-under-way";
import { createSeaMarks } from "./sea-marks";
import { seaClock, seaSeconds } from "../sea/clock";
import { createDayAndNight } from "./day-and-night";
import { createNightLights } from "./night-lights";
import { dateText, type CalendarDate } from "../time/day";
import { bakedLightAtHour, createHeadlights, forestAtHour, type CarAtNight, landAtHour, seaAtHour, seaInLand, type Night } from "../art/night";
import { towardsPlace } from "../art/sun";
import { terrainLightAsked } from "./terrain-light";
import { createPeople } from "./people";
import { createRegattas } from "./regatta";
import { createLandmarks } from "./landmarks";
import { createRuralBuildings } from "./rural-buildings";
import { createWindmills } from "./windmills";
import { createStoneWalls, type StoneWallsDrawn } from "./stone-walls";
import { createRoadside } from "./roadside";
import { createParkedCars } from "./parked-cars";
import { createBuildingAddOns } from "./building-add-ons";
import { townMaterials } from "../art/town-kit/material";
import { createClipmap } from "./clipmap";
import { createForest, forestKnobs, type ForestDrawn, type ForestSettings } from "./forest";
import { canopyLift, tileReads } from "./tile-reads";
import { createReeds, type ReedsDrawn } from "./reeds";
import { createShrubs, type ShrubsDrawn } from "./shrubs";
import { createGranite, type GraniteDrawn } from "./granite";
import { createVerge, type VergeDrawn } from "./verge";
import { createWallClearing, FAR_CLEARING, furnitureClearances, NEAR_CLEARING } from "./wall-clearing";
import { createWater, shoreOfDepth, shoreOfLand, WATER_SHORE_MIP } from "./water";
import { DASH_LENGTH_M, RIBBON_CELL_M } from "./roads";
import { mapCameraAt, type ChasePose, type MapTarget } from "./map-camera";
import { SHOWCASE, type ShowcaseSpot } from "./showcase";
import { PLAYGROUND_SPOTS } from "../playground/layout";
import { playgroundAsked } from "../playground/place";
import { placeAsked, placeLink } from "./start-place";
import { DETAIL_SEEN_M, distanceToTile, FAR_LOAD_M, TileFetcher, TileStream, type StreamStats } from "./stream";
import { tileBase } from "./tile-address";
import { TileLayers } from "./tile-layers";
import { createDriveAudio } from "../audio/graph";
import { stateFromCar } from "../audio/model";
import { useDriveSoundSettings } from "../audio/settings";
import { audioContext } from "@/shared/lib/sound";
import { createCarView } from "../art/cars/model";
import { fitCarVolume, placeCarVolume } from "../art/car-volume";
import { createRemoteCarViews, lightsOf } from "./remote-cars";
import { createTyreParticles } from "./tyre-particles";
import { createOnlineWorld } from "../net/online-world";
import { GAME } from "../net/protocol";
import { createRoom, stopOnPageHide, type RoomState } from "@/shared/lib/peer";
import type { PlayerProfile } from "@/shared/lib/profile";
import { CARS, PLAYER_CAR } from "../art/cars/specs";
import { createSky, skyLooks } from "../art/sky/sky";
import { band, createSignSheet, detailTexture, dressRoad, groundDetail, junctionMarks, pulses, type RoadAttributes } from "../art/surfaces";
import { townGround, townRibbon, townRibbonBits } from "../art/town-ground";
import { RURAL_PARTS, ruralColours, ruralMaterials, type RuralPart } from "../art/rural/index";
import { createSignKit, roadsideMaterials, wireMaterial } from "../art/roadside/index";
import { streetMaterials } from "../art/street/index";
import { identityMaterials } from "../art/identity/index";
import { startControls, type GameAction, type MapAction } from "../input/controls";
import { drivingMenu, type GameMenu, type MenuItemId } from "./game-menu";
import { createChallengeMarks } from "./challenge-marks";
import { ChallengeBoard, ringCentre } from "../challenge/board";
import { challengeRoute, runOn } from "../challenge/line";
import { CHALLENGES } from "../challenge/list";
import { PASSES_KEY } from "../challenge/passes";
import { countdownLeftS, gatesPassed, partnerNeeds, type Outcome } from "../challenge/run";
import { ChallengeSession, type SessionHost, type SessionPhase } from "../challenge/session";
import { CoopLink, type CoopNotice } from "../challenge/coop";
import type { ChallengeMessage, ChallengeType } from "../net/protocol";
import type { Challenge, ChallengeKind, StartPlace } from "../challenge/types";
import { landImage, mapInk, SharpLand, type MapPlayer, type MapView } from "../map/draw";
import { Discovery } from "../map/discovery";
import { Navigator } from "../map/navigator";
import type { Place as FindablePlace } from "../map/places";
import { getProjectStorage } from "@/shared/lib/storage";
import { RoadGraph } from "../map/road-graph";
import { WorldMap } from "../map/world-map";
import { Autopilot } from "../sim/autopilot";
import { NO_INPUT, type DriveInput } from "../sim/car";
import { headingOf, speedOf, type CarState } from "../sim/car-state";
import { Drive, emptyLog, initPhysics, START_ALONG_M, type DriveLog } from "../sim/drive";
import { RoadLine, chainLine } from "../sim/road-net";
import { placeAround } from "../sim/surroundings";
import { STEP_S } from "../sim/tuning";
import { CARS as TUNINGS, carAsked, type CarId } from "../sim/cars";
import { TYRES, tyresAsked, type Condition, type Surface, type Tyre } from "../sim/surfaces";
import { groundCondition } from "../climate/feed";
import { fitTyres, tyresOn } from "../garage/tyres";
import { World, type TileDetail } from "../sim/world";
import type { InputKind } from "@/shared/lib/input";
import { tiledGround } from "../art/surfaces/tiled";

/*
 * Åland Drive drawn on WebGPU, with no framework between the game and
 * three.js: one renderer, one scene, one loop. The world is real tiles of the
 * island, streamed in round the car (`stream.ts`): one terrain mesh for all of
 * them (`clipmap.ts`), lit by shading baked ahead of time, and their road
 * surfaces, which are also what the car drives on (`sim/`). The simulation steps
 * at a fixed rate; each frame draws the car between its last two steps.
 */

/** A camera place in ETRS-TM35FIN metres, with its height above the ground. */
export interface Place {
  east: number;
  north: number;
  height: number;
  yaw: number;
  pitch: number;
}

export type CameraMode = "chase" | "free";

/** A control surface for tests and tools: everything here waits on events, never time. */
export interface GameProbe {
  /** Frames drawn so far. */
  frames: () => number;
  look: (at: Place) => void;
  /** What the last frame cost, counted, and how big it was drawn. */
  counts: () => { webGpu: boolean; drawCalls: number; triangles: number; gpuMs: number | null; width: number; height: number };
  forestDrawn: () => ForestDrawn;
  vergeDrawn: () => VergeDrawn;
  /** Shows the verge or leaves it out, to see what it does. */
  showVerge: (shown: boolean) => void;
  /** How many of each roadside object stand across the loaded tiles. */
  roadsideCounts: () => Record<string, number>;
  /** Shows the lamps, poles, signs, rails and the rest beside the roads, or leaves them out, to see what they do. */
  showRoadside: (shown: boolean) => void;
  /** How many people the loaded tiles hold, and the triangles three counts for them. */
  peopleCounts: () => { figures: number; triangles: number };
  /** Shows the people or leaves them out, to see what they cost. */
  showPeople: (shown: boolean) => void;
  /** How many cars are parked across the loaded tiles, and how many are near enough to be on the near and the stand-in lists. */
  parkedCounts: () => { parked: number; near: number; distant: number };
  /** The villa add-ons, supermarket entrances, and terminal and fuel stations on the loaded tiles. */
  addOnCounts: () => { villas: number; entrances: number; nearSites: number };
  /** Shows the parked cars or leaves them out, to see what they do. */
  showParked: (shown: boolean) => void;
  /** The loaded tiles' lane maps, joined at their seams. */
  lanes: () => LaneNet;
  /** Draws the lanes and connectors over the road, coloured by right of way, or leaves them out. */
  showLanes: (shown: boolean) => void;
  /** Fills the lanes round the camera with cars at a density, 1 for Åland's own and 0 for none, and whether they see the player's car from now on. */
  traffic: (density: number, options?: { withPlayer?: boolean }) => void;
  /** The same for cyclists, on the paths and the roads' edges. */
  cyclists: (density: number) => void;
  /** How many cars and cyclists ride the lanes, how many of them are stopped giving way, how many cars have been hit out of traffic, and how many the bubble has made and taken away. */
  trafficCounts: () => { cars: number; bikes: number; waiting: number; hit: number; spawned: number; gone: number };
  /** Every car and cyclist on the lanes, as the driver holds it. */
  trafficCars: () => LaneCar[];
  /** Whether the camera could see a car or cyclist where it stands now: in view, within its kind's reach and not behind the ground. */
  trafficSeen: (car: Pick<LaneCar, "kind" | "pose" | "half">) => boolean;
  reedsDrawn: () => ReedsDrawn;
  /** Shows the reed beds or leaves them out, to see what they do. */
  showReeds: (shown: boolean) => void;
  shrubsDrawn: () => ShrubsDrawn;
  graniteDrawn: () => GraniteDrawn;
  /** Shows the bushes, junipers and young birches or leaves them out, to see what they do. */
  showShrubs: (shown: boolean) => void;
  showGranite: (shown: boolean) => void;
  stoneWallsDrawn: () => StoneWallsDrawn;
  car: () => CarState;
  log: () => DriveLog;
  /** Stops the simulation following the clock, so `advance` is all that moves it. */
  hold: (held: boolean) => void;
  /** Steps the simulation with fixed inputs, or the scripted driver when given none. */
  advance: (steps: number, input?: DriveInput) => void;
  /** Starts the scripted driver along one of the start tile's chains, from a distance along it, resetting the log. */
  startRoute: (chain: number, cruiseMS: number, from: number) => void;
  routeFinished: () => boolean;
  /** Puts the car at a distance along one of the start tile's chains, facing along it. */
  placeOnRoad: (chain: number, along: number) => void;
  setCamera: (mode: CameraMode) => void;
  /** Moves the car to a showcase spot by its id, resolving once it's there, on loaded ground. */
  jumpTo: (id: string) => Promise<void>;
  /** Moves the car to a place near a road, in a car's view, resolving once it's there, on loaded ground. */
  driveFrom: (spot: Omit<ShowcaseSpot, "id">) => Promise<void>;
  /** Tiles at full detail, and what loading them has read. */
  stream: () => StreamStats;
  /** Loads the tiles round a place, wherever the car is, until `loadAround(null)`. */
  loadAround: (place: { x: number; z: number } | null) => void;
  /** The scripted driver along a line of (x, y, z) points in the scene, from its start, resetting the log. */
  startLine: (points: number[], cruiseMS: number) => void;
  /** True once the road network has arrived, so the maps and the GPS work. */
  mapReady: () => boolean;
  /** What picking a place on the world map does, and whether a road led there. */
  setDestination: (x: number, z: number) => boolean;
  /** The GPS route as the driver takes it: (x, y, z) points. */
  routePoints: () => number[] | null;
  /** The GPS's own route through places in order, each (x, z), for a drive that must pass them. */
  routeThrough: (places: [number, number][]) => number[];
  openMap: (open: boolean) => void;
  /** Holds the camera at a place along the flight to the map, or lets it go with null. */
  holdFlight: (flight: number | null) => void;
  /** How far along the flight to the map the camera is, 0 at the car to 1 at the map. */
  mapShown: () => number;
  /** Where the camera is, and which way it looks. */
  cameraPlace: () => number[];
  /** Puts the car on the nearest loaded road to a place. */
  placeNear: (x: number, z: number) => void;
  /** What's held: the JS heap, what the GPU holds for loaded tiles' meshes, and the fixed images. */
  memory: () => { jsMB: number; meshMB: number; texturesMB: number };
  /** The renderer's own counts of what it holds, to show nothing is left behind. */
  rendererMemory: () => Record<string, number>;
  /** Swaps the car for another, its looks, handling and sound. The drive carries on from where it was. */
  setCar: (id: CarId) => void;
  /** The car being driven. */
  carId: () => CarId;
  /** What each wheel was on the last time it touched, front left, front right, rear left, rear right. */
  surfaces: () => readonly Surface[];
  /** How many tyre particles are in the air, of the most each pool holds. */
  tyreCounts: () => { puffs: number; chips: number; puffPool: number; chipPool: number };
  showTyres: (shown: boolean) => void;
  setCondition: (condition: Condition) => void;
  /** The tyres on the car being driven. */
  tyres: () => Tyre;
  /** Where the online world stands. */
  online: () => Pick<RoomState, "status" | "role">;
  /** Everyone else online: where their car is here, whether it's drawn, and whether it touches nothing yet. */
  players: () => { peerId: string; name: string; position: number[] | null; drawn: boolean; ghost: boolean }[];
  /** How many other players each map drew last. */
  mapPlayers: () => { mini: number; world: number };
  /** The ids of the places found, once the road network has arrived. */
  foundPlaces: () => string[] | null;
  /** Pins the sea's clock (UTC seconds) so every boat under way stands where it is then, or lets it run with null. `hold` pins it too, and `advance` steps it. */
  holdSea: (seconds: number | null) => void;
  /** The game's day as drawn: the date, the hour and where the sun stands. */
  day: () => DayShown;
  /** Moves this page's day: another date (null for today's), an hour that runs on from there, or holds it. */
  setDay: (change: DayChange) => void;
  /** Shows the night's lamps, sea lights, glows and headlights or leaves them out, to see what they cost. */
  showNightLights: (shown: boolean) => void;
  /** Every boat under way, where it was last drawn. */
  boatsUnderWay: () => UnderWay[];
  showBoatsUnderWay: (shown: boolean) => void;
  /** How many of each sea mark are drawn round the camera. */
  seaMarksCounts: () => Record<string, number>;
  showSeaMarks: (shown: boolean) => void;
  /** A challenge of the page's own beside the list's, such as one a test lays on its world's roads. */
  addChallenge: (challenge: Challenge) => void;
  /** Starts a challenge solo, wherever the car is, resolving once the car is on its start line. */
  startChallenge: (id: string) => Promise<void>;
  /** The challenge being played, as its run stands, or null. */
  challenge: () => ChallengeProbe | null;
  /** The scripted driver along the challenge's route, from where the car is on it. */
  driveChallenge: (cruiseMS: number) => void;
  /** The best kept for a challenge, or null if it hasn't been passed. */
  challengeBest: (id: string) => number | null;
  /** Where this client stands in co-op, naming the other player, and how many of each challenge message it has heard. */
  coop: () => { kind: string; peer: string | null; name: string | null; heard: Partial<Record<ChallengeType, number>> };
  /** Invites the player of this name to the challenge whose start ring the car is in, as choosing Co-op does. */
  coopInvite: (name: string) => void;
  /** Accepts the invite this client has, as choosing Join does. */
  coopAccept: () => void;
  /** This player's Retry, as the menu's: false if refused while the car is still on its way to the line. */
  retryChallenge: () => boolean;
  /** Holds challenge messages as they arrive, to hand them all on in order when let go: two clients' presses before either hears the other. */
  holdChallengeMessages: (held: boolean) => void;
}

export interface ChallengeProbe {
  id: string;
  attempt: number;
  /** "placing" while the car is on its way to the start line, "waiting" on it for the partner's car. */
  phase: SessionPhase;
  clockS: number;
  gates: { passed: number; of: number };
  outcome: Outcome | null;
  seat: 0 | 1;
  players: number;
  /** Whether the partner's car is on its place for this attempt (always, solo). */
  partnerReady: boolean;
  /** Each seat's result so far. */
  results: (number | null)[];
}

/** A challenge's run as the HUD shows it. */
export interface ChallengeReading {
  title: string;
  kind: ChallengeKind;
  phase: SessionPhase;
  /** Seconds until the green light. */
  countdownS: number;
  /** Seconds since the green light. */
  clockS: number;
  /** The time to beat, or the speed to reach. */
  target: number;
  gates: { passed: number; of: number };
  /** Co-op, once the partner is in and this player isn't: the time to finish by, or the speed to reach, for the team to pass. */
  needs: number | null;
  /** The partner's name in co-op. */
  partner: string | null;
}

/** A challenge's start ring the car is in: its button starts it, or offers co-op with the other player there. */
export interface ChallengeOffer {
  title: string;
  partner: string | null;
}

/** A co-op challenge on its way: this player has asked someone, or been asked, or is joining. */
export interface CoopReading {
  kind: "inviting" | "invited" | "joining";
  name: string;
  title: string;
}

/** Something about co-op the player is told once. */
export interface CoopNoticeReading {
  kind: CoopNotice["kind"];
  name: string;
}

export interface HudReading {
  speedKmh: number;
  /** The gear as a driver reads it: R, or 1 and up. */
  gear: string;
  /** 0 to 1 at the redline. */
  revs: number;
  /** Metres the GPS route still has to go: to its destination, or in a challenge to the finish line or camera. */
  toGoM: number | null;
  /** The challenge being played. */
  challenge: ChallengeReading | null;
  /** The challenge whose start ring the car is in, which its button starts. */
  offer: ChallengeOffer | null;
  coop: CoopReading | null;
  /** The day this page shows: its date (as `?date=` takes it), the hour, and whether the sun is up. */
  clock: { date: string; hour: number; sunUp: boolean };
}

/** How far the first load has got, counted in what has landed. */
export interface LoadingProgress {
  done: number;
  total: number;
}

export interface GameEvents {
  onHud: (reading: HudReading) => void;
  /** A tile couldn't be fetched. */
  onFailure: (error: Error) => void;
  onInputKind: (kind: InputKind) => void;
  onCamera: (mode: CameraMode) => void;
  onLoading?: (progress: LoadingProgress) => void;
  /** The road network has arrived: the mini map can show. */
  onMapReady?: () => void;
  onMapOpen?: (open: boolean) => void;
  onDevMenuOpen?: (open: boolean) => void;
  /** The game menu has opened, with what it holds, or closed (null). */
  onGameMenu?: (menu: GameMenu | null) => void;
  /** Another car is being driven. */
  onCarChange?: (id: CarId) => void;
  /** The car has entered a named road. */
  onRoad?: (name: string) => void;
  /** Everyone else in the online world, by name, whenever that changes. */
  onPlayers?: (names: string[]) => void;
  /** A co-op partner left, or an invite was turned down or taken back. */
  onCoopNotice?: (notice: CoopNoticeReading) => void;
  /** The car has reached a place it hadn't found before. */
  onPlaceFound?: (place: FindablePlace) => void;
  /** How many of the places have been found and of the challenges passed, when the maps arrive and whenever either changes. */
  onProgress?: (progress: Progress) => void;
}

export interface Progress {
  places: { done: number; total: number };
  challenges: { done: number; total: number };
}

/** The online world to join, which `net/protocol.ts`'s `onlineRelay` decides; none drives alone. */
export interface OnlineOptions {
  relayUrl: string;
  code: string;
  profile: PlayerProfile;
}

/** The canvases the page keeps for the maps. */
export interface MapCanvases {
  mini: HTMLCanvasElement;
  world: HTMLCanvasElement;
}

/** A car the dev menu can offer. */
export interface CarChoice {
  id: CarId;
  name: string;
  /** A paint token, without the `--color-aland-drive-` prefix. */
  paint: string;
}

/** The game's day as drawn: the date, the hour, and where the sun stands. */
export interface DayShown {
  date: string;
  hour: number;
  sun: { azimuthDeg: number; elevationDeg: number };
  /** The night's dial, from the sun's height: 0 by day, 1 at the deepest midsummer night. */
  night: number;
  held: boolean;
  /** Whether this is the day every player shares. */
  shared: boolean;
}

export interface DayChange {
  date?: CalendarDate | null;
  hour?: number;
  held?: boolean;
}

export interface Game {
  probe: GameProbe;
  /** What a dev menu needs, so the page imports no car art. */
  cars: readonly CarChoice[];
  setCar: (id: CarId) => void;
  /** What the weather has made of every surface, until there is weather. */
  condition: () => Condition;
  day: () => DayShown;
  setDay: (change: DayChange) => void;
  setCondition: (condition: Condition) => void;
  setDevMenuOpen: (open: boolean) => void;
  setGameMenuOpen: (open: boolean) => void;
  /** Does what a game menu item says: Resume closes the menu. */
  pickMenuItem: (id: MenuItemId) => void;
  /** The showcase spots, for a dev menu to jump to. */
  spots: readonly { id: string; name: string }[];
  /** Closes the dev menu and jumps to a showcase spot. */
  jumpTo: (id: string) => void;
  /** Whether the GPS has somewhere to jump to. */
  hasDestination: () => boolean;
  /** Closes the dev menu and jumps to the end of the GPS route, facing the way it arrives. */
  jumpToDestination: () => void;
  /** Where the car and the view are, as text to paste into a chat with Claude to find the spot again. */
  whereabouts: () => string;
  /** Forgets everything this browser kept for the game and starts it again. */
  resetSave: () => void;
  dispose: () => void;
}

/** Three drops to WebGL2 by itself when it can't make a WebGPU device; this game doesn't run there. */
export class NoWebGpuError extends Error {}

export const CAMERA_FIELD_OF_VIEW = 60;
export const CAMERA_NEAR = 0.25;
/** Far enough to see the whole island from straight above. */
const CAMERA_FAR = 200000;
const SKY_REACH_M = CAMERA_FAR * 0.9;
/** Under the deepest seabed (`DEEPEST_M` in `pipeline/terrain.py`), so where the terrain reaches, it draws its own water. */
const SEA_BELOW_LAND_M = -5;
/** Land this little above the water is wet, and darker for it. */
const WET_BAND_M = 0.2;
const WET_SHADE = 0.75;
/** The 3D world is drawn at this share of the screen's real pixels each way, and stretched to fit if it's under 1. The page's UI stays sharp. */
export const RENDER_SCALE = 1;
/** What the forest draws on the floor laptop. It scales within `FOREST_MOST`. */
export const FOREST_DEFAULTS: ForestSettings = { fullReachM: 464, forestReachM: 1500, farDensity: 1 };
const LONGEST_FRAME_S = 0.1;
const POOLS_ON_GROUND_M = 280;
/** Where the headlamps sit off the car's origin, which rides at its axles' height. */
const HEADLAMPS_UP_M = 0.1;
const HEADLAMPS_AHEAD_M = 2;
/** Too many steps owed in one go means the tab was away: drop them rather than catch up. */
const MOST_STEPS_A_FRAME = 12;
/** The lane lab's traffic: room for this many cars and cyclists drawn, and the bubble round the camera judged every this many traffic steps. */
const TRAFFIC_MOST = 200;
const CYCLISTS_MOST = 120;
const BUBBLE_EVERY = 4;
/** It steps once every this many of the simulation's steps: cars with no physics need no more, and are drawn between steps. */
const TRAFFIC_EVERY = 4;
const EDGE_WALL_HEIGHT_M = 2.5;
const EDGE_WALL_STEP_M = 40;
const DASH_SHARE = 0.34;
const LINE_INSET = 0.93;
const LINE_WIDTH = 0.035;
const CENTRE_LINE_WIDTH = 0.018;
/** Ribbons stop here, within the reach of the detail images. Beyond it the terrain paints its own roads from the mask. */
const RIBBON_REACH_M = DETAIL_SEEN_M - 200;
/** Where the terrain's own roads fade in, under the ribbons, to show where a coarser ring rises through one. */
const PAINTED_ROADS_FROM_M = 250;
const PAINTED_ROADS_FULL_M = 400;
/** The 2 m shading gives way to the far shading over this run, out to where it stops being seen. */
const DETAIL_FADE_M = 400;
/** The far images give way to the overview over this run, inside the reach every tile is sure to hold them. */
const FAR_FADE_FROM_M = 4400;
const FAR_SEEN_M = 5800;
const HAZE_M = 16000;
/** Haze thins with the camera's height above this, so the island stays clear from above. */
const HAZE_CLEARS_FROM_M = 120;
/** Past this height the mask's mips blur a road into a band, so the paint fades out, and the overlay's roads fade in. */
const PAINTED_ROADS_GONE_M = 500;
const OVERLAY_FROM_M = 250;
const OVERLAY_FULL_M = 1100;
const MAP_FIELD_OF_VIEW = 45;
const storage = getProjectStorage("aland-drive");
const FOUND_KEY = "found-places";
/** Below these heights the map looks at its own place: a sharper image only shows once a screen pixel is about as small as twice the image's. */
const MAP_FAR_FROM_M = 10000;
const MAP_DETAIL_FROM_M = 3500;
/** Room round the island on the map. */
const MAP_MARGIN = 1.05;
/** How far from a GPS destination a road may be and still name where a jump there lands. */
const DESTINATION_ROAD_M = 30;
const MAP_SLOPE = Math.tan((MAP_FIELD_OF_VIEW * Math.PI) / 360);
const BUILDINGS_REACH_M = DETAIL_SEEN_M;
/** The scripted driver's line runs on past a challenge's finish, so it doesn't turn for the line's last point. */
const CHALLENGE_RUN_ON_M = 150;
/** The car on the start line and through the countdown: the handbrake, since the brake held at a standstill is reverse. */
const HELD: DriveInput = { ...NO_INPUT, handbrake: true };

export const token = (name: string) => themeColor(`--color-aland-drive-${name}`);
export const colorOf = (name: string) => {
  const { r, g, b } = token(name);
  return vec3(r, g, b);
};

/** A square of tiling random values, mipped, so it turns to a flat grey with distance rather than sparkling. */
/** A low band round the end of the world, so it reads as a barrier and not a mistake. */
function edgeBand(world: World) {
  const { tileM } = world;
  const positions: number[] = [];
  const indices: number[] = [];
  const steps = tileM / EDGE_WALL_STEP_M;
  const side = (fromX: number, fromZ: number, toX: number, toZ: number) => {
    for (let step = 0; step <= steps; step++) {
      const share = step / steps;
      const x = fromX + share * (toX - fromX);
      const z = fromZ + share * (toZ - fromZ);
      // Read a metre inside, so the end of the land's height, not the sea's beyond it.
      const ground = world.height(x + Math.sign(toZ - fromZ) * 1, z - Math.sign(toX - fromX) * 1);
      const first = positions.length / 3;
      positions.push(x, ground, z, x, ground + EDGE_WALL_HEIGHT_M, z);
      if (step > 0) indices.push(first - 2, first, first - 1, first - 1, first, first + 1);
    }
  };
  for (const { column, row } of world.all()) {
    const [west, top] = [column * tileM, row * tileM];
    if (!world.has(column, row - 1)) side(west, top, west + tileM, top);
    if (!world.has(column + 1, row)) side(west + tileM, top, west + tileM, top + tileM);
    if (!world.has(column, row + 1)) side(west + tileM, top + tileM, west, top + tileM);
    if (!world.has(column - 1, row)) side(west, top + tileM, west, top);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(Float32Array.from(positions), 3));
  geometry.setIndex(indices);
  return geometry;
}

/** A tile's bridges in the scene, one mesh, however many there are. */
function bridgeMesh({ positions, parts }: TileDetail["bridges"], material: MeshBasicNodeMaterial) {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("part", new BufferAttribute(parts, 1));
  return new Mesh(geometry, material);
}

/** Each tile's ribbon in the scene, a mesh per cell sharing its buffers, shown only within reach. */
function ribbonMeshes(detail: TileDetail, dress: RoadAttributes, townRibbons: Uint8Array, material: MeshBasicNodeMaterial) {
  const { ribbon } = detail;
  const position = new BufferAttribute(ribbon.positions, 3);
  const across = new BufferAttribute(ribbon.across, 1);
  const along = new BufferAttribute(ribbon.along, 1);
  const tier = new BufferAttribute(ribbon.tiers, 1);
  const roadInfo = new BufferAttribute(dress.surface, 4);
  const roadMark = new BufferAttribute(dress.mark, 2);
  const townBits = new BufferAttribute(townRibbonBits(townRibbons, RING_POINTS, ribbon.positions.length / 3), 3);
  const group = new Group();
  const cells = ribbon.cells.map(({ indices, x, z }) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", position);
    geometry.setAttribute("across", across);
    geometry.setAttribute("along", along);
    geometry.setAttribute("tier", tier);
    geometry.setAttribute("roadInfo", roadInfo);
    geometry.setAttribute("roadMark", roadMark);
    geometry.setAttribute("townBits", townBits);
    geometry.setIndex(new BufferAttribute(indices, 1));
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.visible = false;
    group.add(mesh);
    return { mesh, x, z };
  });
  return { group, cells };
}

/** A page with no `canvases` gets the drive with no maps. */
export async function startGame(container: HTMLElement, events: GameEvents, canvases?: MapCanvases, online?: OnlineOptions): Promise<Game> {
  const base = tileBase(window.location.search);
  // The playground has spots of its own, and the showcase's are on an island it doesn't have.
  const inPlayground = playgroundAsked(window.location.search);
  const spots = inPlayground ? PLAYGROUND_SPOTS : SHOWCASE;
  const [manifest] = await Promise.all([
    fetch(`${base}/world.json`).then((response) => {
      if (!response.ok) throw new Error(`${base}/world.json: ${response.status}`);
      return response.json() as Promise<WorldManifest>;
    }),
    initPhysics(),
  ]);

  const renderer = new WebGPURenderer({ antialias: true, reversedDepthBuffer: true, trackTimestamp: true });
  await renderer.init();
  if (!("isWebGPUBackend" in renderer.backend)) {
    renderer.dispose();
    throw new NoWebGpuError();
  }
  renderer.setPixelRatio(window.devicePixelRatio * RENDER_SCALE);
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  container.appendChild(renderer.domElement);

  const scene = new Scene();
  const camera = new PerspectiveCamera(CAMERA_FIELD_OF_VIEW, 1, CAMERA_NEAR, CAMERA_FAR);

  const world = new World(manifest);
  const layers = new TileLayers(renderer, world);
  const fetcher = new TileFetcher(base, manifest);

  // A link may ask to start somewhere else (`?at=`): the drive then starts on the road nearest it, in the free camera.
  const asked = placeAsked(window.location.search);
  const askedAt = asked && { x: asked.east - manifest.worldOrigin.east, z: manifest.worldOrigin.north - asked.north };
  const startName = askedAt ? world.tileAt(askedAt.x, askedAt.z)?.name : manifest.start.tile;
  if (startName === undefined) throw new Error(`?at= asks for ${asked?.east}, ${asked?.north}, which is off the map`);
  // The tiles a drive needs before it starts: the same few wherever the island ends.
  const startSpot = world.named(startName);
  const startTiles = [...world.all()].filter((tile) => distanceToTile((startSpot.column + 0.5) * manifest.tileM, (startSpot.row + 0.5) * manifest.tileM, tile.column, tile.row, manifest.tileM) < FAR_LOAD_M);
  const progress = { done: 0, total: 3 + startTiles.length };
  const landed = () => {
    progress.done++;
    events.onLoading?.({ ...progress });
  };
  events.onLoading?.({ ...progress });

  const overviewData = await fetcher.overview();
  const sharpLand = new SharpLand(manifest.tileM);
  landed();
  world.addOverview(overviewData.heights);
  const overviewTexture = new DataTexture(overviewData.image, manifest.overview.imageWidth, manifest.overview.imageHeight, RGBAFormat);
  overviewTexture.colorSpace = NoColorSpace;
  overviewTexture.generateMipmaps = true;
  overviewTexture.minFilter = LinearMipmapLinearFilter;
  overviewTexture.magFilter = LinearFilter;
  overviewTexture.wrapS = overviewTexture.wrapT = ClampToEdgeWrapping;
  overviewTexture.needsUpdate = true;

  const detail = detailTexture(manifest.sun);
  const signSheet = createSignSheet((name) => token(name).getStyle());
  const { tileM } = manifest;
  // A pixel's tile, and its place in that tile's images, which run from the north-west corner. The scene's -z is north,
  // so tile rows run with z. The image coordinates jump at a tile's edge, so the sampling's rate comes from the world's own.
  const worldUv = positionWorld.xz.div(tileM);
  const pixelTile = worldUv.floor();
  const imageUv = worldUv.sub(pixelTile);
  const gradientX = dFdx(worldUv);
  const gradientY = dFdy(worldUv);
  const mapPlace = pixelTile.sub(vec2(layers.mapColumn, layers.mapRow));
  const inMap = all(greaterThanEqual(mapPlace, vec2(0, 0))).and(all(lessThan(mapPlace, vec2(layers.mapColumns, layers.mapRows))));
  const mapClamped = ivec2(mapPlace.clamp(vec2(0, 0), vec2(layers.mapColumns - 1, layers.mapRows - 1)));
  const slots = textureLoad(layers.slots, mapClamped);
  const farLayer = int(slots.r.mul(255).round().sub(1).max(0));
  const nearSlot = slots.g.mul(255).round();
  const nearLayer = int(nearSlot.sub(1).max(0));
  const sampled = (map: Texture, layer: Node<"int">) => texture(map, imageUv).depth(layer).grad(gradientX, gradientY);

  // Detail is worked out from here, not from the camera, so a camera lifted to the world map changes nothing it stands on.
  const detailSpot = uniform(new Vector3());
  const hazeM = uniform(HAZE_M);
  const toCamera = positionWorld.sub(detailSpot).length();
  const nearShare = float(1).sub(smoothstep(float(DETAIL_SEEN_M - DETAIL_FADE_M), float(DETAIL_SEEN_M), toCamera)).mul(select(nearSlot.greaterThan(0.5), float(1), float(0)));
  const shade = mix(sampled(layers.shadeFar, farLayer).r, sampled(layers.shadeNear, nearLayer).r, nearShare);
  const sky = createSky({ reach: SKY_REACH_M, look: { ...skyLooks().summer, sun: manifest.sun } });
  scene.add(sky.mesh);
  const day = createDayAndNight(sky, window.location.search, seaSeconds());
  const { sun, night } = day;
  // The bake holds the sun at the manifest's one place. Under the live sun its light is moved by how much more or less
  // the ground faces the sun now than it faced that one (`render/terrain-light.ts`).
  const terrainLight = terrainLightAsked(window.location.search);
  const bakedSun = towardsPlace(manifest.sun);
  const sunOn = (up: Node<"vec3">, toSun: Node<"vec3">) => float(BAKED_SKY_SHARE).add(up.dot(toSun).max(0).mul(BAKED_SUN_SHARE));
  const relit = (up: Node<"vec3">) => sunOn(up, sun.toSun).div(sunOn(up, vec3(bakedSun.x, bakedSun.y, bakedSun.z)));
  const lightOf = (baked: Node<"float">, up: Node<"vec3"> = vec3(0, 1, 0)) => {
    const level = baked.pow(float(manifest.shade.gamma));
    if (terrainLight === "baked") return bakedLightAtHour(night, mix(float(1), level.div(FLAT_LIGHT), SHADE_SHARE));
    return mix(float(1), level.mul(relit(terrainLight === "flat" ? vec3(0, 1, 0) : up)).div(FLAT_LIGHT), SHADE_SHARE);
  };
  const light = lightOf(shade);
  const mask = sampled(layers.mask, farLayer);
  const photo = mix(sampled(layers.groundFar, farLayer), sampled(layers.groundNear, nearLayer), nearShare);
  const roadNearby = texture(layers.mask, imageUv).depth(farLayer).grad(gradientX.mul(8), gradientY.mul(8));
  const linear = (name: string) => {
    const { r, g, b } = token(name);
    return new Vector3(r, g, b);
  };
  const ruralColour = (part: RuralPart) => {
    const { x, y, z } = ruralColours(linear)[RURAL_PARTS.indexOf(part)];
    return vec3(x, y, z);
  };
  const { tiled, follow: tiledFollows } = tiledGround();
  const surfaceGround = groundDetail({
    tiled,
    toCamera,
    photo: photo.rgb.pow(vec3(2.2)),
    roadNearby: roadNearby.g.add(roadNearby.b),
    litterColour: colorOf("surface-litter"),
    rock: mask.a,
    fields: sampled(layers.fields, farLayer).r,
    rockColour: ruralColour("rapakivi"),
    stonesColour: ruralColour("field-stone"),
    detail,
  });
  // The town's ground over that, from the near tile's surface image: nothing where a tile has none (`art/town-ground`).
  const townPixels = manifest.town?.pixels ?? 1;
  const townMask = sampled(layers.townNear, nearLayer).mul(select(nearSlot.greaterThan(0.5), float(1), float(0)));
  // A direction can't be filtered, so it's the nearest texel's.
  const townAngle = textureLoad(layers.townNear, ivec2(imageUv.mul(townPixels).floor().clamp(0, townPixels - 1))).depth(nearLayer).a;
  const [townRed, townGreen, townBlue] = [townMask.r, townMask.g, townMask.b].map((channel) => smoothstep(float(0.49), float(0.51), channel));
  // Paving, gravel, tarmac, setts or steps: a lawn or a bed is soft ground, which a road or path wears into as it does anywhere.
  const townHard = max(townRed, townBlue.mul(float(1).sub(townGreen)));
  const photoSoft = texture(layers.groundNear, imageUv).depth(nearLayer).level(float(3)).rgb.pow(vec3(2.2));
  const groundColor = townGround({ place: positionWorld.xz, tiled, toCamera, mask: townMask, angle: townAngle, ground: surfaceGround, photoSoft, colour: colorOf, detail });
  const hazeColour = sky.hazeAlong(positionWorld.sub(cameraPosition));
  const headlights = createHeadlights(night);
  scene.add(headlights.cones);
  // Every colour drawn goes through here: the hour's light on it, the player's headlights on it, then the haze.
  const hazedAtHour = (atHour: (hour: Night, color: Node<"vec3">) => Node<"vec3">) => (color: Node<"vec3">) => mix(atHour(night, color).add(headlights.poolOn(color)), hazeColour, float(1).sub(exp(toCamera.div(hazeM).pow(2).negate())));
  const hazed = hazedAtHour(landAtHour);
  const seaHazed = hazedAtHour(seaAtHour);

  // From high up the mask's mips blur a road into a wide band, so the paint goes as the camera lifts: the map draws its own roads.
  const paintedShare = uniform(1);
  const paintedRoads = smoothstep(float(PAINTED_ROADS_FROM_M), float(PAINTED_ROADS_FULL_M), toCamera).mul(paintedShare);
  const roadEdge = (coverage: Node<"float">) => smoothstep(float(0.08), float(0.35), coverage).mul(paintedRoads);
  const land = (up: Node<"vec3">) => mix(mix(groundColor, colorOf("road-main"), roadEdge(mask.g)), colorOf("road-minor"), roadEdge(mask.b)).mul(lightOf(shade, up));
  const hasFar = inMap.and(slots.r.greaterThan(0.001));
  const farSeen = select(hasFar, float(1).sub(smoothstep(float(FAR_FADE_FROM_M), float(FAR_SEEN_M), toCamera)), float(0));
  const overviewSize = vec2((manifest.overview.columns - 1) * manifest.overview.stepM, (manifest.overview.rows - 1) * manifest.overview.stepM);
  const overviewUv = positionWorld.xz.sub(vec2(manifest.overview.west, -manifest.overview.north)).div(overviewSize);
  const overviewPixel = texture(overviewTexture, overviewUv);
  const inOverview = all(greaterThanEqual(overviewUv, vec2(0, 0))).and(all(lessThan(overviewUv, vec2(1, 1))));
  const waterOf = createWater({ colour: colorOf, sun, skyAlong: sky.clearAlong, meltAlong: sky.seaToSky });
  const openSea = waterOf.colorFor(shoreOfLand(select(inOverview, texture(overviewTexture, overviewUv).level(float(WATER_SHORE_MIP)).a, float(0))));
  const openSeaInLand = seaInLand(night, openSea);
  const pastTiles = select(inOverview, mix(openSeaInLand, overviewPixel.rgb.pow(vec3(2.2)).mul(lightOf(float(FLAT_LIGHT).pow(1 / manifest.shade.gamma))), overviewPixel.a), openSeaInLand);
  const waterColour = (depth: Node<"float">) => waterOf.colorFor(shoreOfDepth(depth));
  const terrainColour = (depth: Node<"float">, shore: Node<"float">, up: Node<"vec3">) => {
    // The ground past the shore is drawn as the water over it, in a line as sharp as the pixel, from the shore's smooth
    // line rather than where the mesh's corners cross the water.
    const edge = fwidth(shore).max(0.001);
    const under = smoothstep(edge.negate(), edge, shore);
    const wet = float(1).sub(smoothstep(float(0), float(WET_BAND_M), depth.negate()));
    const near = mix(land(up).mul(mix(float(1), float(WET_SHADE), wet)), seaInLand(night, waterColour(depth)), under);
    return hazed(mix(pastTiles, near, farSeen));
  };

  const { canopyAt, clearanceAt, standsAt, roadsAt, pavedAt, openToReedsAt, landAt, waterAt, rockAt, fieldsAt, closeLandAt } = tileReads(layers, tileM, manifest.canopy.unitM, manifest.clearing);
  const cameraSpot = uniform(new Vector2());
  const knobs = forestKnobs(FOREST_DEFAULTS);
  const clipmap = createClipmap(scene, world, manifest.heights.stepM, terrainColour, (depth) => seaHazed(waterColour(depth)), canopyLift(canopyAt, cameraSpot, knobs.forestReach));
  const forest = createForest(scene, renderer, {
    knobs,
    canopyAt,
    standsAt,
    groundAt: clipmap.groundBlendedAt,
    roads: { at: roadsAt, tileM },
    clearanceAt,
    colour: colorOf,
    hazed: hazedAtHour(forestAtHour),
    sun,
  });

  const wallClearings = { near: createWallClearing(NEAR_CLEARING), far: createWallClearing(FAR_CLEARING) };
  const verge = createVerge(scene, renderer, { landAt, pavedAt, roadsAt, fieldsAt, groundAt: (place) => clipmap.groundBlendedAt(0, place), shoreAt: clipmap.shoreAround, wallDistanceAt: wallClearings.near.distanceAt, clearanceAt, lightOf, linear, hazed, litterColour: colorOf("surface-litter"), tileM });
  const reeds = createReeds(scene, renderer, { waterAt, landAt, roadsAt, openToReedsAt, groundAt: (place) => max(clipmap.groundBlendedAt(0, place), clipmap.waterLevelAt(0, place)), shoreAt: clipmap.shoreAround, clearanceAt, lightOf, linear, hazed });
  const shrubs = createShrubs(scene, renderer, { canopyAt, waterAt, landAt, roadsAt, groundAt: (place) => clipmap.groundBlendedAt(0, place), shoreAt: clipmap.shoreAround, wallDistanceAt: wallClearings.near.distanceAt, wallDistanceFarAt: wallClearings.far.distanceAt, clearanceAt, lightOf, linear, hazed, sun });
  const granite = createGranite(scene, renderer, {
    rockAt,
    fieldsAt,
    canopyAt,
    waterAt,
    roadsAt,
    landAt,
    closeLandAt,
    groundAt: (place) => clipmap.groundBlendedAt(0, place),
    groundOnMeshAt: (place) => clipmap.groundOnMeshAt(0, place),
    lightOf,
    linear,
    colour: colorOf,
    hazed,
    litterColour: colorOf("surface-litter"),
    sun,
  });

  // Open water out to the sky, under everything the terrain doesn't reach.
  const seaGeometry = new PlaneGeometry(2 * CAMERA_FAR, 2 * CAMERA_FAR);
  seaGeometry.rotateX(-Math.PI / 2);
  const seaMaterial = new MeshBasicNodeMaterial();
  seaMaterial.colorNode = seaHazed(openSea);
  const sea = new Mesh(seaGeometry, seaMaterial);
  sea.position.y = SEA_BELOW_LAND_M;
  scene.add(sea);

  const tier = attribute<"float">("tier", "float");
  const across = attribute<"float">("across", "float").abs();
  const roadInfo = attribute<"vec4">("roadInfo", "vec4");
  const roadMark = attribute<"vec2">("roadMark", "vec2");
  const along = attribute<"float">("along", "float");
  const isMain = float(1).sub(smoothstep(float(0.4), float(0.6), tier));
  const signedAcross = attribute<"float">("across", "float");
  // Each line is its share of the pixel, so far off it thins to its share of the road instead of sparkling.
  const edgeLine = band(across, LINE_INSET - LINE_WIDTH, LINE_INSET + LINE_WIDTH, fwidth(across));
  // Centred on every whole dash, so the pattern reads the same from both tiles at a seam, whichever way their chains run.
  const dash = pulses(along, DASH_LENGTH_M, (DASH_SHARE / 2) * DASH_LENGTH_M, fwidth(along));
  const centreLine = band(signedAcross, -CENTRE_LINE_WIDTH, CENTRE_LINE_WIDTH, fwidth(signedAcross)).mul(dash);
  const dressed = dressRoad({ tiled, toCamera, across, signedAcross, along, paved: roadInfo.x, town: roadInfo.y, halfWidth: roadInfo.z, shoulderM: roadMark.x, ground: groundColor, colour: colorOf, detail });
  const marks = junctionMarks({ across: signedAcross, halfWidth: roadInfo.z, toMark: roadInfo.w, mark: roadMark.y }).mul(roadInfo.x);
  // A path or a setted street wears its own surface, and a path's edge meets the ground beside it with no shoulder of its own.
  const townRoad = townRibbon({ place: positionWorld.xz, tiled, toCamera, along, angle: townAngle, bits: attribute<"vec3">("townBits", "vec3"), carriageway: dressed.carriageway, colour: colorOf, detail });
  const painted = mix(townRoad.carriageway, colorOf("road-paint"), edgeLine.add(centreLine).min(1).mul(isMain).add(marks).min(1).mul(dressed.paintLeft).mul(float(1).sub(townRoad.claimed)));
  // Beside the town's hard ground, a street's or path's shoulder is that ground, save a paved town street's kerb; beside soft ground it keeps its worn shoulder.
  const kerbKept = mix(float(1), smoothstep(float(0.2), float(0.24), across.sub(1).max(0).mul(roadMark.x)), roadInfo.x.mul(roadInfo.y).mul(smoothstep(float(2), float(2.6), roadInfo.z)));
  const shoulderColour = mix(dressed.shoulder, groundColor, max(townRoad.claimed, kerbKept).mul(townHard));
  const shoulderShare = mix(dressed.shoulderShare, smoothstep(float(0.995), float(1.01), across), townHard);
  const roadMaterial = new MeshBasicNodeMaterial();
  roadMaterial.colorNode = hazed(mix(painted, shoulderColour, shoulderShare).mul(light));

  const bridgeMaterial = new MeshBasicNodeMaterial();
  const part = attribute<"float">("part", "float");
  const concrete = colorOf("wall-pale");
  bridgeMaterial.colorNode = hazed(mix(mix(concrete, colorOf("wall-plinth"), smoothstep(float(0.5), float(0.6), part)), concrete.mul(0.45), smoothstep(float(1.5), float(1.6), part)));
  bridgeMaterial.side = 2;
  // Bridges come with tiles, mid-drive, so one stands in to have its pipeline built with the rest.
  const bridgeStandIn = new BufferGeometry();
  bridgeStandIn.setAttribute("position", new BufferAttribute(new Float32Array(9), 3));
  bridgeStandIn.setAttribute("part", new BufferAttribute(new Float32Array(3), 1));
  const compiledBridge = new Mesh(bridgeStandIn, bridgeMaterial);
  compiledBridge.frustumCulled = false;
  scene.add(compiledBridge);

  const wallMaterial = buildingMaterial({ colour: colorOf, linear, hazed }, sun, { detail, sheet: signSheet, night });
  const outbuildingMaterials = ruralMaterials({ colour: colorOf, linear, hazed, sun });
  // A placed model leaves where its own place passes the buildings' reach, as the cell round it does.
  const outbuildings = createRuralBuildings(scene, outbuildingMaterials, BUILDINGS_REACH_M + RIBBON_CELL_M / Math.SQRT2);
  const windmills = createWindmills(scene, outbuildingMaterials, manifest.tiles);
  const docks = createDocks(scene, outbuildingMaterials, { colour: colorOf, linear, hazed, sun }, BUILDINGS_REACH_M + RIBBON_CELL_M / Math.SQRT2);
  // What's placed by Åland's own positions rather than from its tiles has no place in the playground, a world of its own.
  const regattas = createRegattas(scene, { colour: colorOf, linear, hazed }, inPlayground ? [] : undefined);
  const stoneWalls = createStoneWalls(scene, outbuildingMaterials);
  const boatsUnderWay = createBoatsUnderWay(scene, { colour: colorOf, linear, hazed, sun });
  const seaMarks = createSeaMarks(scene, { colour: colorOf, linear, hazed, sun }, (x, z) => world.height(x, z));
  if (inPlayground) {
    boatsUnderWay.show(false);
    seaMarks.show(false);
  }
  const people = createPeople(scene, { colour: colorOf, linear, hazed, sun });
  const viewHeight = uniform(1);
  // Leaves, flags and ribbons move on the roadside's own clock, held when the game is.
  const streetClock = uniform(0);
  const roadside = createRoadside(scene, {
    roadside: roadsideMaterials({ colour: colorOf, linear, hazed, sun }),
    street: streetMaterials({ colour: colorOf, linear, hazed, sun, time: streetClock }),
    identity: identityMaterials({ colour: colorOf, linear, hazed, sun, time: streetClock }),
    wires: wireMaterial({ colour: colorOf, hazed }, viewHeight, CAMERA_FIELD_OF_VIEW),
    signs: createSignKit(signSheet, { colour: colorOf, hazed }, sun),
    town: { inputs: { colour: colorOf, linear, hazed, sun }, ink: (name) => `#${token(name).getHexString()}` },
  });
  const parkedCars = createParkedCars(scene, sun, hazed);
  // A lamp's pool lies on the clipmap's finest heights, which reach this far before the ring folds.
  const nightLights = createNightLights(scene, night, { onAland: !inPlayground, groundAt: { at: (place) => clipmap.groundBlendedAt(0, place), reachM: POOLS_ON_GROUND_M } });
  let lampRevision = -1;
  const laneNet = new LaneNet();
  const laneOverlay = createLaneOverlay(scene, laneNet, token);
  const laneTraffic = new LaneTraffic(laneNet, TRAFFIC_KINDS);
  const laneTrafficView = createLaneTrafficView(scene, sun, hazed, TRAFFIC_MOST);
  const cyclistsView = createCyclistsView(scene, sun, hazed, CYCLISTS_MOST);
  const bubble = new Bubble(laneNet, laneTraffic, { car: { reachM: CAR_REACH_M, density: 0 }, bike: { reachM: BIKE_REACH_M, density: 0 } });
  let trafficSeesPlayer = true;
  let trafficSteps = 0;
  let bubbleSteps = 0;
  const trafficFocus = { x: 0, z: 0 };
  const viewProjection = new Matrix4();
  /** The camera as it stands, for whether something on the road is in sight. */
  const eyeNow = (): Eye => {
    camera.updateMatrixWorld();
    viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    return eyeOf(camera.position, viewProjection.elements);
  };
  const landmarks = createLandmarks(scene, wallMaterial, manifest.tiles, (name) => `#${token(name).getHexString()}`, (x, z) => world.height(x, z), manifest.worldOrigin);
  const buildingAddOns = createBuildingAddOns(scene, wallMaterial, townMaterials({ colour: colorOf, linear, hazed, sun, time: uniform(0) }), (name) => `#${token(name).getHexString()}`, BUILDINGS_REACH_M + RIBBON_CELL_M / Math.SQRT2);
  const challengeBoard = new ChallengeBoard(CHALLENGES, { load: () => storage.get<unknown>(PASSES_KEY), save: (passes) => { storage.set(PASSES_KEY, passes); } }, ({ x, z }) => world.tileAt(x, z) !== undefined);
  // Room for the list and a few of a page's own.
  const challengeMarks = createChallengeMarks(scene, { colour: colorOf, hazed, sunAzimuthDeg: manifest.sun.azimuthDeg, groundAt: (x, z) => world.height(x, z) }, CHALLENGES.length + 8);
  const buildings = new Map<string, ReturnType<typeof buildingMeshes>>();
  const ribbons = new Map<string, ReturnType<typeof ribbonMeshes>>();
  const bridges = new Map<string, Mesh>();
  let meshBytes = 0;
  const meshBytesOf = (detail: TileDetail, dress: RoadAttributes, cells: { positions: Float32Array; facades: Float32Array; tints: Uint8Array; indices: Uint16Array }[]) =>
    detail.ribbon.positions.byteLength + detail.ribbon.across.byteLength + detail.ribbon.along.byteLength + detail.ribbon.tiers.byteLength + detail.ribbon.indices.byteLength + dress.surface.byteLength + dress.mark.byteLength + detail.bridges.positions.byteLength * (4 / 3) + cells.reduce((sum, cell) => sum + cell.positions.byteLength + cell.facades.byteLength + cell.tints.byteLength + cell.indices.byteLength, 0);
  const meshBytesByTile = new Map<string, number>();
  let failed = false;
  const fail = (error: Error) => {
    if (failed) return;
    failed = true;
    console.error(error);
    events.onFailure(error);
  };
  const stream = new TileStream(
    world,
    fetcher,
    {
      place({ detail, shade: mips, ground, town, townRibbons, buildings: cells, models, docks: moored, stoneWalls: walls, roadside: placed, people: crowd, parked, addOns, lanes }, done) {
        const meshes = ribbonMeshes(detail, detail.dress, townRibbons, roadMaterial);
        scene.add(meshes.group);
        ribbons.set(detail.name, meshes);
        const solids = buildingMeshes(buildingAddOns.withShops(cells, addOns), wallMaterial);
        scene.add(solids.group);
        buildings.set(detail.name, solids);
        outbuildings.add(detail.name, models);
        docks.add(detail.name, moored);
        people.add(detail.name, crowd);
        stoneWalls.add(detail.name, walls);
        for (const clearing of Object.values(wallClearings)) clearing.add(detail.name, [{ sections: walls, outM: 0 }, ...furnitureClearances(placed.models)]);
        roadside.add(detail.name, placed);
        parkedCars.add(detail.name, parked);
        laneNet.add(detail.name, lanes);
        buildingAddOns.add(detail.name, addOns);
        if (detail.bridges.positions.length > 0) {
          const mesh = bridgeMesh(detail.bridges, bridgeMaterial);
          scene.add(mesh);
          bridges.set(detail.name, mesh);
        }
        const bytes = meshBytesOf(detail, detail.dress, cells);
        meshBytesByTile.set(detail.name, bytes);
        meshBytes += bytes;
        layers.placeNear(world.named(detail.name), mips, ground, town, manifest, () => {
          done();
          landmarks.add(detail.name);
        });
      },
      placeFar(tile, done) {
        const place = world.named(tile.name);
        sharpLand.add(tile.name, place.column, place.row, tile.land);
        layers.placeFar(place, tile, manifest, done);
      },
      releaseFar(tile) {
        sharpLand.remove(tile.name);
        layers.releaseFar(tile);
      },
      release(detail) {
        const meshes = ribbons.get(detail.name);
        if (!meshes) throw new Error(`${detail.name} has no ribbon to release`);
        scene.remove(meshes.group);
        for (const { mesh } of meshes.cells) mesh.geometry.dispose();
        ribbons.delete(detail.name);
        const solids = buildings.get(detail.name);
        if (!solids) throw new Error(`${detail.name} has no buildings to release`);
        scene.remove(solids.group);
        for (const { mesh } of solids.cells) mesh.geometry.dispose();
        buildings.delete(detail.name);
        outbuildings.remove(detail.name);
        docks.remove(detail.name);
        people.remove(detail.name);
        stoneWalls.remove(detail.name);
        for (const clearing of Object.values(wallClearings)) clearing.remove(detail.name);
        roadside.remove(detail.name);
        parkedCars.remove(detail.name);
        laneNet.remove(detail.name);
        buildingAddOns.remove(detail.name);
        landmarks.remove(detail.name);
        const bridge = bridges.get(detail.name);
        if (bridge) {
          scene.remove(bridge);
          bridge.geometry.dispose();
          bridges.delete(detail.name);
        }
        meshBytes -= meshBytesByTile.get(detail.name) ?? 0;
        meshBytesByTile.delete(detail.name);
        layers.releaseNear(world.named(detail.name));
      },
    },
    fail,
  );

  // The far data round the start comes first, and detail under the car, then the drive begins. From here on the frame loop
  // does the uploads, but it hasn't started yet: this first lot goes up here.
  stream.addBytes(overviewData.bytes);
  const loaded = Promise.all([...startTiles.map((tile) => stream.loadFar(tile.name).then(landed)), stream.load(startName).then(landed)]);
  let uploading = true;
  void loaded.finally(() => {
    uploading = false;
  });
  const pumpUploads = async () => {
    while (uploading) {
      layers.uploadStep(Number.POSITIVE_INFINITY);
      await new Promise(requestAnimationFrame);
    }
  };
  await Promise.all([loaded, pumpUploads()]);

  const startTile = world.named(startName);
  if (!startTile.detail) throw new Error(`${startName} didn't load`);
  const startRoads = startTile.detail.roads;
  const startLine = (chain: number) => chainLine(startRoads, chain);
  const edgeGeometry = edgeBand(world);
  const edgeMaterial = new MeshBasicNodeMaterial();
  edgeMaterial.colorNode = hazed(colorOf("edge"));
  edgeMaterial.side = 2;
  const edgeMesh = new Mesh(edgeGeometry, edgeMaterial);
  scene.add(edgeMesh);

  const askedRoad = askedAt ? world.roads.nearest(askedAt.x, askedAt.z) : undefined;
  if (askedRoad === null) throw new Error(`?at= asks for ${asked?.east}, ${asked?.north}, and no road is near it`);
  const startCar = carAsked(window.location.search);
  const drive = new Drive(world, askedRoad ?? startLine(manifest.start.chain).at(START_ALONG_M), startCar);
  const ground = groundCondition(window.location.search, window.navigator.webdriver);
  // A link's tyres are for this drive only: what's kept is what the player fitted.
  drive.tyres = tyresAsked(window.location.search) ?? tyresOn(startCar);
  const trafficContact = new TrafficContact(drive, laneTraffic, TRAFFIC_KINDS, TRAFFIC_EVERY);
  let carSpec = CARS.find((car) => car.id === startCar) ?? PLAYER_CAR;
  let carView = createCarView(scene, sun, carSpec, "hero", { hazed });
  fitCarVolume(carView.art);
  const tyres = createTyreParticles(scene, token, hazed);
  const cullCar = (culled: boolean) => {
    for (const object of carView.objects) {
      object.traverse((part) => {
        part.frustumCulled = culled;
      });
    }
  };

  // A pipeline first used mid-drive stalls that frame while it compiles, so every mesh is built once before the drive starts.
  for (const { cells } of [...ribbons.values(), ...buildings.values()]) {
    for (const { mesh } of cells) mesh.visible = true;
  }
  clipmap.showWide(true);
  outbuildings.showAll(true);
  windmills.showAll(true);
  docks.showAll(true);
  seaMarks.showAll(true);
  people.showAll(true);
  stoneWalls.showAll(true);
  roadside.showAll(true);
  parkedCars.showAll(true);
  buildingAddOns.showAll(true);
  challengeMarks.showAll(true);
  tyres.showAll(true);
  cullCar(false);
  nightLights.showAll(true);
  await renderer.compileAsync(scene, camera);
  await forest.compile();
  await verge.compile();
  await reeds.compile();
  await shrubs.compile();
  await granite.compile();
  cullCar(true);
  nightLights.showAll(false);
  clipmap.showWide(false);
  outbuildings.showAll(false);
  windmills.showAll(false);
  docks.showAll(false);
  seaMarks.showAll(false);
  people.showAll(false);
  stoneWalls.showAll(false);
  roadside.showAll(false);
  parkedCars.showAll(false);
  buildingAddOns.showAll(false);
  challengeMarks.showAll(false);
  tyres.showAll(false);
  scene.remove(compiledBridge);
  bridgeStandIn.dispose();
  landed();

  const { worldOrigin } = manifest;
  const groundAt = (x: number, z: number) => world.height(x, z);
  const toView = (at: Place): View => {
    const east = at.east - worldOrigin.east;
    const north = at.north - worldOrigin.north;
    return { x: east, y: world.height(east, -north) + at.height, z: -north, yaw: at.yaw, pitch: at.pitch };
  };
  const freeCamera = startFreeCamera(camera, renderer.domElement);
  const chaseCamera = startChaseCamera(camera, groundAt);

  let cameraMode: CameraMode = "chase";
  const setCamera = (mode: CameraMode) => {
    if (mode === cameraMode) return;
    if (mode === "free") {
      freeCamera.enter();
      camera.fov = CAMERA_FIELD_OF_VIEW;
      camera.updateProjectionMatrix();
    } else {
      freeCamera.leave();
    }
    cameraMode = mode;
    events.onCamera(mode);
  };
  if (asked) {
    setCamera("free");
    freeCamera.set(toView(asked));
  }

  let navigator: Navigator | null = null;
  // The camera left the chase view here, and detail stays here until it's back or the map looks closely elsewhere. Null while driving.
  let mapFrom: ChasePose | null = null;
  let mapLook: { x: number; z: number; detail: boolean } | null = null;
  let heldFlight = false;
  let devMenuOpen = false;
  // The game menu while it's open, as the game worked it out on opening.
  let gameMenu: GameMenu | null = null;
  const raycaster = new Raycaster();
  const groundPlane = new Plane(new Vector3(0, 1, 0), 0);
  const groundHit = new Vector3();
  const projected = new Vector3();
  let roadGraph: RoadGraph | null = null;
  let worldMap: WorldMap | null = null;
  let discovery: Discovery | null = null;
  const headingClockwise = (car: CarState) => -headingOf(car.rotation);
  const showProgress = () => {
    if (!discovery) return;
    events.onProgress?.({
      places: { done: discovery.foundCount, total: discovery.places.length },
      challenges: { done: challengeBoard.passedCount, total: challengeBoard.challenges.length },
    });
  };
  const pickDestination = (x: number, z: number) => {
    const car = drive.stateAt(1);
    if (!navigator) throw new Error("a destination before the road network arrived");
    const found = navigator.setDestination(car.position[0], car.position[2], headingClockwise(car), x, z);
    worldMap?.setRoute(navigator.route);
    return found;
  };
  // Arrives after the drive starts, so a long download never holds up the start.
  void (canvases ? fetcher.roads() : new Promise<never>(() => undefined)).then(
    (data) => {
      if (!canvases) return;
      const graph = new RoadGraph(data);
      roadGraph = graph;
      const land = landImage(overviewData.image, manifest.overview);
      const ink = mapInk();
      const found = discovery = inPlayground
        ? new Discovery(graph, { load: () => null, save: () => undefined }, [])
        : new Discovery(graph, {
            load: () => storage.get<string[]>(FOUND_KEY),
            save: (ids) => { storage.set(FOUND_KEY, ids); },
          });
      navigator = new Navigator(graph, land, manifest.overview, sharpLand, canvases.mini, ink, found, challengeBoard, { onRoad: (name) => events.onRoad?.(name) });
      worldMap = new WorldMap(
        canvases.world,
        graph,
        ink,
        found,
        challengeBoard,
        (x, z) => {
          pickDestination(x, z);
        },
        () => {
          mapFrom = null;
          controls.setMapOpen(false);
          events.onMapOpen?.(false);
          const { position } = drive.stateAt(1);
          if (stream.wanted(position[0], position[2]) === 0) return;
          // The map looked elsewhere, so the car waits for its ground, as it does for a jump.
          jumping = true;
          void stream.settled().then(() => {
            jumping = false;
          });
        },
      );
      stream.addBytes(data.bytes);
      events.onMapReady?.();
      showProgress();
    },
    (error: unknown) => {
      fail(error instanceof Error ? error : new Error(String(error)));
    },
  );

  // Everything stops for a jump: the car stays where it is until the ground where it's going has landed.
  let jumping = false;
  /** Loads round a place, with the first load's bar, and puts the car there once it has landed. */
  const loadRound = async (x: number, z: number, place: () => void) => {
    jumping = true;
    const wanted = { done: 0, total: Math.max(stream.wanted(x, z), 1) };
    events.onLoading?.({ ...wanted });
    stream.onLanded = () => {
      wanted.done = Math.min(wanted.done + 1, wanted.total - 1);
      events.onLoading?.({ ...wanted });
    };
    loadingAround = { x, z };
    stream.update(x, z);
    await stream.settled();
    place();
    chaseCamera.snap();
    loadingAround = null;
    stream.onLanded = () => undefined;
    jumping = false;
    events.onLoading?.({ done: wanted.total, total: wanted.total });
  };
  const jump = async ({ x, z, headingDeg, name, offRoad = false }: Omit<ShowcaseSpot, "id">) => {
    if (jumping || mapFrom) return;
    await loadRound(x, z, () => {
      const heading = (-headingDeg * Math.PI) / 180;
      if (offRoad) {
        drive.placeAt({ x, y: world.height(x, z), z, heading, along: 0, distance: 0 });
        return;
      }
      const road = world.roads.nearest(x, z);
      if (!road) throw new Error(`no road at the showcase spot ${name}`);
      drive.placeAt({ ...road, heading: Math.cos(heading - road.heading) >= 0 ? road.heading : road.heading + Math.PI });
    });
    if (name !== "") events.onRoad?.(name);
  };
  const jumpTo = (id: string) => {
    const spot = spots.find((candidate) => candidate.id === id);
    if (!spot) throw new Error(`no showcase spot ${id}`);
    return jump(spot);
  };

  /** The view that fits a box, centred, whatever the screen's shape. */
  const mapFitting = ({ west, east, top, bottom }: { west: number; east: number; top: number; bottom: number }): MapTarget => {
    const across = (east - west) / 2 / Math.max(camera.aspect, 0.1);
    const along = (bottom - top) / 2;
    const heightM = (MAP_MARGIN * Math.max(across, along)) / MAP_SLOPE;
    return { x: (west + east) / 2, z: (top + bottom) / 2, heightM, fieldOfViewDeg: MAP_FIELD_OF_VIEW };
  };

  /** The main island to start with, out to all of Åland, as the map's zoom and pan have moved it. */
  const mapTarget = (map: WorldMap): MapTarget => {
    if (!roadGraph) throw new Error("no road network yet");
    const { west, north, columns, rows, stepM } = manifest.overview;
    const whole = mapFitting({ west, east: west + (columns - 1) * stepM, top: -north, bottom: -north + (rows - 1) * stepM });
    return map.target(whole, whole.heightM * MAP_SLOPE * camera.aspect, whole.heightM * MAP_SLOPE, mapFitting(roadGraph.mainIsland));
  };

  const setMapOpen = (open: boolean) => {
    if (!worldMap || !navigator || cameraMode === "free" || jumping || gameMenu) return;
    if (open === worldMap.wanted) return;
    if (open && !mapFrom) {
      const car = drive.stateAt(1);
      const { x, y, z } = camera.position;
      const forward = camera.getWorldDirection(new Vector3());
      mapFrom = { position: [x, y, z], forward: [forward.x, forward.y, forward.z], fieldOfViewDeg: camera.fov, car: [car.position[0], car.position[1], car.position[2]] };
      controls.setMapOpen(true);
      events.onMapOpen?.(true);
      // The canvas only has a size once it shows.
      const map = worldMap;
      const route = navigator.route;
      const along = navigator.alongRoute;
      requestAnimationFrame(() => {
        map.startAt(car.position[0], car.position[2], headingClockwise(car), route, along);
      });
    }
    worldMap.wanted = open;
    if (!open) mapLook = null;
  };

  const setDevMenuOpen = (open: boolean) => {
    if (open === devMenuOpen || (open && (mapFrom || jumping || gameMenu))) return;
    devMenuOpen = open;
    controls.setDevMenuOpen(open);
    events.onDevMenuOpen?.(open);
  };

  // The challenge being played, if any (`challenge/session.ts`): the run, the car from before, and the way back to the line.
  let session: ChallengeSession | null = null;
  // What the open choice is about: the challenge whose ring the car was in, and the other player there.
  let offered: { challenge: Challenge; partner: string | null } | null = null;
  const routes = new Map<string, ReturnType<typeof challengeRoute>>();
  const routeOf = (challenge: Challenge) => {
    if (!roadGraph) return null;
    let route = routes.get(challenge.id);
    if (!route) {
      route = challengeRoute(roadGraph, challenge.waypoints);
      routes.set(challenge.id, route);
    }
    return route;
  };
  /** The challenge whose start ring the car is in, while it's free to start one. */
  const ringNow = () => {
    if (session || cameraMode === "free" || coop.now.kind !== "free") return null;
    const { position } = drive.stateAt(1);
    return challengeBoard.ringAt(position[0], position[2]);
  };
  /** Another player in the same start ring, the nearest, who isn't in a co-op challenge already: exactly two take one. */
  const partnerInRing = (challenge: Challenge): string | null => {
    const centre = ringCentre(challenge);
    let best: string | null = null;
    let nearest = Infinity;
    for (const [peerId, { heard }] of others) {
      if (!heard || coop.busy(peerId)) continue;
      const [x, , z] = drive.remotes.stateAt(peerId, 1).position;
      if (challengeBoard.ringAt(x, z) !== challenge) continue;
      const distance = Math.hypot(x - centre.x, z - centre.z);
      if (distance < nearest) [nearest, best] = [distance, peerId];
    }
    return best;
  };
  const nameOf = (peerId: string) => names.get(peerId) ?? peerId;

  /** What the game menu holds and whether it stops the drive, worked out as it opens. */
  const menuNow = (): GameMenu => {
    if (!session) return drivingMenu(drive.tyres);
    // Solo, the menu stops the run's clock with the drive; in co-op the partner drives on, so it can't.
    return { items: ["resume", "retry", "leave"], back: "resume", pauses: !session.coop, challenge: session.challenge.title };
  };
  const showMenu = (menu: GameMenu | null) => {
    gameMenu = menu;
    controls.setGameMenuOpen(menu !== null);
    events.onGameMenu?.(menu);
  };
  const canOpenMenu = () => !mapFrom && !jumping && !devMenuOpen;
  const setGameMenuOpen = (open: boolean) => {
    if (open === (gameMenu !== null) || (open && !canOpenMenu())) return;
    showMenu(open ? menuNow() : null);
  };

  /**
   * A challenge's own button: in a start ring, start it solo, or with another
   * player there, choose Solo or Co-op; asked to join, choose Join or Decline;
   * having asked, take it back.
   */
  const challengeButton = () => {
    if (gameMenu !== null || !canOpenMenu() || cameraMode === "free") return;
    const standing = coop.now;
    if (standing.kind === "inviting") {
      coop.withdraw();
      return;
    }
    if (standing.kind === "invited") {
      showMenu({ kind: "invite", items: ["join-coop", "decline-coop", "cancel"], back: "cancel", pauses: true, challenge: standing.challenge.title, partner: nameOf(standing.peer) });
      return;
    }
    const challenge = ringNow();
    if (!challenge) return;
    const partner = partnerInRing(challenge);
    if (partner === null) {
      startChallenge(challenge);
      return;
    }
    offered = { challenge, partner };
    showMenu({ kind: "start", items: ["start-solo", "start-coop", "cancel"], back: "cancel", pauses: true, challenge: challenge.title, partner: nameOf(partner) });
  };

  let placedWaiters: (() => void)[] = [];
  const sessionHost: SessionHost = {
    carId: () => drive.carId,
    setCar: (id) => {
      setCar(id);
    },
    placeAt: ({ x, z, heading }: StartPlace, done) => {
      const put = () => {
        const road = world.roads.nearest(x, z);
        if (!road) throw new Error(`no road at a challenge's start, ${x}, ${z}`);
        drive.placeAt({ ...road, x, z, heading });
        chaseCamera.snap();
        // A scripted drive belongs to the attempt it was started in.
        autopilot = null;
        done();
        const waiting = placedWaiters;
        placedWaiters = [];
        for (const resolve of waiting) resolve();
      };
      // Where the start's tiles are still loaded the car goes back at once; past them, the way a jump does.
      if (stream.wanted(x, z) === 0) put();
      else void loadRound(x, z, put).catch(fail);
    },
    showRoute: (challenge) => {
      const route = challenge ? routeOf(challenge) : null;
      if (challenge && route) navigator?.holdRoute(route, challenge.kind === "route" ? challenge.gates[challenge.gates.length - 1] : challenge.camera);
      else navigator?.clearRoute();
      worldMap?.setRoute(route);
    },
    onOver: (challenge, outcome) => {
      challengeBoard.record(challenge, outcome);
      const seat = session?.seat ?? 0;
      const best = challengeBoard.passOf(challenge)?.best ?? null;
      const target = challenge.kind === "route" ? challenge.targetS : challenge.targetKmh;
      const partner = coop.partner;
      const team = partner === null ? undefined : { own: outcome.results[seat], partner: outcome.results[1 - seat], partnerName: nameOf(partner) };
      const result = outcome.average ?? outcome.results[seat];
      showMenu({ items: ["retry", "leave"], back: "leave", pauses: partner === null, challenge: challenge.title, result: { passed: outcome.passed, kind: challenge.kind, result, target, best, team } });
    },
    onRetry: (attempt) => {
      coop.retried(attempt);
    },
    onReady: (attempt) => {
      coop.ready(attempt);
    },
    onResult: (attempt, result) => {
      coop.result(attempt, result);
    },
    onLost: (attempt, results) => {
      coop.lost(attempt, results);
    },
  };
  const startChallenge = (challenge: Challenge, seat: 0 | 1 = 0, players: 1 | 2 = 1): ChallengeSession => {
    if (session) throw new Error(`${challenge.id} started during ${session.challenge.id}`);
    if (jumping || mapFrom) throw new Error(`${challenge.id} started while the car was being moved`);
    // The choice that started it, or a menu about the drive before, is over.
    if (gameMenu) showMenu(null);
    const started = new ChallengeSession(challenge, sessionHost, seat, players);
    session = started;
    challengeMarks.showStarts(false);
    return started;
  };
  const leaveChallenge = () => {
    if (!session) throw new Error("Leave with no challenge being played");
    session.leave();
    session = null;
    autopilot = null;
    if (gameMenu) showMenu(null);
    challengeMarks.setLine(null, "gate");
    challengeMarks.showStarts(true);
  };

  // Co-op with one other player in the online world (`challenge/coop.ts`): pairing, and both sessions on one attempt.
  const names = new Map<string, string>();
  const coop = new CoopLink({
    send: (to, message) => {
      onlineWorld?.sendChallenge(to, message);
    },
    selfId: () => onlineWorld?.state().selfId ?? null,
    free: () => !session && !jumping && !mapFrom,
    challengeById: (id) => challengeBoard.challenges.find((challenge) => challenge.id === id) ?? null,
    begin: (challenge, seat) => startChallenge(challenge, seat, 2),
    end: (notice) => {
      leaveChallenge();
      events.onCoopNotice?.({ kind: notice.kind, name: nameOf(notice.peer) });
    },
    notice: (notice) => {
      // A choice about an invite that's gone is gone with it.
      if (gameMenu?.kind === "invite") showMenu(null);
      events.onCoopNotice?.({ kind: notice.kind, name: nameOf(notice.peer) });
    },
  });
  // Test only: challenge messages held as they arrive, to be heard in order when let go.
  let heldMessages: { from: string; message: ChallengeMessage }[] | null = null;
  const hearChallenge = (from: string, message: ChallengeMessage) => {
    if (heldMessages) heldMessages.push({ from, message });
    else coop.hear(from, message);
  };

  const pickMenuItem = (id: MenuItemId) => {
    switch (id) {
      case "resume":
      case "cancel":
        setGameMenuOpen(false);
        break;
      case "tyres": {
        const fitted = TYRES[(TYRES.indexOf(drive.tyres) + 1) % TYRES.length];
        setTyres(fitted);
        showMenu(drivingMenu(fitted));
        break;
      }
      case "sound":
        useDriveSoundSettings.getState().toggleMuted();
        break;
      case "start-solo": {
        const chosen = offered;
        if (!chosen) throw new Error("Solo picked with no challenge offered");
        setGameMenuOpen(false);
        startChallenge(chosen.challenge);
        break;
      }
      case "start-coop": {
        const chosen = offered;
        if (!chosen?.partner) throw new Error("Co-op picked with no one to ask");
        setGameMenuOpen(false);
        // The other player may have gone, or been paired, while the choice was open.
        if (others.has(chosen.partner) && !coop.busy(chosen.partner)) coop.invite(chosen.partner, chosen.challenge);
        break;
      }
      case "join-coop":
        setGameMenuOpen(false);
        coop.accept();
        break;
      case "decline-coop":
        setGameMenuOpen(false);
        coop.withdraw();
        break;
      case "retry":
        if (!session) throw new Error("Retry picked with no challenge being played");
        setGameMenuOpen(false);
        session.retry();
        break;
      case "leave":
        setGameMenuOpen(false);
        if (coop.partner !== null) coop.leave();
        leaveChallenge();
        break;
    }
  };

  const whereabouts = () => {
    const car = drive.stateAt(1);
    const [x, y, z] = car.position;
    const headingDeg = (((headingClockwise(car) * 180) / Math.PI) % 360 + 360) % 360;
    const direction = camera.getWorldDirection(new Vector3());
    const look = [
      camera.position.x + worldOrigin.east,
      worldOrigin.north - camera.position.z,
      camera.position.y - world.height(camera.position.x, camera.position.z),
    ].map((value) => value.toFixed(1));
    const turn = [Math.atan2(-direction.x, -direction.z), Math.asin(direction.y)].map((value) => value.toFixed(3));
    return [
      `Åland Drive, car in tile ${world.tileAt(x, z)?.name ?? "none"}`,
      `scene x ${x.toFixed(1)}, y ${y.toFixed(1)}, z ${z.toFixed(1)}; ETRS-TM35FIN east ${(x + worldOrigin.east).toFixed(1)}, north ${(worldOrigin.north - z).toFixed(1)}`,
      `heading ${headingDeg.toFixed(0)}° clockwise from grid north, ${(speedOf(car) * 3.6).toFixed(0)} km/h, ${cameraMode} camera`,
      `the view on screen: tools/look.mjs <out.png> ${[...look, ...turn].join(" ")}`,
      `a link to it: ${placeLink(window.location.href, { east: Number(look[0]), north: Number(look[1]), height: Number(look[2]), yaw: Number(turn[0]), pitch: Number(turn[1]) })}`,
    ].join("\n");
  };

  const setCar = (id: CarId) => {
    const spec = CARS.find((car) => car.id === id);
    if (!spec) throw new Error(`no car's art for ${id}`);
    if (spec === carSpec) return;
    drive.setCar(id, tyresOn(id));
    carView.dispose();
    carSpec = spec;
    carView = createCarView(scene, sun, spec, "hero", { hazed });
    fitCarVolume(carView.art);
    events.onCarChange?.(id);
  };

  const setTyres = (tyres: Tyre) => {
    fitTyres(drive.carId, tyres);
    drive.tyres = tyres;
  };

  const onAction = (action: GameAction) => {
    if (action === "respawn") drive.respawn();
    if (action === "freeCamera") setCamera(cameraMode === "free" ? "chase" : "free");
    if (action === "map") setMapOpen(true);
    if (action === "mute") useDriveSoundSettings.getState().toggleMuted();
    if (action === "challenge") challengeButton();
  };
  const onMapAction = (action: MapAction) => {
    if (action === "close") setMapOpen(false);
    if (action === "pick") worldMap?.pick();
    if (action === "clear") {
      navigator?.clearRoute();
      worldMap?.setRoute(null);
    }
  };
  // Closing the menu from the keyboard presses its way back: Resume, or Leave on a result card.
  const controls = startControls({ onAction, onMapAction, onDevMenu: setDevMenuOpen, onGameMenu: (open) => (open ? setGameMenuOpen(true) : pickMenuItem(gameMenu?.back ?? "resume")), onInputKind: events.onInputKind });

  const resize = () => {
    const { clientWidth, clientHeight } = container;
    renderer.setSize(clientWidth, clientHeight, false);
    viewHeight.value = renderer.domElement.height;
    camera.aspect = clientWidth / Math.max(1, clientHeight);
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  let held = false;
  const seaNow = seaClock(window.location.search);
  let seaHeldAt: number | null = null;
  let autopilot: Autopilot | null = null;
  let owedSeconds = 0;
  let lastFrame: number | null = null;
  let frames = 0;
  let gpuMs: number | null = null;
  let resolving = false;
  let loadingAround: { x: number; z: number } | null = null;

  const showRibbons = ({ x, z }: Vector3) => {
    const reach = RIBBON_REACH_M + RIBBON_CELL_M / Math.SQRT2;
    for (const { cells } of ribbons.values()) {
      for (const cell of cells) cell.mesh.visible = Math.hypot(cell.x - x, cell.z - z) < reach;
    }
    const buildingReach = BUILDINGS_REACH_M + RIBBON_CELL_M / Math.SQRT2;
    for (const { cells } of buildings.values()) {
      for (const cell of cells) cell.mesh.visible = Math.hypot(cell.x - x, cell.z - z) < buildingReach;
    }
  };

  const audio = createDriveAudio();
  let lastInput = NO_INPUT;
  let placements = drive.placements;
  // No frames run in a hidden tab, so the last one's engine note would hold.
  const hushWhenHidden = () => {
    void audioContext().then((context) => (document.hidden ? context.suspend() : context.resume()));
  };
  document.addEventListener("visibilitychange", hushWhenHidden);

  const nextInput = (): DriveInput => {
    if (autopilot) return autopilot.input(drive.stateAt(1));
    // A menu that doesn't pause lets go of the car's controls.
    return cameraMode === "free" || gameMenu ? NO_INPUT : controls.read();
  };
  let sampledPlacements = drive.placements;
  let sentPlacements = drive.placements;
  /** One step of the simulation, what the player's tyres threw up in it, and of the challenge being played: on the line and through the countdown the car is held on the handbrake, whatever the input. */
  const simStep = (input: DriveInput) => {
    lastInput = session?.holdsCar() ? HELD : input;
    trafficContact.beforeStep(trafficSteps);
    drive.step(lastInput);
    trafficContact.afterStep();
    trafficSteps = (trafficSteps + 1) % TRAFFIC_EVERY;
    if ((bubble.density("car") > 0 || bubble.density("bike") > 0) && trafficSteps === 0) {
      const [wide, , long] = TUNINGS[drive.carId].car.halfSize;
      laneTraffic.setDriven(trafficContact.driven(trafficSeesPlayer ? [wide, long] : null));
      if (bubbleSteps === 0) {
        const eye = eyeNow();
        bubble.update(trafficFocus, (vehicle) => sees(eye, groundAt, sightOf(vehicle)));
      }
      bubbleSteps = (bubbleSteps + 1) % BUBBLE_EVERY;
      laneTraffic.step(STEP_S * TRAFFIC_EVERY);
    }
    tyres.step(drive.player.treads(), drive.player.surfaces(), drive.condition, drive.tyres, drive.stateAt(1));
    // A car put somewhere since the last step, by a reset or a retry, crosses no line on its way.
    const placed = drive.placements !== sampledPlacements;
    sampledPlacements = drive.placements;
    if (!session) return;
    const state = drive.stateAt(1);
    session.step(STEP_S, { x: state.position[0], z: state.position[2], speedMS: speedOf(state), placed });
  };

  // Everyone else online: each is the authority over their own car, and here a stand-in of it can be hit (`sim/remote-cars.ts`).
  const remoteViews = createRemoteCarViews(scene, sun, hazed);
  const others = new Map<string, { name: string; heard: boolean }>();
  const onlineWorld = online
    ? createOnlineWorld((roomEvents) => createRoom({ game: GAME, target: { mode: "claim", code: online.code }, profile: online.profile, events: roomEvents, relayUrl: online.relayUrl }), {
        onCar: (peerId, state) => {
          const other = others.get(peerId);
          if (!other) throw new Error(`a car from ${peerId}, who isn't in the world`);
          other.heard = true;
          drive.remotes.hear(peerId, state);
        },
        onGone: (peerId) => {
          drive.remotes.forget(peerId);
          remoteViews.forget(peerId);
        },
        onPlayers: (players) => {
          for (const { peerId, name } of players) names.set(peerId, name);
          // Before the list changes, so a partner who has gone is still named in the notice.
          coop.players(new Set(players.map(({ peerId }) => peerId)));
          const before = new Map(others);
          others.clear();
          for (const { peerId, name } of players) others.set(peerId, { name, heard: before.get(peerId)?.heard ?? false });
          events.onPlayers?.(players.map(({ name }) => name));
        },
        onChallenge: hearChallenge,
      })
    : null;
  onlineWorld?.start();
  const unbindPageHide = onlineWorld ? stopOnPageHide(onlineWorld) : () => undefined;
  /** Draws everyone else's car where it's on ground of ours, and says where they all are for the maps. */
  const drawRemotes = (share: number): MapPlayer[] => {
    const shown: MapPlayer[] = [];
    const lamps: CarAtNight[] = [];
    for (const [peerId, { name, heard }] of others) {
      if (!heard) continue;
      const state = drive.remotes.stateAt(peerId, share);
      const [x, y, z] = state.position;
      remoteViews.draw(peerId, state, world.tileAt(x, z)?.detail != null);
      shown.push({ x, z, headingClockwise: headingClockwise(state), name });
      const heading = headingOf(state.rotation);
      if (state.lamps.head) lamps.push({ x, y, z, forwardX: -Math.sin(heading), forwardZ: -Math.cos(heading), braking: state.lamps.brake });
    }
    nightLights.setCars(lamps);
    return shown;
  };

  let marksRevision = -1;
  const readChallenge = (): ChallengeReading | null => {
    if (!session) return null;
    const { run, challenge, seat } = session;
    const needs = partnerNeeds(run);
    const partner = coop.partner;
    return {
      title: challenge.title,
      kind: challenge.kind,
      phase: session.phase,
      countdownS: countdownLeftS(run),
      clockS: Math.max(run.clockS, 0),
      target: challenge.kind === "route" ? challenge.targetS : challenge.targetKmh,
      gates: gatesPassed(run, seat),
      needs: needs?.player === seat ? needs.result : null,
      partner: partner === null ? null : nameOf(partner),
    };
  };
  const readCoop = (): CoopReading | null => {
    const standing = coop.now;
    if (standing.kind === "free" || standing.kind === "paired") return null;
    return { kind: standing.kind, name: nameOf(standing.peer), title: standing.challenge.title };
  };
  const readOffer = (): ChallengeOffer | null => {
    const challenge = ringNow();
    if (!challenge) return null;
    const partner = partnerInRing(challenge);
    return { title: challenge.title, partner: partner === null ? null : nameOf(partner) };
  };
  /** The line the car is to cross next, standing in the world: a gate, the finish, or the camera. */
  const showNextLine = () => {
    if (!session || session.run.outcome) {
      challengeMarks.setLine(null, "gate");
      navigator?.setGates("", () => []);
      return;
    }
    const { challenge, run, seat } = session;
    if (challenge.kind === "speed-trap") {
      const crossed = run.players[seat].result !== null;
      challengeMarks.setLine(crossed ? null : challenge.camera, "camera");
      navigator?.setGates(`${challenge.id}:${run.attempt}:${crossed}`, () => (crossed ? [] : [{ ...challenge.camera, next: true, finish: true }]));
      return;
    }
    const next = run.players[seat].nextGate;
    navigator?.setGates(`${challenge.id}:${run.attempt}:${next}`, () =>
      challenge.gates.slice(next).map((gate, index) => ({ ...gate, next: index === 0, finish: next + index === challenge.gates.length - 1 })),
    );
    challengeMarks.setLine(next < challenge.gates.length ? challenge.gates[next] : null, next === challenge.gates.length - 1 ? "finish" : "gate");
  };

  const detailSpotAt = new Vector3();
  /** This frame's camera as a view of the ground, for what's drawn over the render. */
  const mapViewOf = (height: number, turn: number): MapView => {
    const { clientWidth: width, clientHeight: tall } = container;
    const scale = tall / 2 / Math.tan((camera.fov * Math.PI) / 360) / Math.max(height, 1);
    return {
      scale,
      turn,
      width,
      height: tall,
      toScreen: (x, z) => {
        projected.set(x, 0, z).project(camera);
        return [((projected.x + 1) / 2) * width, ((1 - projected.y) / 2) * tall];
      },
      toWorld: (screenX, screenY) => {
        raycaster.setFromCamera(new Vector2((screenX / width) * 2 - 1, 1 - (screenY / tall) * 2), camera);
        const hit = raycaster.ray.intersectPlane(groundPlane, groundHit);
        return hit ? [hit.x, hit.z] : [camera.position.x, camera.position.z];
      },
    };
  };

  const dayShown = (): DayShown => {
    const { date, hour, sun: place } = day.time();
    return { date: dateText(date), hour, sun: place, night: night.amount.value, held: day.clock.held, shared: day.clock.shared };
  };
  const setDay = ({ date, hour, held: holdHour }: DayChange) => {
    const now = seaHeldAt ?? seaNow();
    if (date !== undefined) day.clock.setDate(date);
    if (hour !== undefined) day.clock.setHour(hour, now);
    if (holdHour !== undefined) day.clock.hold(holdHour, now);
    day.update(now, 0);
  };

  const lampsAt = new Vector3();
  const lampsFacing = new Vector3();
  const aimHeadlights = ({ position, rotation: [x, y, z, w], lamps }: CarState) => {
    lampsFacing.set(-2 * (x * z + w * y), -2 * (y * z - w * x), -(1 - 2 * (x * x + y * y))).normalize();
    lampsAt.set(position[0], position[1] + HEADLAMPS_UP_M, position[2]).addScaledVector(lampsFacing, HEADLAMPS_AHEAD_M);
    headlights.update(lampsAt, lampsFacing, lamps.head);
  };

  const frame = (now: number) => {
    // A page with no room for the canvas (a hidden tab or pane) has nothing to draw into.
    if (container.clientWidth === 0 || container.clientHeight === 0) return;
    const seconds = Math.min(lastFrame === null ? 0 : (now - lastFrame) / 1000, LONGEST_FRAME_S);
    lastFrame = now;
    let share = 1;
    let stepped = 0;
    const menuHolds = devMenuOpen || gameMenu?.pauses === true;
    if (mapFrom && !heldFlight) worldMap?.step(controls.mapSteer(), seconds);
    if (!held && !mapFrom && !jumping && !menuHolds) {
      owedSeconds += seconds;
      stepped = Math.min(Math.floor(owedSeconds / STEP_S), MOST_STEPS_A_FRAME);
      for (let step = 0; step < stepped; step++) simStep(nextInput());
      owedSeconds = Math.min(owedSeconds - stepped * STEP_S, STEP_S);
      share = owedSeconds / STEP_S;
    }
    const car = drive.stateAt(share);
    carView.draw(car);
    carView.setLights(lightsOf(car.lamps));
    placeCarVolume(car);
    tyres.draw(share);
    onlineWorld?.send(stepped, drive.stateAt(1), drive.placements !== sentPlacements);
    sentPlacements = drive.placements;
    const players = drawRemotes(share);
    worldMap?.setPlayers(players);
    if (mapFrom && worldMap) {
      const carNow = mapFrom.car;
      const pose = mapCameraAt(worldMap.flight, mapFrom, mapTarget(worldMap), groundAt);
      camera.position.set(...pose.position);
      camera.rotation.set(pose.pitch, -pose.turn, 0, "YXZ");
      if (camera.fov !== pose.fieldOfViewDeg) {
        camera.fov = pose.fieldOfViewDeg;
        camera.updateProjectionMatrix();
      }
      camera.updateMatrixWorld();
      const height = camera.position.y - carNow[1];
      if (worldMap.wanted && worldMap.flight === 1 && height < MAP_FAR_FROM_M) mapLook = { x: camera.position.x, z: camera.position.z, detail: height < MAP_DETAIL_FROM_M };
      hazeM.value = HAZE_M * (1 + (Math.max(height, 0) / HAZE_CLEARS_FROM_M) ** 2);
      paintedShare.value = Math.max(1 - height / PAINTED_ROADS_GONE_M, 0);
      const shown = Math.max(0, Math.min(1, (height - OVERLAY_FROM_M) / (OVERLAY_FULL_M - OVERLAY_FROM_M)));
      worldMap.draw(mapViewOf(height, pose.turn), shown);
    } else if (cameraMode === "free") {
      if (!devMenuOpen && !gameMenu) freeCamera.update(now);
    } else {
      chaseCamera.update(car, held ? STEP_S * 4 : seconds, controls.look());
      hazeM.value = HAZE_M;
      paintedShare.value = 1;
    }
    const lifted = mapFrom !== null;
    const [spotX, spotY, spotZ] = mapLook ? [mapLook.x, groundAt(mapLook.x, mapLook.z), mapLook.z] : mapFrom ? mapFrom.position : camera.position.toArray();
    detailSpotAt.set(spotX, spotY, spotZ);
    const spot = detailSpotAt;
    detailSpot.value.copy(spot);
    edgeMesh.visible = !lifted;
    clipmap.showWide(lifted);
    const speed = speedOf(car);
    const toGoM = navigator?.update(car.position[0], car.position[2], headingClockwise(car), speed, players) ?? null;
    // A jump or a look round the map isn't a visit.
    if (discovery && !lifted && !jumping) {
      const reached = discovery.update(car.position[0], car.position[2]);
      for (const place of reached) events.onPlaceFound?.(place);
      if (reached.length > 0) showProgress();
    }
    const engine = drive.engine();
    const offer = lifted || jumping ? null : readOffer();
    const shown = day.time();
    const clock = { date: dateText(shown.date), hour: shown.hour, sunUp: shown.sun.elevationDeg > 0 };
    events.onHud({ speedKmh: speed * 3.6, gear: engine.reversing ? "R" : String(engine.gear + 1), revs: Math.min(engine.rpm / TUNINGS[drive.carId].gearbox.redlineRpm, 1), toGoM, challenge: readChallenge(), offer, coop: readCoop(), clock });
    if (challengeBoard.revision !== marksRevision) {
      marksRevision = challengeBoard.revision;
      challengeMarks.setStarts(challengeBoard.challenges.map((challenge) => ({ ...ringCentre(challenge), passed: challengeBoard.passOf(challenge) !== null })));
      showProgress();
    }
    showNextLine();
    challengeMarks.update();
    if (drive.placements !== placements) {
      placements = drive.placements;
      audio.reset();
    }
    const [carX, , carZ] = car.position;
    audio.update(stateFromCar(car, lastInput, { vehicle: drive.carId, engine, wheels: drive.player.surfaces(), condition: drive.condition, tyres: drive.tyres, place: placeAround(world, carX, carZ), paused: mapFrom !== null || jumping || menuHolds }), seconds);
    const focus = loadingAround ?? mapLook ?? (cameraMode === "free" ? { x: camera.position.x, z: camera.position.z } : { x: car.position[0], z: car.position[2] });
    stream.update(focus.x, focus.z, mapLook?.detail);
    layers.uploadStep();
    clipmap.update(spot);
    cameraSpot.value.set(spot.x, spot.z);
    forest.update(spot, camera);
    for (const clearing of Object.values(wallClearings)) clearing.update(spot);
    verge.update(spot, camera, seconds);
    reeds.update(spot, camera);
    shrubs.update(spot, camera);
    granite.update(spot, camera);
    docks.update(lifted || held || jumping || menuHolds ? 0 : seconds);
    if (!inPlayground) {
      boatsUnderWay.update(seaHeldAt ?? seaNow(), lifted || held || jumping || menuHolds ? 0 : seconds, camera.position);
      seaMarks.update(spot.x, spot.z, camera.position);
    }
    people.update(lifted || held || jumping || menuHolds ? 0 : seconds);
    if (!(lifted || held || jumping || menuHolds)) {
      streetClock.value += seconds;
      indicatorClock.value += seconds;
    }
    regattas.update(seaHeldAt ?? seaNow());
    drive.condition = ground.at(seaHeldAt ?? seaNow());
    stoneWalls.update(camera.position);
    parkedCars.update(camera.position);
    trafficFocus.x = camera.position.x;
    trafficFocus.z = camera.position.z;
    laneTrafficView.draw(laneTraffic, (trafficSteps + share) / TRAFFIC_EVERY, trafficContact.hitCars(share));
    cyclistsView.draw(laneTraffic, (trafficSteps + share) / TRAFFIC_EVERY, camera.position, stepped * STEP_S);
    roadside.update(camera.position);
    showRibbons(spot);
    landmarks.update(spot);
    day.update(seaHeldAt ?? seaNow(), lifted || held || jumping || menuHolds ? 0 : seconds);
    if (roadside.lampRevision() !== lampRevision) {
      lampRevision = roadside.lampRevision();
      nightLights.setLamps(roadside.lamps());
    }
    nightLights.update(camera.position);
    aimHeadlights(car);
    sky.update(camera.position, seconds);
    tiledFollows(camera.position.x, camera.position.z);
    renderer.render(scene, camera);
    frames++;
    if (!resolving) {
      resolving = true;
      void Promise.all([renderer.resolveTimestampsAsync(TimestampQuery.RENDER), renderer.resolveTimestampsAsync(TimestampQuery.COMPUTE)]).then(([ms, computeMs]) => {
        if (ms !== undefined && ms > 0) gpuMs = ms + (computeMs ?? 0);
        resolving = false;
      });
    }
  };
  await renderer.setAnimationLoop(frame);

  return {
    probe: {
      frames: () => frames,
      look: (at) => {
        setCamera("free");
        freeCamera.set(toView(at));
      },
      counts: () => ({
        webGpu: "isWebGPUBackend" in renderer.backend,
        drawCalls: renderer.info.render.drawCalls,
        // three counts an indirect draw as one tree, so the forest's come from the GPU's own count, a few frames old.
        triangles: renderer.info.render.triangles + forest.drawn().triangles + verge.drawn().triangles + reeds.drawn().triangles + shrubs.drawn().triangles + granite.drawn().triangles,
        gpuMs,
        width: renderer.domElement.width,
        height: renderer.domElement.height,
      }),
      forestDrawn: forest.drawn,
      vergeDrawn: verge.drawn,
      showVerge: verge.show,
      roadsideCounts: roadside.counts,
      showRoadside: roadside.show,
      peopleCounts: people.counts,
      showPeople: people.show,
      parkedCounts: parkedCars.counts,
      addOnCounts: buildingAddOns.counts,
      showParked: parkedCars.show,
      lanes: () => laneNet,
      showLanes: laneOverlay.show,
      traffic: (density, options) => {
        bubble.setDensity("car", density);
        if (options?.withPlayer !== undefined) trafficSeesPlayer = options.withPlayer;
      },
      cyclists: (density) => {
        bubble.setDensity("bike", density);
      },
      trafficCars: () => [...laneTraffic.all()],
      trafficSeen: (car) => sees(eyeNow(), groundAt, sightOf(car)),
      trafficCounts: () => {
        const all = [...laneTraffic.all()];
        const bikes = all.filter((vehicle) => vehicle.kind === "bike").length;
        return { cars: all.length - bikes, bikes, waiting: all.filter((vehicle) => vehicle.waiting).length, hit: trafficContact.count(), ...bubble.counts() };
      },
      reedsDrawn: reeds.drawn,
      showReeds: reeds.show,
      shrubsDrawn: shrubs.drawn,
      graniteDrawn: granite.drawn,
      showShrubs: shrubs.show,
      showGranite: granite.show,
      stoneWallsDrawn: stoneWalls.drawn,
      car: () => drive.stateAt(1),
      log: () => drive.log,
      hold: (next) => {
        held = next;
        seaHeldAt = next ? (seaHeldAt ?? seaNow()) : null;
      },
      advance: (steps, input) => {
        for (let step = 0; step < steps; step++) simStep(input ?? nextInput());
        if (seaHeldAt !== null) seaHeldAt += steps * STEP_S;
      },
      startRoute: (chain, cruiseMS, from) => {
        const line = startLine(chain);
        drive.placeAt(line.at(from));
        drive.log = emptyLog();
        autopilot = new Autopilot(line, cruiseMS, from);
      },
      routeFinished: () => autopilot?.finished() ?? false,
      placeOnRoad: (chain, at) => {
        drive.placeAt(startLine(chain).at(at));
      },
      setCamera,
      stream: () => stream.stats(),
      loadAround: (place) => {
        loadingAround = place;
      },
      startLine: (points, cruiseMS) => {
        const line = new RoadLine(Float32Array.from(points));
        const fold = line.foldsAt();
        if (fold) throw new Error(`the scripted driver can't follow a route that turns back on itself, as this does at ${fold.x.toFixed(0)}, ${fold.z.toFixed(0)}`);
        const start = line.at(0);
        drive.placeAt({ ...start, y: world.roads.nearest(start.x, start.z)?.y ?? start.y });
        drive.log = emptyLog();
        autopilot = new Autopilot(line, cruiseMS, 0);
      },
      mapReady: () => navigator !== null,
      setDestination: pickDestination,
      routePoints: () => (navigator?.route ? [...navigator.route.line.points] : null),
      routeThrough: (places) => {
        if (!roadGraph) throw new Error("no road network yet");
        const points: number[] = [];
        // Facing the first place to go, so the route doesn't start the far way along the road only to turn back.
        let heading = Math.atan2(places[1][0] - places[0][0], places[0][1] - places[1][1]);
        for (let leg = 1; leg < places.length; leg++) {
          const route = roadGraph.route(places[leg - 1][0], places[leg - 1][1], heading, places[leg][0], places[leg][1]);
          if (!route) throw new Error(`no way from ${places[leg - 1].join(", ")} to ${places[leg].join(", ")}`);
          points.push(...(leg === 1 ? route.line.points : route.line.points.subarray(3)));
          const last = route.line.at(route.line.length);
          heading = -last.heading;
        }
        return points;
      },
      jumpTo,
      driveFrom: async (spot) => {
        await jump(spot);
        setCamera("chase");
      },
      openMap: setMapOpen,
      holdFlight: (flight) => {
        heldFlight = flight !== null;
        if (flight !== null) worldMap?.holdAt(flight);
      },
      mapShown: () => worldMap?.flight ?? 0,
      cameraPlace: () => [...camera.position.toArray(), ...camera.getWorldDirection(new Vector3()).toArray()],
      placeNear: (x, z) => {
        const road = world.roads.nearest(x, z);
        if (!road) throw new Error(`no loaded road near ${x}, ${z}`);
        drive.placeAt(road);
      },
      memory: () => {
        const { usedJSHeapSize } = (performance as unknown as { memory: { usedJSHeapSize: number } }).memory;
        return { jsMB: usedJSHeapSize / 1e6, meshMB: meshBytes / 1e6, texturesMB: layers.textureBytes / 1e6 };
      },
      rendererMemory: () => ({ ...renderer.info.memory }),
      setCar,
      carId: () => drive.carId,
      surfaces: () => drive.player.surfaces(),
      tyreCounts: tyres.counts,
      showTyres: tyres.show,
      setCondition: (condition) => {
        ground.hold(condition);
        drive.condition = condition;
      },
      tyres: () => drive.tyres,
      online: () => {
        const state = onlineWorld?.state();
        return { status: state?.status ?? "idle", role: state?.role ?? null };
      },
      players: () =>
        [...others].map(([peerId, { name, heard }]) => ({
          peerId,
          name,
          position: !heard ? null : drive.remotes.stateAt(peerId, 1).position,
          drawn: remoteViews.drawn(peerId),
          ghost: drive.remotes.ghost(peerId),
        })),
      mapPlayers: () => ({ mini: navigator?.playersDrawn ?? 0, world: worldMap?.playersDrawn ?? 0 }),
      foundPlaces: () => (discovery ? discovery.places.filter((place) => discovery?.isFound(place)).map(({ id }) => id) : null),
      day: dayShown,
      setDay,
      showNightLights: (shown) => {
        nightLights.show(shown);
        headlights.cones.visible = shown;
      },
      holdSea: (seconds) => {
        seaHeldAt = seconds;
      },
      boatsUnderWay: () => boatsUnderWay.fleet(),
      showBoatsUnderWay: boatsUnderWay.show,
      seaMarksCounts: seaMarks.counts,
      showSeaMarks: seaMarks.show,
      addChallenge: (challenge) => {
        challengeBoard.add(challenge);
      },
      startChallenge: (id) => {
        const onLine = new Promise<void>((resolve) => {
          placedWaiters.push(resolve);
        });
        startChallenge(challengeBoard.byId(id));
        return onLine;
      },
      challenge: () => {
        if (!session) return null;
        const { run, challenge, seat } = session;
        return {
          id: challenge.id,
          attempt: run.attempt,
          phase: session.phase,
          clockS: run.clockS,
          gates: gatesPassed(run, seat),
          outcome: run.outcome,
          seat,
          players: run.players.length,
          partnerReady: session.partnerReady,
          results: run.players.map(({ result }) => result),
        };
      },
      driveChallenge: (cruiseMS) => {
        if (!session) throw new Error("no challenge to drive");
        const route = routeOf(session.challenge);
        if (!route) throw new Error("no road network yet");
        const { position } = drive.stateAt(1);
        let from = 0;
        for (let along = 0, nearest = Infinity; along <= route.line.length; along++) {
          const point = route.line.at(along);
          const distance = Math.hypot(point.x - position[0], point.z - position[2]);
          if (distance < nearest) [nearest, from] = [distance, along];
        }
        autopilot = new Autopilot(runOn(route.line, CHALLENGE_RUN_ON_M), cruiseMS, from);
      },
      challengeBest: (id) => challengeBoard.passOf(challengeBoard.byId(id))?.best ?? null,
      coop: () => {
        const standing = coop.now;
        const peer = standing.kind === "free" ? null : standing.peer;
        return { kind: standing.kind, peer, name: peer === null ? null : nameOf(peer), heard: { ...coop.heard } };
      },
      coopInvite: (name) => {
        const challenge = ringNow();
        if (!challenge) throw new Error("no challenge's start ring here to invite anyone to");
        const peer = [...others].find(([, other]) => other.name === name)?.[0];
        if (peer === undefined) throw new Error(`no player named ${name}`);
        coop.invite(peer, challenge);
      },
      coopAccept: () => {
        coop.accept();
      },
      retryChallenge: () => {
        if (!session) throw new Error("no challenge to retry");
        return session.retry();
      },
      holdChallengeMessages: (hold) => {
        if (hold) {
          heldMessages ??= [];
          return;
        }
        const waiting = heldMessages ?? [];
        heldMessages = null;
        for (const { from, message } of waiting) coop.hear(from, message);
      },
    },
    cars: CARS.flatMap(({ id, name, paint }) => (id ? [{ id, name, paint }] : [])),
    setCar,
    condition: () => drive.condition,
    setCondition: (condition) => {
      ground.hold(condition);
      drive.condition = condition;
    },
    day: dayShown,
    setDay,
    setDevMenuOpen,
    setGameMenuOpen,
    pickMenuItem,
    spots: spots.map(({ id, name }) => ({ id, name })),
    jumpTo(id) {
      setDevMenuOpen(false);
      void jumpTo(id).catch(fail);
    },
    hasDestination: () => navigator?.route !== null && navigator?.route !== undefined,
    jumpToDestination() {
      const route = navigator?.route;
      if (!route || !roadGraph) return;
      setDevMenuOpen(false);
      const { x, z } = route.end;
      const spot = roadGraph.nearest(x, z, DESTINATION_ROAD_M);
      const arriving = route.line.at(route.line.length).heading;
      void jump({ x, z, headingDeg: (-arriving * 180) / Math.PI, name: spot ? roadGraph.roadName(spot.edge) : "" }).catch(fail);
    },
    whereabouts,
    resetSave() {
      // The game holds what it loaded and would save it again, so it starts over from the cleared store.
      storage.clear();
      window.location.reload();
    },
    dispose() {
      void renderer.setAnimationLoop(null);
      document.removeEventListener("visibilitychange", hushWhenHidden);
      audio.dispose();
      observer.disconnect();
      freeCamera.dispose();
      controls.dispose();
      worldMap?.dispose();
      carView.dispose();
      unbindPageHide();
      onlineWorld?.stop();
      remoteViews.dispose();
      tyres.dispose();
      drive.dispose();
      stream.dispose();
      fetcher.dispose();
      forest.dispose();
      verge.dispose();
      reeds.dispose();
      shrubs.dispose();
      granite.dispose();
      clipmap.dispose();
      for (const { cells } of buildings.values()) {
        for (const { mesh } of cells) mesh.geometry.dispose();
      }
      wallMaterial.dispose();
      outbuildings.dispose();
      windmills.dispose();
      docks.dispose();
      boatsUnderWay.dispose();
      seaMarks.dispose();
      people.dispose();
      regattas.dispose();
      stoneWalls.dispose();
      for (const clearing of Object.values(wallClearings)) clearing.dispose();
      roadside.dispose();
      parkedCars.dispose();
      laneOverlay.dispose();
      laneTrafficView.dispose();
      cyclistsView.dispose();
      buildingAddOns.dispose();
      landmarks.dispose();
      challengeMarks.dispose();
      outbuildingMaterials.near.dispose();
      outbuildingMaterials.far.dispose();
      detail.dispose();
      for (const { cells } of ribbons.values()) {
        for (const { mesh } of cells) mesh.geometry.dispose();
      }
      for (const mesh of bridges.values()) mesh.geometry.dispose();
      bridgeMaterial.dispose();
      overviewTexture.dispose();
      seaGeometry.dispose();
      edgeGeometry.dispose();
      edgeMaterial.dispose();
      seaMaterial.dispose();
      sky.dispose();
      waterOf.dispose();
      roadMaterial.dispose();
      layers.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
