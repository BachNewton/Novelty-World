"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Color } from "three";
import { ALTITUDE, emptySample } from "../../engine/land";
import type { PointOfView } from "../../input/point-of-view";
import { mainRegion, REGIONS } from "../../engine/regions";
import type { World } from "../../engine/world";
import { canPick, spotLook, type SpotLook } from "../../gameplay/picking";
import type { Palette } from "../../art/palette";
import type { SunDay } from "../../engine/astronomy";
import { dateAt, parseDate, startTime, type CalendarDate } from "../../engine/calendar";
import type { DaySky } from "../../engine/day";
import { holdHour, setDay, type ValleyClock } from "./clock";
import { liveFeatures, type FeatureId, type FeatureToggles } from "../../features";
import type { FrameCosts } from "../../art/passes";
import { AFTER_RENDER_PRIORITY } from "./feature-renderer";
import { FIRST_ORBIT, type Orbit } from "./follow-camera";
import { forageTime, forgetForaging, goToDayOfYear, pickSpot, setBasketOpen, stockBasket, type Foraging } from "./foraging";
import { chooseIngredient, chooseWay, closeCooking, cook, cookedSoFar, cookMore, forgetCooking, holdCooking, openCooking, setBookOpen as setRecipeBookOpen, stockDish, type Hearth } from "./hearth";
import { isDish, isFood, isStaple, type Cookware } from "../../gameplay/recipes";
import type { ForageKind } from "../../engine/regions";
import type { CameraView, Walker } from "./walker";
import type { Streaming } from "./world-land";
import type { WeatherKind } from "../../engine/weather";
import type { SceneWeather } from "./world-weather";
import type { WeatherNow } from "../../art/weather/now";
import { anotherName, companionOf, forgetFriends, friendsAround, knowFriend, keepName, petAnimal, setCompanionsOpen, straysAround, treatAnimal, winStray, type Companionship } from "./companionship";
import { walk as walkOn } from "../../gameplay/walking";

/*
 * The world's handle for screenshots and tests, on `window.__hearthwoodWorld`:
 * whether it is ready (its shaders compiled, everything the camera wants
 * streamed in, and a frame drawn), a frame counter to wait on, what the last
 * frame drew, switches for the hour, the date, the motion clock, the camera and where
 * the walker stands, the point of view and where it looks, a jump or a glide begun from a spot (and held there), a free camera, readings of the world at a point, a
 * map of an area drawn from the world itself, and foraging: a real day of the
 * year to go to, the spots near a point and how each shows, what is on offer, picking,
 * the basket and forgetting it; and the companions: the live animals, the strays near a
 * point, stepping their rules on the spot or walking Elliott with them, placing one,
 * winning, petting and treating one, the naming card, the companions' row, and whether
 * the animals have settled into their poses; and cooking: whether the fire is offered,
 * sitting down, choosing, cooking (held part-cooked if asked), the dish served, the
 * recipe book, the larder, and dishes or forage put in the basket. Waiting on these is waiting on
 * events, never on time.
 */

export interface DrawnFrame {
  triangles: number;
  calls: number;
  points: number;
  geometries: number;
  programs: number;
  /** Milliseconds between the last frames drawn, newest last. */
  frameTimes: number[];
  pixelRatio: number;
  width: number;
  height: number;
}

/** A camera put anywhere, looking at a point, overriding the walker's. */
export interface FreeCamera {
  x: number;
  y: number;
  z: number;
  lookX: number;
  lookY: number;
  lookZ: number;
}

export interface MapRequest {
  /** The middle of the area and its width, in metres, and the map's width in pixels. */
  x: number;
  z: number;
  size: number;
  pixels: number;
  /** Mark camp and the places. */
  places?: boolean;
  /** Shade by height alone, low dark to high light, instead of by region. */
  relief?: boolean;
}

