"use client";

import { useCallback, useMemo, useRef, useState, type CSSProperties } from "react";
import { GpuCanvas } from "../gpu-canvas";
import { useWalkInput } from "../../input/use-walk-input";
import { createWorld } from "../../engine/world";
import { parseWeather, type WeatherKind } from "../../engine/weather";
import { makeAtmosphere } from "../../art/atmosphere";
import { Daylight, type Air, type Focus } from "../../art/light/daylight";
import { Fireflies } from "../../art/fireflies";
import { readDishPalette } from "../../art/dish-looks";
import { readBrewPalette } from "../../art/brew-looks";
import { readCluePalette } from "../../art/clue-shapes";
import { readFolkPalette } from "../../art/folk";
import { readForagePalette } from "../../art/forage-shapes";
import { readPalette } from "../../art/palette";
import { FrameCosts } from "../../art/frame";
import { makeSkyUniforms, Sky } from "../../art/sky/sky";
import { QUALITY } from "../../quality";
import { parseDate } from "../../engine/calendar";
import { makeClock } from "./clock";
import { DebugPanel } from "./debug-panel";
import { FlyOverlay } from "./fly-overlay";
import { FeatureRenderer, type FeatureRendererRef } from "./feature-renderer";
import { useFrameStats } from "./frame-stats";
import { FIRST_ORBIT } from "./follow-camera";
import { ForageOverlay } from "./forage-overlay";
import { createForaging } from "./foraging";
import { CompanionOverlay } from "./companion-overlay";
import { createCompanionship } from "./companionship";
import { FetchOverlay } from "./fetch-overlay";
import { createFetching } from "./fetching";
import { JawStick, useStickArt, WorldFetch } from "./world-fetch";
import { CookingOverlay, useCookingOn } from "./cooking-overlay";
import { besideCamp } from "../../gameplay/camp";
import { CampOverlay } from "./camp-overlay";
import { createCamping } from "./camping";
import { createHearth } from "./hearth";
import { WorldCamp } from "./world-camp";
import { Interactions } from "./interactions";
import { ConversationOverlay, useTalkingOn } from "./conversation-overlay";
import { JournalOverlay } from "./journal-overlay";
import { createMysteries } from "./mysteries";
import { createCompanionClues } from "./companion-clues";
import { MysteryOverlay, useExaminingOn } from "./mystery-overlay";
import { createPeople } from "./people";
import { WorldClues } from "./world-clues";
import { WorldPeople } from "./world-people";
import { WorldAnimals } from "./world-animals";
import { makeWildlife, WorldWildlife } from "./world-wildlife";
import { WalkerAndCamera, type Walker } from "./walker";
import { TouchStickView, WalkHints } from "./walk-hints";
import { WorldForage } from "./world-forage";
import { WorldHearth } from "./world-hearth";
import { WorldCharms } from "./world-charms";
import { WorldLand, type Streaming } from "./world-land";
import { WorldPlaces } from "./world-places";
import { WorldPlants } from "./world-plants";
import { WorldProbeHandle, type FreeCamera } from "./world-probe";
import { makeSceneWeather, WeatherTicker, WorldWeather } from "./world-weather";

/*
 * The endless world: generated from its seed as the camera goes, drawn, lit
 * by the turning day, and walked in first or third person from camp. `?seed=<text>`
 * opens another world, `?hour=<0-24>` holds the day at an hour, `?date=`
 * starts on a date (`summer-2`, a festival such as `litha`, or a day number), and
 * `?weather=` holds the weather at one kind (`clear`, `mist`, `rain`…; dev
 * switches for judging the light and the far land), ~ opens the debug panel with
 * the time on a slider, and the probe on window drives it for screenshots.
 */

export const DEFAULT_SEED = "first-valley";


interface Options {
  seed: string;
  hour: number | null;
  /** The whole game day to start on, or null for a new game's. */
  date: number | null;
  /** The weather held for a look, or null for the sky's own. */
  weather: WeatherKind | null;
}

function readOptions(search: string): Options {
  const params = new URLSearchParams(search);
  const hour = params.get("hour");
  const parsed = hour === null ? null : Number(hour);
  if (parsed !== null && !(parsed >= 0 && parsed <= 24)) throw new Error(`?hour must be between 0 and 24, not ${hour ?? ""}`);
  const date = params.get("date");
  return { seed: params.get("seed") ?? DEFAULT_SEED, hour: parsed, date: date === null ? null : parseDate(date), weather: parseWeather(params.get("weather")) };
}

const PROMPT_COLOURS = {
  "--prompt-body": "var(--color-hearthwood-valley-ui-shade)",
  "--prompt-ink": "var(--color-hearthwood-valley-ui-ink)",
} as CSSProperties;

