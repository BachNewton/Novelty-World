"use client";

import { useEffect, useMemo } from "react";
import { BoxGeometry, type BufferGeometry, CylinderGeometry, IcosahedronGeometry, MeshLambertMaterial } from "three";
import { createRng, uniform, type Rng } from "@/shared/lib/seeded-random";
import { sample } from "../../world/grid";
import type { Place } from "../../world/places";
import type { Valley } from "../../world/valley";
import { breatheAtmosphere, type AtmosphereUniforms } from "./atmosphere";
import { lumpy, paint, type Piece } from "./painted";
import type { Palette } from "./palette";

/*
 * The places worth walking to, and the stepping stones where trails ford the
 * stream: a ring of old standing stones, mossy on top, one of them fallen; a
 * cairn and a log bench on the hilltop, facing out over the valley; and a
 * scatter of wet boulders round the waterfall's pool. All of it one merged,
 * vertex-coloured mesh.
 */

function slab(rng: Rng, width: number, height: number, depth: number): BufferGeometry {
  const g = new BoxGeometry(width, height, depth, 2, 3, 1).toNonIndexed();
  const p = g.getAttribute("position");
  const jitter = new Map<string, [number, number, number]>();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let j = jitter.get(key);
    if (!j) {
      const top = p.getY(i) > height * 0.3 ? 0.7 : 1;
      j = [1 + (rng.next() - 0.5) * 0.25 * top, 1 + (rng.next() - 0.5) * 0.08, 1 + (rng.next() - 0.5) * 0.25 * top];
      jitter.set(key, j);
    }
    p.setXYZ(i, p.getX(i) * j[0], p.getY(i) * j[1], p.getZ(i) * j[2]);
  }
  g.computeVertexNormals();
  g.translate(0, height / 2, 0);
  return g;
}

function boulder(rng: Rng, radius: number): BufferGeometry {
  const g = lumpy(new IcosahedronGeometry(radius, 0), () => rng.next(), 0.8, 1.15);
  g.scale(1, 0.7, 1);
  g.computeVertexNormals();
  return g;
}

function at(valley: Valley, g: BufferGeometry, x: number, z: number, sink = 0.1): BufferGeometry {
  g.translate(x, sample(valley.heights, x, z) - sink, z);
  return g;
}

function stoneCircle(valley: Valley, place: Place, palette: Palette, rng: Rng): Piece[] {
  const pieces: Piece[] = [];
  const stones = 9;
  const fallen = Math.floor(rng.next() * stones);
  for (let s = 0; s < stones; s++) {
    const angle = (s / stones) * Math.PI * 2 + rng.next() * 0.15;
    const x = place.x + Math.cos(angle) * 6.5;
    const z = place.z + Math.sin(angle) * 6.5;
    const height = uniform(rng, 2.1, 3.1);
    const stone = slab(rng, uniform(rng, 0.9, 1.3), height, uniform(rng, 0.45, 0.65));
    if (s === fallen) {
      stone.rotateX(Math.PI / 2 - 0.08);
      stone.translate(0, 0.3, 0);
    }
    stone.rotateZ((rng.next() - 0.5) * 0.12);
    stone.rotateY(-angle + Math.PI / 2);
    pieces.push({ geometry: at(valley, stone, x, z, 0.25), colour: palette.things.stone, shading: 0.5 });
    if (s !== fallen) {
      const moss = boulder(rng, 0.42);
      moss.scale(1.3, 0.35, 0.9);
      moss.rotateY(-angle + Math.PI / 2);
      moss.translate(0, height - 0.08, 0);
      pieces.push({ geometry: at(valley, moss, x, z, 0.25), colour: palette.things.moss });
    }
  }
  const altar = slab(rng, 1.6, 0.55, 1.1);
  altar.rotateY(rng.next() * Math.PI);
  pieces.push({ geometry: at(valley, altar, place.x, place.z, 0.1), colour: palette.things.stone, shading: 0.4 });
  return pieces;
}