export interface WorldProbe {
  seed: string;
  isReady: () => boolean;
  /** Whether everything the camera wants is streamed in and drawn. */
  settled: () => boolean;
  frameCount: () => number;
  drawn: () => DrawnFrame;
  hour: () => number;
  /** Holds the day at an hour, or lets it turn again from there with null. */
  holdHour: (hours: number | null) => void;
  /** The date and hour now, the sky (sun, moon, key light, the light's moments) and today's sunrise, sunset and twilights. */
  date: () => CalendarDate;
  sky: () => DaySky;
  today: () => SunDay;
  /** Moves to a date at the same hour: a season and its day (`summer-2`), a festival (`litha`), a day number, or null for a new game's first day. */
  setDate: (date: string | number | null) => void;
  /** Holds every motion (flames, water, the breeze) at a moment, or lets it run with null. */
  holdMotion: (seconds: number | null) => void;
  setView: (view: CameraView) => void;
  setOrbit: (orbit: Partial<Orbit>) => void;
  setPointOfView: (view: PointOfView) => void;
  /** Where the walker looks in first person: the yaw is the orbit's, shared by both views. */
  setLook: (look: { yaw?: number; pitch?: number }) => void;
  placeWalker: (x: number, z: number, heading?: number) => void;
  walker: () => { x: number; z: number; heading: number; mode: string; y: number };
  /** Jumps, as the jump button does. */
  jump: () => void;
  /** Puts the walker on the broom `above` metres over a spot, flying along a heading. */
  glide: (x: number, z: number, above: number, heading: number) => void;
  /** Holds the walker where they are, in the air or not, while the camera and the world catch up; false lets them go on. */
  holdWalker: (held: boolean) => void;
  setFreeCamera: (camera: FreeCamera | null) => void;
  /** Holds the weather at one kind (a clear day, mist, rain…), or lets the sky do as it will with null. */
  holdWeather: (kind: WeatherKind | null) => void;
  /** The weather now, as the art reads it. */
  weather: () => Omit<WeatherNow, "regions">;
  /** Switches a feature (see features.ts) on or off for this visit. */
  setFeature: (id: FeatureId, on: boolean) => void;
  features: () => FeatureToggles;
  /** Times the frame on the GPU from now on (or stops), for `gpuCosts`. */
  watchCosts: (on: boolean) => void;
  /** Each part of the frame's GPU time in ms, as last read (a frame or two behind): the scene's draws and each pass by its id. Null where the browser can't time the GPU. */
  gpuCosts: () => Record<string, number> | null;
  /** Where the camera is and the orbit it is on. */
  camera: () => { x: number; y: number; z: number; orbit: Orbit };
  camp: () => { x: number; z: number };
  /** The places near a point; a cascade says where its foot is, and a tarn how wide it is. */
  placesNear: (x: number, z: number, radius: number) => { kind: string; x: number; z: number; y: number; turn: number; foot: { x: number; z: number } | null; radius: number | null }[];
  /** The land at a point: its height, water, river, and its main region with every region's share. */
  at: (x: number, z: number) => { height: number; water: number; river: number; mountainous: number; woodland: number; region: string; regions: Record<string, number> };
  /** A top-down map of an area, as a PNG data URL: regions, woods, water, rock and snow, shaded by the lie of the land. */
  map: (request: MapRequest) => string;
  forage: ForageProbe;
  companions: CompanionsProbe;
  cooking: CookingProbe;
  /** The motion clock's seconds now, to hold motion where it is. */
  motion: () => number;
}

/** A live animal, as the probe reports it. */
export interface AnimalReading {
  key: string;
  species: string;
  /** A stray, a companion following, one resting at camp, or a forest friend. */
  kind: "stray" | "following" | "resting" | "friend";
  name: string | null;
  x: number;
  y: number;
  z: number;
  heading: number;
  activity: string;
  /** Seconds of motion since it last changed what it was doing, or its greeting. */
  held: number;
  warmth: number;
  /** A stray's personality, for choosing one to shoot. */
  boldness: number;
  affection: number;
  favourite: string | null;
  home: { x: number; z: number } | null;
  /** A hedgehog's ride in the basket, and a squirrel's height up its trunk, or null. */
  ride: string | null;
  climb: number | null;
}

