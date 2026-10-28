import { NeutralToneMapping, PerspectiveCamera, Scene, Timer, WebGPURenderer } from "three/webgpu";
import { groundSeason as groundSeasonAt, plantSeason } from "../engine/seasons";
import { parseDate } from "../engine/calendar";
import { createWorld, type World } from "../engine/world";
import { FIELD_OF_VIEW, lookDirection, stepFlight, type Flight } from "../camera/flight";
import { flyInput } from "../camera/fly-input";
import { QUALITY } from "../quality";
import { air } from "./air";
import { advanceClock, holdHour, makeClock, setDay, setHour, type Clock } from "./clock";
import { makeDaylight } from "./daylight";
import { makeGrass } from "./grass";
import { makeLand } from "./land";
import { readPalette } from "./palette";
import { makePlaces } from "./places";
import { makePlants, plantSeasonDay } from "./plants";
import { makeSky, SKY_RADIUS } from "./sky";
import { groundSeason } from "./terrain";
import { waterSeason } from "./water";

/*
 * Hearthwood's world drawn on WebGPU, with no framework between the game
 * and three.js: one renderer, one scene, one loop. Each frame the clock
 * moves on, the free camera flies, the light and the seasons are set into
 * the shared uniforms, the land, plants, grass and places stream round the
 * camera, and the frame is drawn. Nothing on the page re-renders for it.
 */

export interface GameOptions {
  seed: string;
  /** The hour to hold, or null for the day to turn. */
  hour: number | null;
  /** The game day to start on (see `parseDate`), or null for the calendar's start. */
  day: number | null;
  /** The northern lights' strength held on, or null for the night's own. */
  aurora: number | null;
  /** Where the camera starts, if not the default. */
  start?: Flight;
}

/** What the page shows over the world, told whenever it changes. */
export interface GameStatus {
  speed: number;
  locked: boolean;
}

/** A control surface for tests and the screenshot tool: everything here waits on events, never time. */
export interface GameProbe {
  /** Frames drawn so far. */
  frames: () => number;
  /** Whether everything the camera wants is built and drawn. */
  settled: () => boolean;
  camera: () => Flight;
  setCamera: (flight: Partial<Flight>) => void;
  /** Holds the hour, or lets the day turn when null. */
  holdHour: (hour: number | null) => void;
  /** Moves to a date, written as `parseDate` reads it. */
  setDate: (date: string) => void;
  /** Holds motion still (the breeze, the northern lights' drift) at a moment, or lets it run when null. */
  holdMotion: (seconds: number | null) => void;
  world: World;
}

export interface Game {
  probe: GameProbe;
  dispose: () => void;
}

/** The camera's start: above the meadows near the world's origin, looking out north-east. */
const START: Flight = { x: 0, y: 0, z: 0, yaw: Math.PI * 0.8, pitch: -0.08 };
/** How high above the ground the camera starts, in metres. */
const START_HEIGHT = 25;

export async function startGame(container: HTMLElement, options: GameOptions, onStatus: (status: GameStatus) => void): Promise<Game> {
  const renderer = new WebGPURenderer({ antialias: true, reversedDepthBuffer: true });
  await renderer.init();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY.maxPixelRatio));
  renderer.toneMapping = NeutralToneMapping;
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  container.appendChild(renderer.domElement);

  const palette = readPalette();
  const world = createWorld(options.seed);
  const scene = new Scene();
  const camera = new PerspectiveCamera(FIELD_OF_VIEW, 1, 0.2, SKY_RADIUS * 1.1);
  const clock: Clock = makeClock(options.hour, options.day);
  const timer = new Timer();
  const daylight = makeDaylight(palette, () => options.aurora);
  const sky = makeSky(palette);
  const land = makeLand(world, palette, QUALITY);
  const plants = makePlants(world, palette, QUALITY);
  const grass = makeGrass(palette, QUALITY);
  const places = makePlaces(world, palette);
  scene.add(sky.object, land.object, plants.object, grass.object, places.object);

  const start = options.start ?? START;
  let flight: Flight = { ...start, y: options.start ? start.y : world.surfaceAt(start.x, start.z) + START_HEIGHT };
  let frames = 0;
  let settled = false;
  let heldMotion: number | null = null;

  const input = flyInput(renderer.domElement, () => {
    onStatus({ speed: input.speed(), locked: input.locked() });
  });
  onStatus({ speed: input.speed(), locked: input.locked() });

  const resize = () => {
    const { clientWidth, clientHeight } = container;
    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / Math.max(1, clientHeight);
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  const frame = (timestamp: number) => {
    timer.update(timestamp);
    const seconds = Math.min(timer.getDelta(), 0.1);
    advanceClock(clock, seconds);
    if (heldMotion !== null) clock.motion = heldMotion;

    flight = stepFlight(flight, input.read(), world.surfaceAt, seconds);
    camera.position.set(flight.x, flight.y, flight.z);
    const ahead = lookDirection(flight);
    camera.lookAt(flight.x + ahead.x, flight.y + ahead.y, flight.z + ahead.z);

    renderer.toneMappingExposure = daylight.update(clock);
    const day = clock.date.realDayOfYear;
    const ground = groundSeasonAt(day);
    groundSeason.snowLine.value = ground.snowLine;
    groundSeason.dormant.value = ground.dormant;
    groundSeason.fresh.value = ground.fresh;
    groundSeason.gold.value = ground.gold;
    groundSeason.litter.value = ground.litter;
    const birch = plantSeason("birch", day);
    groundSeason.canopyTurn.value = birch.turn;
    groundSeason.canopyBare.value = 1 - birch.leaf;
    waterSeason.ice.value = ground.ice;
    plantSeasonDay.value = day;
    air.motion.value = clock.motion;

    sky.follow(camera.position);
    const landReady = land.update(camera.position);
    const plantsReady = plants.update(camera.position);
    grass.update(camera.position, land.finestTile);
    places.update(camera.position);
    settled = landReady && plantsReady;

    // A page with no room for the canvas (a hidden tab or pane) has nothing to draw into.
    if (container.clientWidth === 0 || container.clientHeight === 0) return;
    renderer.render(scene, camera);
    frames++;
  };
  await renderer.setAnimationLoop(frame);

  const probe: GameProbe = {
    frames: () => frames,
    settled: () => settled,
    camera: () => ({ ...flight }),
    setCamera(next) {
      flight = { ...flight, ...next };
    },
    holdHour(hour) {
      holdHour(clock, hour);
      if (hour !== null) setHour(clock, hour);
    },
    setDate(date) {
      setDay(clock, parseDate(date));
    },
    holdMotion(seconds) {
      heldMotion = seconds;
    },
    world,
  };

  return {
    probe,
    dispose() {
      void renderer.setAnimationLoop(null);
      observer.disconnect();
      input.dispose();
      sky.dispose();
      land.dispose();
      plants.dispose();
      grass.dispose();
      places.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
