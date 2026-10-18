"use client";

import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useFrame } from "@react-three/fiber";
import { Vector3 } from "three";
import { createRng, uniform } from "@/shared/lib/seeded-random";
import type { World } from "../../engine/world";
import { charmStrength } from "../../gameplay/brewing";
import { CHARMS, type Charm } from "../../gameplay/brews";
import type { AtmosphereUniforms } from "../../art/atmosphere";
import type { BrewPalette } from "../../art/brew-looks";
import { BLOOM_KINDS, CampBlooms, CharmPost, HushMotes, type BloomSpot } from "../../art/charm-effects";
import { Fireflies } from "../../art/fireflies";
import type { Palette } from "../../art/palette";
import type { SkyUniforms } from "../../art/sky/sky";
import type { CampSite } from "../../gameplay/camp";
import { pitchedSite, subscribeCamping } from "./camping";
import type { ValleyClock } from "./clock";
import type { Hearth } from "./hearth";
import type { Walker } from "./walker";
import type { SceneWeather } from "./world-weather";

/*
 * The charms at work, in the world: how strongly each works now, from the
 * satchel and the calendar's day, and what it brings about. The garland
 * charm's flowers open round camp; the lantern charm's fireflies gather
 * over camp tonight (out only as the light goes, as every firefly is); the
 * hush charm's motes drift about Elliott's feet; the mist-parting charm
 * clears the air round them through the scene's weather. Every charm at
 * work hangs from the post by the fire. A charm not at work draws nothing
 * (the fireflies aren't even mounted).
 */

/** After the clocks move on, before the weather is worked out, so the clearing is this frame's. */
export const CHARMS_PRIORITY = -5.5;

/** Where round camp the flowers open: between the fire's ring and the edge of the clearing, in metres. */
const BLOOM_RING = { inner: 2.9, outer: 6.8 } as const;
/** Camp's own things the flowers keep off: the two seats, the bedroll and blanket, as headings from the fire and how far they reach out. */
const CAMP_THINGS = [
  { angle: 0.4, from: 1.4, to: 3.4 },
  { angle: 2.6, from: 1.5, to: 3.3 },
  { angle: 4.15, from: 2.4, to: 4.6 },
] as const;
/** Where the charm post stands from the fire, in metres, and the heading it is turned to. */
const POST = { x: 1.05, z: -1.25, turn: 0.7 } as const;

function bloomSpots(world: World, camp: CampSite): BloomSpot[] {
  const rng = createRng(`${world.seed}/blooms`);
  const spots: BloomSpot[] = [];
  const clusters = 18;
  for (let c = 0; c < clusters; c++) {
    const angle = (c / clusters) * Math.PI * 2 + uniform(rng, -0.15, 0.15);
    const out = uniform(rng, BLOOM_RING.inner + 0.5, BLOOM_RING.outer - 0.5);
    const kind = BLOOM_KINDS[c % BLOOM_KINDS.length];
    for (let f = 0; f < 14; f++) {
      const a = angle + uniform(rng, -0.25, 0.25);
      const r = out + uniform(rng, -0.9, 0.9);
      const turn = rng.next() * Math.PI * 2;
      const size = uniform(rng, 0.8, 1.2);
      // Now and then one of another colour in among them.
      const mixed = rng.next() < 0.2 ? BLOOM_KINDS[Math.floor(rng.next() * BLOOM_KINDS.length)] : kind;
      if (r < BLOOM_RING.inner) continue;
      const inTheWay = CAMP_THINGS.some((t) => Math.abs(Math.atan2(Math.sin(a - t.angle - camp.turn), Math.cos(a - t.angle - camp.turn))) < 0.45 && r > t.from && r < t.to);
      if (inTheWay) continue;
      const x = camp.x + Math.cos(a) * r;
      const z = camp.z + Math.sin(a) * r;
      spots.push({ x, y: world.heightAt(x, z), z, turn, size, kind: mixed, late: (r - BLOOM_RING.inner) / (BLOOM_RING.outer - BLOOM_RING.inner) });
    }
  }
  return spots;
}

function fireflySpots(world: World, camp: CampSite): Float32Array {
  const rng = createRng(`${world.seed}/lantern`);
  const count = 200;
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const angle = rng.next() * Math.PI * 2;
    const r = uniform(rng, 1.3, 5.5);
    const x = camp.x + Math.cos(angle) * r;
    const z = camp.z + Math.sin(angle) * r;
    out.set([x, world.heightAt(x, z) + uniform(rng, 0.4, 2.2), z], i * 3);
  }
  return out;
}

/** How strongly each charm works this frame, and the clearing the weather takes from it. */
function readCharms(hearth: Hearth, clock: ValleyClock, weather: SceneWeather, strengths: Record<Charm, number>): void {
  for (const charm of CHARMS) strengths[charm] = charmStrength(hearth.shown.satchel, charm, clock.date.days);
  weather.clearing = strengths.clearing;
}

export function WorldCharms({
  hearth,
  world,
  clock,
  walker,
  weather,
  palette,
  brewPalette,
  atmosphere,
  sky,
}: {
  hearth: Hearth;
  world: World;
  clock: ValleyClock;
  walker: Walker;
  weather: SceneWeather;
  palette: Palette;
  brewPalette: BrewPalette;
  atmosphere: AtmosphereUniforms;
  sky: SkyUniforms;
}) {
  const subscribeCamp = useCallback((listener: () => void) => subscribeCamping(hearth.camping, listener), [hearth]);
  const camp = useSyncExternalStore(subscribeCamp, () => pitchedSite(hearth.camping));
  const blooms = useMemo(() => (camp ? bloomSpots(world, camp) : []), [world, camp]);
  const lantern = useMemo(() => (camp ? fireflySpots(world, camp) : new Float32Array(0)), [world, camp]);
  const strengths = useRef<Record<Charm, number>>({ bloom: 0, fireflies: 0, hush: 0, clearing: 0 });
  const feet = useMemo(() => new Vector3(), []);
  const post = useMemo(() => {
    if (!camp) return null;
    // The post's place turned with the camp: its things turn round the fire from +x towards +z.
    const c = Math.cos(camp.turn);
    const s = Math.sin(camp.turn);
    const x = camp.x + POST.x * c - POST.z * s;
    const z = camp.z + POST.x * s + POST.z * c;
    return { x, y: world.heightAt(x, z), z, turn: POST.turn - camp.turn };
  }, [world, camp]);

  // The fireflies are mounted only while the lantern charm works; the rest draw nothing while their charm is idle.
  const [lanternTonight, setLanternTonight] = useState(false);
  const lanternOn = useRef(false);

  useFrame(() => {
    readCharms(hearth, clock, weather, strengths.current);
    const on = strengths.current.fireflies > 0;
    if (on !== lanternOn.current) {
      lanternOn.current = on;
      setLanternTonight(on);
    }
  }, CHARMS_PRIORITY);

  return (
    <>
      <CampBlooms key={camp ? `${camp.x},${camp.z}` : "carried"} spots={blooms} strength={() => strengths.current.bloom} palette={brewPalette} atmosphere={atmosphere} />
      {post && <CharmPost at={post} turn={post.turn} strengths={() => strengths.current} palette={brewPalette} atmosphere={atmosphere} />}
      <HushMotes follow={() => feet.set(walker.x, walker.air?.y ?? world.heightAt(walker.x, walker.z), walker.z)} strength={() => strengths.current.hush} palette={brewPalette} atmosphere={atmosphere} />
      {lanternTonight && camp && <Fireflies spots={lantern} palette={palette} atmosphere={atmosphere} sky={sky} />}
    </>
  );
}