export interface CompanionsProbe {
  /** Every live animal: the strays round Elliott and the companions. */
  animals: () => AnimalReading[];
  /** The forest friends whose homes lie within `radius` of a point, live or not: a squirrel's trunk and a deer's bed with them. */
  friendsNear: (x: number, z: number, radius: number) => { id: string; species: string; x: number; z: number; trunk: { x: number; z: number; radius: number; bare: number } | null; bed: { x: number; z: number } | null }[];
  /** Makes a forest friend know Elliott, as three visits would. */
  know: (key: string) => void;
  /** Holds a squirrel up its trunk at a height, facing a way out from it, until it is let go (`null`). */
  climb: (key: string, height: number | null, side?: number) => void;
  /** The strays whose homes lie within `radius` of a point, live or not. */
  straysNear: (x: number, z: number, radius: number) => { id: string; species: string; x: number; z: number; roam: number }[];
  /** Steps the animals' rules on the spot for some seconds, Elliott standing where they are. */
  simulate: (seconds: number) => void;
  /** Walks Elliott along a heading for some metres at a pace (metres a second), the animals following as they would. */
  walk: (heading: number, metres: number, pace: number) => void;
  /** Puts a live animal somewhere, facing a way, at rest in a posture. */
  place: (key: string, x: number, z: number, heading: number, rest?: "stand" | "sit" | "lie") => void;
  /** Wins a live stray over at once, opening the naming card. */
  win: (key: string) => void;
  pet: (key: string) => void;
  treat: (key: string) => void;
  /** What is offered for an animal, if anything. */
  offer: () => { key: string; canPet: boolean; treat: string | null } | null;
  /** The naming card's suggestion showing, if it is up; another one; keeping a name. */
  naming: () => string | null;
  another: () => void;
  keep: (name?: string) => void;
  setOpen: (open: boolean) => void;
  /** Whether every animal in view is drawn, and every one (or the one named) has held what it is doing for `seconds` of motion. */
  settled: (seconds: number, key?: string) => boolean;
  /** Forgets every companion and every stray's warmth. */
  forget: () => void;
}

export interface ForageProbe {
  /** Moves the calendar, at the same hour, to the game day this year that stands for a real day of the year (0 is 1 January). */
  setDayOfYear: (dayOfYear: number) => void;
  /** The spots to pick near a point, and how each shows today. */
  spotsNear: (x: number, z: number, radius: number) => { id: string; kind: string; x: number; y: number; z: number; look: SpotLook }[];
  /** The id of the spot on offer, if any. */
  target: () => string | null;
  /** Picks a spot by its id (one near the walker), or the one on offer; whether anything was picked. */
  pick: (id?: string) => boolean;
  basket: () => Record<string, number>;
  setBasketOpen: (open: boolean) => void;
  /** Empties the basket and forgets every pick. */
  forget: () => void;
  /** Puts some of a kind in the basket as if picked. */
  stock: (kind: string, count: number) => void;
}

export interface CookingProbe {
  /** Whether the fire is offered to cook at. */
  offered: () => boolean;
  /** Sits down at the fire, as using it does. */
  open: () => void;
  /** Chooses these ingredients (and a way to cook them) afresh. */
  choose: (ingredients: string[], cookware?: string) => void;
  cook: () => void;
  /** The turn at the fire, if one is on, and how far the dish has cooked. */
  state: () => { phase: string; chosen: string[]; cookware: string; dish: string | null; discovered: boolean; cooked: number } | null;
  /** Holds a dish cooking this far (0 to 1), or lets it cook with null. */
  hold: (at: number | null) => void;
  again: () => void;
  leave: () => void;
  setBookOpen: (open: boolean) => void;
  larder: () => { dishes: Record<string, number>; known: string[] };
  /** Puts dishes in the basket as if cooked. */
  stock: (dish: string, count?: number) => void;
  /** Empties the larder and the recipe book. */
  forget: () => void;
}

declare global {
  interface Window {
    __hearthwoodWorld?: WorldProbe;
  }
}