export function WorldView() {
  const options = useMemo(() => readOptions(window.location.search), []);
  const world = useMemo(() => createWorld(options.seed), [options.seed]);
  const palette = useMemo(() => readPalette(), []);
  const foragePalette = useMemo(() => readForagePalette(), []);
  const dishPalette = useMemo(() => readDishPalette(), []);
  const brewPalette = useMemo(() => readBrewPalette(), []);
  const foraging = useMemo(() => createForaging(world), [world]);
  const camping = useMemo(() => createCamping(world), [world]);
  const hearth = useMemo(() => createHearth(camping, foraging), [camping, foraging]);
  const companionship = useMemo(() => createCompanionship(world, foraging, hearth), [world, foraging, hearth]);
  const people = useMemo(() => createPeople(world, foraging, hearth, companionship), [world, foraging, hearth, companionship]);
  const fetching = useMemo(() => createFetching(world, companionship), [world, companionship]);
  const folkPalette = useMemo(() => readFolkPalette(), []);
  const mysteries = useMemo(() => createMysteries(world, people), [world, people]);
  const companionClues = useMemo(() => createCompanionClues(mysteries, companionship), [mysteries, companionship]);
  const cluePalette = useMemo(() => readCluePalette(), []);
  const shared = useMemo(() => {
    // A walk starts beside camp, wherever it was left: by its fire, or where it was packed up.
    const camp = camping.shown.camp.site;
    const start = besideCamp(camp);
    const walker: Walker = {
      x: start.x,
      z: start.z,
      heading: start.heading,
      stride: 0,
      orbit: { ...FIRST_ORBIT, yaw: start.heading },
      lookPitch: 0,
      view: "walk",
    };
    const focus: Focus = { x: walker.x, y: camp.y, z: walker.z };
    const streaming: Streaming = { land: false, plants: false, places: false };
    const air: Air = { thickness: 1 };
    const freeCamera: { at: FreeCamera | null } = { at: null };
    const weather = makeSceneWeather(options.weather);
    const clock = makeClock(options.hour, options.date);
    return { atmosphere: makeAtmosphere(), sky: makeSkyUniforms(palette), clock, walker, focus, streaming, air, freeCamera, weather, debug: { clock, costs: new FrameCosts(), weather } };
  }, [camping, palette, options.hour, options.date, options.weather]);
  const surface = useRef<HTMLDivElement>(null);
  const featureRendererRef = useRef<FeatureRendererRef>(null);
  const input = useWalkInput(surface);
  const [fireflies, setFireflies] = useState<Float32Array>(() => new Float32Array(0));
  useFrameStats();
  const cooking = useCookingOn(hearth);
  const talking = useTalkingOn(people);
  const examining = useExaminingOn(mysteries);
  const { atmosphere, sky, clock, walker, focus, streaming, air, freeCamera, weather, debug } = shared;

  // Draws the frame every frame through the raw WebGPU renderer, driven by
  // FeatureRenderer (the frame's pipeline), without react-three-fiber.
  useEffect(() => {
    let raf: ReturnType<typeof requestAnimationFrame> | null = null;
    let last = performance.now();
    const loop = (now: number) => {
      const delta = Math.min((now - last) / 1000, 0.1);
      last = now;
      featureRendererRef.current?.render(
        { day: clock, atmosphere, sky, weather, delta, player: focus },
        debug.costs,
      );
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [clock, atmosphere, sky, weather, focus, debug.costs]);

  const wildlife = useMemo(() => makeWildlife(), []);
  const stickArt = useStickArt(palette, atmosphere);
  const jawStick = useCallback((key: string) => <JawStick fetching={fetching} dogKey={key} art={stickArt} />, [fetching, stickArt]);

  return (
    <div ref={surface} data-testid="hearthwood-world" className="relative h-dvh w-full touch-none overflow-hidden select-none" style={PROMPT_COLOURS}>
      <GpuCanvas
        dpr={[1, QUALITY.maxPixelRatio]}
        camera={{ fov: 55, near: 0.2, far: QUALITY.viewDistance * 1.2 }}
      >
        <WeatherTicker world={world} clock={clock} now={weather} air={air} />
        <Daylight day={clock} palette={palette} atmosphere={atmosphere} sky={sky} focus={focus} air={air} />
        <Sky atmosphere={atmosphere} sky={sky} />
        <FeatureRenderer />
        <WorldWeather now={weather} atmosphere={atmosphere} />
        <WorldLand world={world} camping={camping} palette={palette} atmosphere={atmosphere} sky={sky} quality={QUALITY} streaming={streaming} />
        <WorldPlants world={world} camping={camping} palette={palette} atmosphere={atmosphere} quality={QUALITY} streaming={streaming} onFireflies={setFireflies} />
        <WorldPlaces world={world} palette={palette} atmosphere={atmosphere} sky={sky} streaming={streaming} />
        <WorldForage foraging={foraging} palette={foragePalette} atmosphere={atmosphere} clock={clock} walker={walker} input={input.state} rival={() => Math.min(companionship.candidate?.score ?? Infinity, hearth.candidate ?? Infinity, people.candidate?.score ?? Infinity, mysteries.candidate?.score ?? Infinity, fetching.candidate?.score ?? Infinity)} />
        <WorldAnimals
          companionship={companionship}
          world={world}
          clock={clock}
          walker={walker}
          input={input.state}
          foraging={foraging}
          atmosphere={atmosphere}
          rival={() => Math.min(people.candidate?.score ?? Infinity, mysteries.candidate?.score ?? Infinity)}
          held={jawStick}
          outbid={() => fetching.candidate !== null}
        />
        <WorldFetch fetching={fetching} foraging={foraging} walker={walker} input={input.state} art={stickArt} rival={() => Math.min(companionship.candidate?.score ?? Infinity, hearth.candidate ?? Infinity, people.candidate?.score ?? Infinity, mysteries.candidate?.score ?? Infinity)} />
        <WorldWildlife world={world} clock={clock} walker={walker} weather={weather} atmosphere={atmosphere} wildlife={wildlife} />
        <WorldCamp
          camping={camping}
          world={world}
          foraging={foraging}
          people={people}
          walker={walker}
          palette={palette}
          atmosphere={atmosphere}
          fire={clock}
          outbid={() => foraging.target !== null || companionship.candidate !== null || hearth.candidate !== null || people.candidate !== null || mysteries.candidate !== null || fetching.candidate !== null}
        />
        <WorldHearth hearth={hearth} foraging={foraging} companionship={companionship} walker={walker} input={input.state} clock={clock} palette={dishPalette} brewPalette={brewPalette} atmosphere={atmosphere} outbid={() => people.candidate !== null || mysteries.candidate !== null || fetching.candidate !== null} />
        <WorldCharms hearth={hearth} world={world} clock={clock} walker={walker} weather={weather} palette={palette} brewPalette={brewPalette} atmosphere={atmosphere} sky={sky} />
        <WorldPeople people={people} world={world} clock={clock} walker={walker} input={input.state} foraging={foraging} companionship={companionship} hearth={hearth} palette={folkPalette} atmosphere={atmosphere} outbid={() => mysteries.candidate !== null || fetching.candidate !== null} />
        <WorldClues mysteries={mysteries} companionClues={companionClues} people={people} clock={clock} walker={walker} input={input.state} foraging={foraging} companionship={companionship} hearth={hearth} palette={cluePalette} atmosphere={atmosphere} outbid={() => fetching.candidate !== null} />
        <Fireflies spots={fireflies} palette={palette} atmosphere={atmosphere} sky={sky} />
        <WalkerAndCamera world={world} camping={camping} input={input.state} walker={walker} focus={focus} palette={palette} atmosphere={atmosphere} />
        <WorldProbeHandle world={world} palette={palette} clock={clock} walker={walker} streaming={streaming} freeCamera={freeCamera} weather={weather} foraging={foraging} companionship={companionship} hearth={hearth} wildlife={wildlife} people={people} mysteries={mysteries} companionClues={companionClues} fetching={fetching} costs={debug.costs} setPointOfView={input.setPointOfView} />
      </GpuCanvas>
      {!cooking && !talking && !examining && !input.flying && <WalkHints input={input} />}
      {input.flying && <FlyOverlay speed={input.flySpeed} />}
      <ForageOverlay foraging={foraging} hearth={hearth} clock={clock} input={input.kind} />
      {!cooking && !talking && !examining && <CampOverlay camping={camping} input={input.kind} />}
      <CompanionOverlay companionship={companionship} input={input.kind} />
      <CookingOverlay hearth={hearth} foraging={foraging} input={input.kind} hinted={() => people.shown.memory.hints} hintedBrews={() => people.shown.memory.brewHints} />
      <ConversationOverlay people={people} input={input.kind} />
      <MysteryOverlay mysteries={mysteries} people={people} input={input.kind} />
      <JournalOverlay people={people} mysteries={mysteries} input={input.kind} />
      {!cooking && !talking && <FetchOverlay fetching={fetching} input={input.kind} />}
      <Interactions foraging={foraging} companionship={companionship} hearth={hearth} people={people} mysteries={mysteries} fetching={fetching} clock={clock} surface={surface} flying={input.flying} />
      <TouchStickView stick={input.stick} />
      <DebugPanel context={{ ...debug, flight: { flying: input.flying, setFlying: input.setFlying } }} />
    </div>
  );
}