function hilltop(valley: Valley, place: Place, palette: Palette, rng: Rng): Piece[] {
  const pieces: Piece[] = [];
  let height = 0;
  for (let s = 0; s < 5; s++) {
    const radius = 0.42 - s * 0.06;
    const stone = boulder(rng, radius);
    stone.translate((rng.next() - 0.5) * 0.12, height + radius * 0.5, (rng.next() - 0.5) * 0.12);
    height += radius * 0.85;
    pieces.push({ geometry: at(valley, stone, place.x, place.z, 0.1), colour: palette.things.rock, shading: 0.3 });
  }
  const outward = Math.atan2(place.z, place.x);
  const bx = place.x + Math.cos(outward) * 2.6;
  const bz = place.z + Math.sin(outward) * 2.6;
  const bench = new CylinderGeometry(0.2, 0.22, 2, 9);
  bench.rotateZ(Math.PI / 2);
  bench.rotateY(-outward + Math.PI / 2);
  bench.translate(0, 0.2, 0);
  pieces.push({ geometry: at(valley, bench, bx, bz, 0.05), colour: palette.things.log, shading: 0.4 });
  return pieces;
}

function waterfall(valley: Valley, palette: Palette, rng: Rng): Piece[] {
  const pieces: Piece[] = [];
  const { points, waterfall: falls } = valley.stream;
  for (let b = 0; b < 9; b++) {
    const p = points[Math.min(points.length - 1, falls.index + 1 + Math.floor(rng.next() * 6))];
    const angle = rng.next() * Math.PI * 2;
    const out = p.halfWidth + uniform(rng, 0.8, 3.2);
    const x = p.x + Math.cos(angle) * out;
    const z = p.z + Math.sin(angle) * out;
    pieces.push({ geometry: at(valley, boulder(rng, uniform(rng, 0.5, 1.2)), x, z, 0.2), colour: palette.things.rock, shading: 0.4 });
  }
  return pieces;
}

function steppingStones(valley: Valley, palette: Palette, rng: Rng): Piece[] {
  const pieces: Piece[] = [];
  for (const crossing of valley.crossings) {
    const dx = Math.cos(crossing.heading);
    const dz = Math.sin(crossing.heading);
    for (let s = -2; s <= 2; s++) {
      const x = crossing.x + dx * s * 0.8 + (rng.next() - 0.5) * 0.2;
      const z = crossing.z + dz * s * 0.8 + (rng.next() - 0.5) * 0.2;
      const stone = boulder(rng, uniform(rng, 0.32, 0.42));
      stone.scale(1, 0.55, 1);
      const surface = valley.stream.points.reduce((best, p) => (Math.hypot(p.x - x, p.z - z) < Math.hypot(best.x - x, best.z - z) ? p : best)).surface;
      stone.translate(x, Math.max(surface + 0.06, sample(valley.heights, x, z)), z);
      pieces.push({ geometry: stone, colour: palette.things.stone, shading: 0.4 });
    }
  }
  return pieces;
}

export function Places({ valley, palette, atmosphere }: { valley: Valley; palette: Palette; atmosphere: AtmosphereUniforms }) {
  const assets = useMemo(() => {
    const rng = createRng(`${valley.seed}/place-things`);
    const pieces = [
      ...valley.places.flatMap((place) => {
        switch (place.kind) {
          case "stone-circle":
            return stoneCircle(valley, place, palette, rng);
          case "hilltop":
            return hilltop(valley, place, palette, rng);
          case "waterfall":
            return waterfall(valley, palette, rng);
        }
      }),
      ...steppingStones(valley, palette, rng),
    ];
    return { geometry: paint(pieces), material: breatheAtmosphere(new MeshLambertMaterial({ vertexColors: true }), atmosphere) };
  }, [valley, palette, atmosphere]);
  useEffect(
    () => () => {
      assets.geometry.dispose();
      assets.material.dispose();
    },
    [assets],
  );
  return <mesh geometry={assets.geometry} material={assets.material} castShadow receiveShadow />;
}