const KEPT_FRAME_TIMES = 120;
/** The height the relief map shows white, about the highest peaks', in metres. */
const RELIEF_TOP = 2600;
const FREE_CAMERA_PRIORITY = -2;

function drawMap(world: World, palette: Palette, { x, z, size, pixels, places = false, relief = false }: MapRequest): string {
  const canvas = document.createElement("canvas");
  canvas.width = pixels;
  canvas.height = pixels;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No 2D canvas for the map");
  const image = context.createImageData(pixels, pixels);
  const step = size / pixels;
  const s = emptySample();
  const weights = new Float32Array(REGIONS.length);
  const heights = new Float32Array((pixels + 1) * (pixels + 1));
  for (let j = 0; j <= pixels; j++) for (let i = 0; i <= pixels; i++) heights[j * (pixels + 1) + i] = world.landAt(x - size / 2 + i * step, z - size / 2 + j * step, s).height;
  const colour = new Color();
  const part = new Color();
  for (let j = 0; j < pixels; j++) {
    for (let i = 0; i < pixels; i++) {
      const px = x - size / 2 + i * step;
      const pz = z - size / 2 + j * step;
      const land = world.landAt(px, pz, s);
      const h = heights[j * (pixels + 1) + i];
      const dx = (heights[j * (pixels + 1) + i + 1] - h) / step;
      const dz = (heights[(j + 1) * (pixels + 1) + i] - h) / step;
      world.regionAt(px, pz, land, weights);
      const wood = world.woodlandAt(px, pz, land, weights, Math.hypot(dx, dz), false);
      colour.setRGB(0, 0, 0);
      REGIONS.forEach((region, r) => {
        part.copy(palette.regions[region].meadow).lerp(palette.regions[region].forest, wood);
        colour.r += part.r * weights[r];
        colour.g += part.g * weights[r];
        colour.b += part.b * weights[r];
      });
      // Relief from the lowlands to the highest peaks, with more of its shades given to the lower ground.
      if (relief) colour.setScalar(0.15 + 0.85 * Math.sqrt(Math.min(1, Math.max(0, h / RELIEF_TOP))));
      const banded = h - land.bands;
      if (banded > ALTITUDE.rock) colour.lerp(palette.things["ground-rock"], Math.min(1, (banded - ALTITUDE.rock) / 15));
      if (banded > ALTITUDE.snow) colour.lerp(palette.things["ground-snow"], Math.min(1, (banded - ALTITUDE.snow) / 10));
      if (land.water > land.height) colour.copy(palette.things["water-deep"]).lerp(palette.things["water-shallow"], 0.3);
      // Lit from the north-west, as a map is.
      const shade = Math.min(1.35, Math.max(0.45, 1 + (dx + dz) * -0.9));
      const o = (j * pixels + i) * 4;
      image.data[o] = Math.min(255, colour.r * shade * 255);
      image.data[o + 1] = Math.min(255, colour.g * shade * 255);
      image.data[o + 2] = Math.min(255, colour.b * shade * 255);
      image.data[o + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  const mark = (mx: number, mz: number, fill: string, radius: number) => {
    context.beginPath();
    context.arc(((mx - x + size / 2) / size) * pixels, ((mz - z + size / 2) / size) * pixels, radius, 0, Math.PI * 2);
    context.fillStyle = fill;
    context.fill();
    context.strokeStyle = "#000";
    context.stroke();
  };
  if (places) {
    for (const place of world.placesNear(x, z, size * 0.71)) mark(place.x, place.z, place.kind === "waterfall" ? "#7fd8ff" : "#ffe9a0", 3);
    mark(world.camp.x, world.camp.z, "#ff5a2a", 5);
  }
  return canvas.toDataURL("image/png");
}

export function WorldProbeHandle({
  world,
  palette,
  clock,
  walker,
  streaming,
  freeCamera,
  weather,
  foraging,
  companionship,
  hearth,
  costs,
  setPointOfView,
}: {
  world: World;
  palette: Palette;
  clock: ValleyClock;
  walker: Walker;
  streaming: Streaming;
  freeCamera: { at: FreeCamera | null };
  weather: SceneWeather;
  foraging: Foraging;
  companionship: Companionship;
  hearth: Hearth;
  costs: FrameCosts;
  setPointOfView: (view: PointOfView) => void;
}) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const frames = useRef(0);
  const compiled = useRef(false);
  const times = useRef<number[]>([]);
  const last = useRef<number | null>(null);
  const drawn = useRef({ triangles: 0, calls: 0, points: 0 });

  useEffect(() => {
    let live = true;
    void gl.compileAsync(scene, camera).then(() => {
      if (live) compiled.current = true;
    });
    const settled = () => streaming.land && streaming.plants && streaming.places && foraging.settled;
    const weights = new Float32Array(REGIONS.length);
    let stopWatching: (() => void) | null = null;
    window.__hearthwoodWorld = {
      seed: world.seed,
      isReady: () => compiled.current && settled() && frames.current > 1,
      settled,
      frameCount: () => frames.current,
      drawn: () => ({
        ...drawn.current,
        geometries: gl.info.memory.geometries,
        programs: gl.info.programs?.length ?? 0,
        frameTimes: [...times.current],
        pixelRatio: gl.getPixelRatio(),
        width: gl.domElement.width,
        height: gl.domElement.height,
      }),
      hour: () => clock.hours,
      holdHour: (hours) => {
        holdHour(clock, hours);
      },
      date: () => clock.date,
      sky: () => clock.sky,
      today: () => clock.today,
      setDate: (date) => {
        setDay(clock, date === null ? dateAt(startTime()).day : typeof date === "number" ? date : parseDate(date));
      },
      holdMotion: (seconds) => {
        clock.heldMotion = seconds;
      },
      setView: (view) => {
        walker.view = view;
      },
      setOrbit: (orbit) => {
        walker.orbit = { ...FIRST_ORBIT, ...walker.orbit, ...orbit };
      },
      setPointOfView,
      setLook: ({ yaw, pitch }) => {
        if (yaw !== undefined) walker.orbit = { ...walker.orbit, yaw };
        if (pitch !== undefined) walker.lookPitch = pitch;
      },
      placeWalker: (x, z, heading) => {
        walker.x = x;
        walker.z = z;
        if (heading !== undefined) walker.heading = heading;
      },
      walker: () => ({ x: walker.x, z: walker.z, heading: walker.heading, mode: walker.air?.mode ?? "ground", y: walker.air?.y ?? world.heightAt(walker.x, walker.z) }),
      jump: () => {
        walker.request = { kind: "jump" };
      },
      glide: (x, z, above, heading) => {
        walker.request = { kind: "glide", x, z, above, heading };
        walker.heading = heading;
      },
      holdWalker: (held) => {
        walker.held = held;
      },
      setFreeCamera: (at) => {
        freeCamera.at = at;
        // The streamed parts are only sure of what is wanted once they have seen the camera where it now is.
        streaming.land = false;
        streaming.plants = false;
        streaming.places = false;
      },
      holdWeather: (kind) => {
        weather.hold(kind);
      },
      weather: () => ({ weather: weather.weather, held: weather.held, flash: weather.flash, floor: weather.floor }),
      setFeature: (id, on) => {
        liveFeatures().set(id, on);
      },
      features: () => liveFeatures().toggles(),
      watchCosts: (on) => {
        stopWatching?.();
        stopWatching = on ? costs.watch() : null;
      },
      gpuCosts: () => (costs.available ? costs.lastReadings() : null),
      camera: () => ({ x: camera.position.x, y: camera.position.y, z: camera.position.z, orbit: walker.orbit }),
      camp: () => ({ x: world.camp.x, z: world.camp.z }),
      placesNear: (x, z, radius) =>
        world.placesNear(x, z, radius).map((p) => ({
          kind: p.kind,
          x: p.x,
          z: p.z,
          y: p.y,
          turn: p.turn,
          foot: p.fall ? { x: p.fall[p.fall.length - 3], z: p.fall[p.fall.length - 1] } : null,
          radius: p.pool?.radius ?? null,
        })),
      at: (x, z) => {
        const land = world.sampleAt(x, z);
        world.regionAt(x, z, land, weights);
        return {
          height: land.height,
          water: land.water,
          river: land.river,
          mountainous: land.mountainous,
          woodland: world.woodlandAt(x, z, land, weights, 0),
          region: mainRegion(weights),
          regions: Object.fromEntries(REGIONS.map((r, i) => [r, weights[i]])),
        };
      },
      map: (request) => drawMap(world, palette, request),
      forage: {
        setDayOfYear: (day) => {
          goToDayOfYear(clock, day);
        },
        spotsNear: (x, z, radius) => {
          const time = forageTime(clock);
          return foraging.forage.spotsNear(x, z, radius).map((s) => ({ id: s.id, kind: s.kind, x: s.x, y: s.y, z: s.z, look: spotLook(s, foraging.foraged, time) }));
        },
        target: () => foraging.target?.id ?? null,
        pick: (id) => {
          const time = forageTime(clock);
          const spot = id === undefined ? foraging.target : (foraging.forage.spotsNear(walker.x, walker.z, 12).find((s) => s.id === id) ?? null);
          if (!spot || !canPick(spot, foraging.foraged, time)) return false;
          pickSpot(foraging, spot, time);
          return true;
        },
        basket: () => ({ ...foraging.foraged.basket }),
        setBasketOpen: (open) => {
          setBasketOpen(foraging, open);
        },
        forget: () => {
          forgetForaging(foraging);
        },
        stock: (kind, count) => {
          if (!isFood(kind) && kind !== "fly-agaric") throw new Error(`${kind} isn't forage`);
          stockBasket(foraging, kind as ForageKind, count);
        },
      },
      cooking: {
        offered: () => hearth.shown.offered,
        open: () => {
          openCooking(hearth);
        },
        choose: (ingredients, cookware) => {
          const session = hearth.shown.session;
          if (session?.phase !== "choosing") throw new Error("Not choosing at the fire");
          for (const i of session.chosen) chooseIngredient(hearth, i);
          for (const i of ingredients) {
            if (!isFood(i) && !isStaple(i)) throw new Error(`${i} is never cooked`);
            chooseIngredient(hearth, i);
          }
          if (cookware !== undefined) chooseWay(hearth, cookware as Cookware);
        },
        cook: () => {
          cook(hearth);
        },
        state: () => {
          const s = hearth.shown.session;
          return s && { phase: s.phase, chosen: [...s.chosen], cookware: s.cookware, dish: s.phase === "choosing" ? null : s.dish, discovered: s.phase !== "choosing" && s.discovered, cooked: cookedSoFar(hearth) };
        },
        hold: (at) => {
          holdCooking(hearth, at);
        },
        again: () => {
          cookMore(hearth);
        },
        leave: () => {
          closeCooking(hearth);
        },
        setBookOpen: (open) => {
          setRecipeBookOpen(hearth, open);
        },
        larder: () => ({ dishes: { ...hearth.shown.larder.dishes } as Record<string, number>, known: [...hearth.shown.larder.known] }),
        stock: (dish, count = 1) => {
          if (!isDish(dish)) throw new Error(`${dish} is no dish`);
          stockDish(hearth, dish, count);
        },
        forget: () => {
          forgetCooking(hearth);
        },
      },
      motion: () => clock.motion,
      companions: {
        animals: () =>
          [...companionship.animals.values()].map((a) => {
            const companion = companionOf(companionship, a.key);
            return {
              key: a.key,
              species: a.species,
              kind: a.friend ? "friend" : a.stray ? "stray" : companion?.following === false ? "resting" : "following",
              ride: a.ride?.phase ?? null,
              climb: a.friend?.mind.climb?.height ?? null,
              name: companion?.name ?? null,
              x: a.body.x,
              y: a.y,
              z: a.body.z,
              heading: a.body.heading,
              activity: a.look.drive.current.activity,
              held: clock.motion - a.changedAt,
              warmth: a.bond.warmth,
              boldness: a.nature.boldness,
              affection: a.nature.affection,
              favourite: a.tastes.favourite,
              home: a.stray?.home ?? null,
            };
          }),
        straysNear: (x, z, radius) => straysAround(companionship, x, z, radius).map((s) => ({ id: s.id, species: s.species, x: s.home.x, z: s.home.z, roam: s.roam })),
        friendsNear: (x, z, radius) => friendsAround(companionship, x, z, radius).map((f) => ({ id: f.id, species: f.species, x: f.home.x, z: f.home.z, trunk: f.trunk && { x: f.trunk.x, z: f.trunk.z, radius: f.trunk.radius, bare: f.trunk.bare }, bed: f.bed })),
        know: (key) => {
          knowFriend(companionship, key);
        },
        climb: (key, height, side = 0) => {
          const animal = companionship.animals.get(key);
          if (!animal?.friend?.place.trunk) throw new Error(`No live squirrel ${key} with a trunk to climb`);
          animal.friend.mind.climb = height === null ? null : { height, goal: height, side, until: Infinity };
        },
        simulate: (seconds) => {
          if (!companionship.simulate) throw new Error("The animals are not in the scene to step");
          companionship.simulate(seconds);
        },
        walk: (heading, metres, pace) => {
          const simulate = companionship.simulate;
          if (!simulate) throw new Error("The animals are not in the scene to step");
          const step = pace / 30;
          for (let gone = 0; gone < metres; gone += step) {
            const to = walkOn(world, walker, Math.sin(heading) * step, Math.cos(heading) * step);
            walker.x = to.x;
            walker.z = to.z;
            walker.heading = heading;
            simulate(1 / 30);
          }
        },
        place: (key, x, z, heading, rest = "stand") => {
          const animal = companionship.animals.get(key);
          if (!animal) throw new Error(`No live animal ${key} to place`);
          Object.assign(animal.body, { x, z, heading, speed: 0, rest });
          animal.y = world.heightAt(x, z);
        },
        win: (key) => {
          winStray(companionship, key);
        },
        pet: (key) => {
          petAnimal(companionship, key);
        },
        treat: (key) => {
          treatAnimal(companionship, key);
        },
        offer: () => {
          const offer = companionship.shown.offer;
          return offer && { key: offer.key, canPet: offer.canPet, treat: offer.treat };
        },
        naming: () => {
          const naming = companionship.shown.naming;
          return naming && naming.suggestions[naming.index];
        },
        another: () => {
          anotherName(companionship, 1);
        },
        keep: (name) => {
          const naming = companionship.shown.naming;
          if (!naming) throw new Error("No naming card is up");
          keepName(companionship, name ?? naming.suggestions[naming.index]);
        },
        setOpen: (open) => {
          setCompanionsOpen(companionship, open);
        },
        settled: (seconds, key) =>
          (companionship.meshed?.() ?? false) && [...companionship.animals.values()].every((a) => (key !== undefined && a.key !== key) || clock.motion - a.changedAt >= seconds),
        forget: () => {
          forgetFriends(companionship);
        },
      },
    };
    return () => {
      live = false;
      stopWatching?.();
      delete window.__hearthwoodWorld;
    };
  }, [gl, scene, camera, world, palette, clock, walker, streaming, freeCamera, weather, foraging, companionship, hearth, costs, setPointOfView]);

  useFrame(({ camera: eye }) => {
    const at = freeCamera.at;
    if (!at) return;
    eye.position.set(at.x, at.y, at.z);
    eye.lookAt(at.lookX, at.lookY, at.lookZ);
  }, FREE_CAMERA_PRIORITY);

  // After the frame is drawn: what it drew, and that it was.
  useFrame(() => {
    drawn.current = { triangles: gl.info.render.triangles, calls: gl.info.render.calls, points: gl.info.render.points };
    const now = performance.now();
    if (last.current !== null) {
      times.current.push(now - last.current);
      if (times.current.length > KEPT_FRAME_TIMES) times.current.shift();
    }
    last.current = now;
    frames.current++;
  }, AFTER_RENDER_PRIORITY);
  return null;
}
