"use client";

import { useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import type { AtmosphereUniforms } from "../../art/atmosphere";
import { BUTTERFLY_KINDS, Butterflies, makeButterflyDay, type ButterflySpot } from "../../art/butterflies";
import { songbirdOf, type Songbird } from "../../birds/bird";
import { birdPose } from "../../birds/motion";
import { PLANT_CHUNK } from "../../engine/life";
import { birdsAbout, butterfliesAbout, butterfliesIn, coatSeason, perchesIn, songbirdsIn, type Perch } from "../../engine/wildlife";
import { remembered, type World } from "../../engine/world";
import { birdAt, flightProgress, stepBird, BIRD, type BirdState } from "../../gameplay/birds";
import { RUN_SPEED } from "../../input/walk-controls";
import { BirdBody, type BirdHandle } from "../birds/bird-body";
import { PerchTwigs } from "../birds/perch-twigs";
import type { ValleyClock } from "./clock";
import type { Walker } from "./walker";
import type { SceneWeather } from "./world-weather";

/*
 * The life that makes the forest alive, round Elliott: the songbirds of the
 * plant chunks near them, each stepped by its rules among its chunk's
 * perches and drawn on the one winged body, quieter in the night and the
 * rain; and the butterflies over the flowers, on the wing on warm, bright
 * summer days. Both are streamed in by chunk from the world's seed as
 * Elliott walks, and kept a while.
 */

/** How many plant chunks round Elliott's own hold live birds and butterflies, either way. */
const CHUNKS = 1;
/** Songbirds are drawn this much larger than life, as the small forage is, so they read from a few steps off. */
export const BIRD_DRAWN = 1.7;

/** One songbird, live. */
export interface LiveBird {
  key: string;
  species: Songbird;
  state: BirdState;
  /** The perches of its chunk, which it keeps to. */
  perches: readonly Perch[];
}

/** What the scene keeps of the forest's small life, shared with the probe. */
export interface Wildlife {
  birds: LiveBird[];
  butterflies: ButterflySpot[];
  /** How busy the birds are, and the share of butterflies on the wing, now. */
  about: { birds: number; butterflies: number };
}

export function makeWildlife(): Wildlife {
  return { birds: [], butterflies: [], about: { birds: 0, butterflies: 0 } };
}

function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function OneBird({ bird, atmosphere, register }: { bird: LiveBird; atmosphere: AtmosphereUniforms; register: (key: string, handle: BirdHandle | null) => void }) {
  return <BirdBody ref={(handle) => register(bird.key, handle)} species={bird.species} atmosphere={atmosphere} />;
}

export function WorldWildlife({ world, clock, walker, weather, atmosphere, wildlife }: { world: World; clock: ValleyClock; walker: Walker; weather: SceneWeather; atmosphere: AtmosphereUniforms; wildlife: Wildlife }) {
  const chunks = useMemo(
    () =>
      remembered(256, (key) => {
        const [cx, cz] = key.split(",").map(Number);
        const perches = perchesIn(world, cx, cz);
        return { perches, birds: songbirdsIn(world, cx, cz, perches), butterflies: butterfliesIn(world, cx, cz) };
      }),
    [world],
  );
  const [live, setLive] = useState<{ birds: LiveBird[]; butterflies: ButterflySpot[]; perches: Perch[] }>({ birds: [], butterflies: [], perches: [] });
  const handles = useRef(new Map<string, BirdHandle>());
  const streamed = useRef<string>("");
  const day = useMemo(() => makeButterflyDay(), []);
  const last = useRef<{ x: number; z: number; motion: number } | null>(null);

  useFrame(() => {
    // Streamed by chunk as Elliott walks: a bird that was live stays as it was.
    const cx = Math.floor(walker.x / PLANT_CHUNK);
    const cz = Math.floor(walker.z / PLANT_CHUNK);
    const winter = coatSeason(clock.date.realDayOfYear).winter;
    const key = `${cx},${cz},${winter > 0.5 ? "w" : "s"}`;
    if (key !== streamed.current) {
      streamed.current = key;
      const kept = new Map(wildlife.birds.map((b) => [b.key, b]));
      const birds: LiveBird[] = [];
      const butterflies: ButterflySpot[] = [];
      const perches: Perch[] = [];
      for (let z = cz - CHUNKS; z <= cz + CHUNKS; z++) {
        for (let x = cx - CHUNKS; x <= cx + CHUNKS; x++) {
          const chunk = chunks(`${x},${z}`);
          perches.push(...chunk.perches);
          for (const b of chunk.birds) {
            const species = songbirdOf(b.seed, winter);
            const was = kept.get(b.seed);
            birds.push(was && was.species === species ? was : { key: b.seed, species, state: birdAt(chunk.perches, b.perch, hashSeed(b.seed)), perches: chunk.perches });
          }
          // Two to a patch of flowers, each of a kind of its own.
          for (const f of chunk.butterflies) {
            for (const n of [0, 1]) {
              const h = hashSeed(`${f.seed}/${n}`);
              butterflies.push({ x: f.x, y: f.y, z: f.z, seed: (h % 1000) / 1000, kind: (h >>> 10) % BUTTERFLY_KINDS.length });
            }
          }
        }
      }
      wildlife.birds = birds;
      wildlife.butterflies = butterflies;
      setLive({ birds, butterflies, perches });
    }

    const now = weather.weather;
    const sun = clock.sky.sun.elevation;
    wildlife.about = {
      birds: birdsAbout(sun, now.precipitation),
      butterflies: butterfliesAbout(clock.date.realDayOfYear, sun, now.temperature, now.precipitation, now.cloudCover),
    };
    day.uAbout.value = wildlife.about.butterflies;

    const was = last.current;
    const seconds = was ? Math.max(0, clock.motion - was.motion) : 0;
    const pace = was && seconds > 0 ? Math.hypot(walker.x - was.x, walker.z - was.z) / seconds : 0;
    last.current = { x: walker.x, z: walker.z, motion: clock.motion };
    const aloft = walker.air !== undefined && walker.air.mode !== "ground";
    const elliott = { x: walker.x, z: walker.z, hurried: aloft || pace > RUN_SPEED * 0.7 };
    for (const bird of wildlife.birds) {
      stepBird(bird.state, bird.perches, elliott, wildlife.about.birds, clock.motion);
      const handle = handles.current.get(bird.key);
      const group = handle?.group;
      if (!handle || !group) continue;
      const { state } = bird;
      group.position.set(state.x, state.y, state.z);
      group.rotation.y = state.heading;
      group.scale.setScalar(BIRD_DRAWN);
      const hop = state.hop ? Math.min(1, (clock.motion - state.hop.start) / BIRD.hop.seconds) : null;
      handle.pose(birdPose({ mode: state.mode, time: clock.motion, seed: state.seed, flight: flightProgress(state, clock.motion), hop, about: wildlife.about.birds }));
    }
  });

  const register = useMemo(
    () => (key: string, handle: BirdHandle | null) => {
      if (handle) handles.current.set(key, handle);
      else handles.current.delete(key);
    },
    [],
  );

  return (
    <>
      {live.birds.map((bird) => (
        <OneBird key={bird.key} bird={bird} atmosphere={atmosphere} register={register} />
      ))}
      <Butterflies spots={live.butterflies} atmosphere={atmosphere} day={day} />
      <PerchTwigs perches={live.perches} atmosphere={atmosphere} />
    </>
  );
}
