"use client";

import { useContext, useEffect, useMemo, useRef } from "react";
import { type BufferGeometry, CylinderGeometry, Group, InstancedMesh, Object3D, SphereGeometry, type Vector3 } from "three";
import { Scene } from "three/webgpu";
import { SceneContext } from "../components/valley/feature-renderer";
import { createRng, uniform, type Rng } from "@/shared/lib/seeded-random";
import { brewOfCharm, type Charm } from "../gameplay/brews";
import type { AtmosphereUniforms } from "./atmosphere";
import { CHARM_GLOW, type BrewPalette } from "./brew-looks";
import { brewShape } from "./brews";
import { paint, type Piece } from "./painted";
import { cloud, type Cloud, glowMaterial, moteMaterial, MOTES } from "./effects";
import { thingMaterial } from "./things";

/*
 * What the charms bring about, drawn, deciding nothing: the flowers a
 * garland charm sets blooming round camp, opening one after another from
 * the fire outwards and closing again as it fades; the charm post by the
 * fire, a forked stick the charms at work hang from in their linen pouches,
 * each with a soft glow of its own colour; and the hush round Elliott, a
 * few pale motes drifting about their feet. The lantern charm's fireflies
 * are the fireflies' own. How strongly each works comes from the scene,
 * read each frame.
 */

/** The flowers that bloom: storybook blossoms in four colours, and the green of their leaves. */
export const BLOOM_KINDS = ["bloom-pink", "bloom-white", "bloom-violet", "bloom-yellow"] as const;
export type BloomKind = (typeof BLOOM_KINDS)[number];

export interface BloomSpot {
  x: number;
  y: number;
  z: number;
  turn: number;
  size: number;
  kind: BloomKind;
  /** How late it opens, 0 (first, near the fire) to 1 (last, furthest out). */
  late: number;
}

/** One flower at life size on the origin: a stem, two leaves, five petals round a golden heart, drawn a little larger than life. */
export function bloomShape(kind: BloomKind, p: BrewPalette, rng: Rng): BufferGeometry {
  const height = uniform(rng, 0.16, 0.24);
  const stem = new CylinderGeometry(0.004, 0.006, height, 5);
  stem.translate(0, height / 2, 0);
  const pieces: Piece[] = [{ geometry: stem, colour: p["bloom-leaf"] }];
  for (const side of [-1, 1]) {
    const leaf = new SphereGeometry(0.03, 7, 4);
    leaf.scale(1.5, 0.22, 0.6);
    leaf.translate(side * 0.04, height * 0.3, 0);
    leaf.rotateZ(side * -0.4);
    pieces.push({ geometry: leaf, colour: p["bloom-leaf"].clone().multiplyScalar(uniform(rng, 0.9, 1.08)), shading: 0.3 });
  }
  for (let k = 0; k < 5; k++) {
    const petal = new SphereGeometry(0.032, 7, 4);
    petal.scale(1, 0.3, 0.62);
    petal.translate(0.03, 0, 0);
    petal.rotateZ(0.35);
    petal.rotateY((k / 5) * Math.PI * 2);
    petal.translate(0, height, 0);
    pieces.push({ geometry: petal, colour: p[kind].clone().multiplyScalar(uniform(rng, 0.94, 1.04)), shading: 0.2 });
  }
  const heart = new SphereGeometry(0.015, 8, 5);
  heart.translate(0, height + 0.006, 0);
  pieces.push({ geometry: heart, colour: kind === "bloom-yellow" ? p.honey : p["bloom-yellow"] });
  return paint(pieces).scale(1.7, 1.7, 1.7);
}

const BLOOM_DESIGNS = 3;

/** The flowers a garland charm opens round camp, each opening in turn as `strength` (0 to 1) rises. */
export function CampBlooms({ spots, strength, palette, atmosphere }: { spots: readonly BloomSpot[]; strength: () => number; palette: BrewPalette; atmosphere: AtmosphereUniforms }) {
  const meshes = useMemo(() => {
    const material = thingMaterial(atmosphere);
    const rng = createRng("hearthwood/blooms");
    const out = BLOOM_KINDS.flatMap((kind) =>
      Array.from({ length: BLOOM_DESIGNS }, (_, design) => {
        const mine = spots.filter((s, i) => s.kind === kind && i % BLOOM_DESIGNS === design);
        const mesh = new InstancedMesh(bloomShape(kind, palette, rng), material, Math.max(1, mine.length));
        mesh.count = mine.length;
        mesh.castShadow = true;
        mesh.frustumCulled = false;
        return { mesh, spots: mine };
      }),
    );
    return { out };
  }, [spots, palette, atmosphere]);
  useEffect(
    () => () => {
      for (const { mesh } of meshes.out) mesh.geometry.dispose();
    },
    [meshes],
  );
  const dummy = useMemo(() => new Object3D(), []);
  const shown = useRef<{ strength: number; meshes: typeof meshes | null }>({ strength: NaN, meshes: null });
  const strengthRef = useRef(strength);
  strengthRef.current = strength;

  useEffect(() => {
    if (!scene) return;
    meshes.out.forEach(({ mesh }) => scene.add(mesh));

    let raf: ReturnType<typeof requestAnimationFrame> | null = null;
    const loop = () => {
      // The charm's strength moves over game days: the flowers are set again only once it has moved enough to show.
      const now = strengthRef.current();
      const was = shown.current;
      if (was.meshes === meshes && Math.abs(now - was.strength) < 0.002 && (now > 0) === was.strength > 0) {
        raf = requestAnimationFrame(loop);
        return;
      }
      shown.current = { strength: now, meshes };
      openBlooms(meshes.out, now, dummy);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
      meshes.out.forEach(({ mesh }) => scene.remove(mesh));
    };
  }, [scene, meshes, dummy]);

  return null;
}

/** The flowers this frame: each open as far as its turn has come. */
function openBlooms(designs: readonly { mesh: InstancedMesh; spots: readonly BloomSpot[] }[], strength: number, dummy: Object3D): void {
  for (const { mesh, spots } of designs) {
    spots.forEach((spot, i) => {
      // Each opens in its turn, from the fire outwards, and closes in the same order.
      const open = Math.min(1, Math.max(0, (strength - spot.late * 0.6) / 0.4));
      const grown = Math.max(0.001, open * open * (3 - 2 * open)) * spot.size;
      dummy.position.set(spot.x, spot.y - 0.01, spot.z);
      dummy.rotation.set(0, spot.turn, 0);
      dummy.scale.setScalar(grown);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.visible = strength > 0;
  }
}

/** Where the charms hang along the post's crossbar, in the post's own frame. */
const HOOKS: Record<Charm, number> = { bloom: -0.21, fireflies: -0.07, hush: 0.07, clearing: 0.21 };
const POST = { height: 1.15, bar: 0.56 } as const;
/** How much larger than life a hanging charm is drawn, and how far below the bar it hangs. */
const HANGING_LARGER = 1.8;
const DROP = 0.32;

/** A forked hazel stick pushed into the ground, with a crossbar: what the charms at work hang from. */
export function charmPostShape(p: BrewPalette): BufferGeometry {
  const post = new CylinderGeometry(0.018, 0.026, POST.height, 6);
  post.translate(0, POST.height / 2, 0);
  const bar = new CylinderGeometry(0.012, 0.012, POST.bar, 5);
  bar.rotateZ(Math.PI / 2);
  bar.translate(0, POST.height - 0.06, 0);
  const fork = new CylinderGeometry(0.008, 0.012, 0.16, 5);
  fork.rotateZ(-0.5);
  fork.translate(0.04, POST.height + 0.05, 0);
  return paint([
    { geometry: post, colour: p.stick, shading: 0.3 },
    { geometry: bar, colour: p.stick, shading: 0.2 },
    { geometry: fork, colour: p.stick, shading: 0.2 },
  ]);
}

/** The charms on the post this frame: those at work shown, swaying a little, glowing as strongly as they work. */
function hangCharms(charms: readonly { charm: Charm; glow: Cloud }[], groups: Partial<Record<Charm, Group | null>>, strengths: Record<Charm, number>, t: number): void {
  for (const c of charms) {
    const group = groups[c.charm];
    const strength = strengths[c.charm];
    if (group) {
      group.visible = strength > 0;
      group.rotation.z = Math.sin(t * 1.3 + HOOKS[c.charm] * 9) * 0.08;
    }
    c.glow.userData.strength = 0.5 * strength;
  }
}

/** The charm post by the fire, with every charm at work hanging from it in its pouch, glowing its own colour as strongly as it works. */
export function CharmPost({ at, turn, strengths, palette, atmosphere }: { at: { x: number; y: number; z: number }; turn: number; strengths: () => Record<Charm, number>; palette: BrewPalette; atmosphere: AtmosphereUniforms }) {
  const scene = useContext(SceneContext);
  const swing = useRef<Partial<Record<Charm, Group | null>>>({});
  const strengthsRef = useRef(strengths);
  strengthsRef.current = strengths;
  const assets = useMemo(() => {
    const material = thingMaterial(atmosphere);
    const charms = (Object.keys(HOOKS) as Charm[]).map((charm, i) => {
      const glow = cloud(1, glowMaterial(atmosphere));
      glow.position.set(0, -0.22, 0);
      glow.scale.setScalar(0.5);
      glow.renderOrder = 6;
        glow.userData = { glow: palette[CHARM_GLOW[charm]].clone(), strength: 0, pulse: 0.15, phase: i * 0.27 };
      return { charm, pouch: brewShape(brewOfCharm(charm), palette), glow };
    });
    // The red thread each pouch hangs by, from the bar down to its tie.
    const thread = new CylinderGeometry(0.003, 0.003, DROP - 0.09 * HANGING_LARGER, 4);
    thread.translate(0, -(DROP - 0.09 * HANGING_LARGER) / 2, 0);
    return { material, post: charmPostShape(palette), thread: paint([{ geometry: thread, colour: palette.thread }]), charms };
  }, [palette, atmosphere]);
  useEffect(
    () => () => {
      assets.post.dispose();
      assets.thread.dispose();
      for (const c of assets.charms) c.pouch.dispose();
    },
    [assets],
  );

  useEffect(() => {
    if (!scene) return;
    const g = new Group();
    g.position.set(at.x, at.y, at.z);
    g.rotation.set(0, turn, 0);

    const postMesh = new Mesh(assets.post, assets.material);
    postMesh.castShadow = true;
    g.add(postMesh);

    assets.charms.forEach((c) => {
      const subgroup = new Group();
      subgroup.position.set(HOOKS[c.charm], POST.height - 0.06, 0);
      subgroup.visible = false;
      swing.current[c.charm] = subgroup;

      const threadMesh = new Mesh(assets.thread, assets.material);
      subgroup.add(threadMesh);

      const pouchMesh = new Mesh(c.pouch, assets.material);
      pouchMesh.position.set(0, -DROP, 0);
      pouchMesh.scale.setScalar(HANGING_LARGER);
      pouchMesh.castShadow = true;
      subgroup.add(pouchMesh);

      subgroup.add(c.glow);
      g.add(subgroup);
    });

    scene.add(g);

    let raf: ReturnType<typeof requestAnimationFrame> | null = null;
    const loop = () => {
      hangCharms(assets.charms, swing.current, strengthsRef.current(), atmosphere.uHwTime.value);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
      scene.remove(g);
    };
  }, [scene, at, turn, assets]);

  return null;
}

/** The hush this frame: as bright as the charm works, about Elliott's feet. */
function driftHush(motes: Cloud, group: Group | null, strength: number, at: Vector3): void {
  motes.userData.strength = strength;
  if (group) {
    group.visible = strength > 0;
    group.position.copy(at);
  }
}

/** The hush round Elliott: pale motes drifting about their feet as strongly as the charm works. Its group is moved to Elliott by the scene. */
export function HushMotes({ follow, strength, palette, atmosphere }: { follow: () => Vector3; strength: () => number; palette: BrewPalette; atmosphere: AtmosphereUniforms }) {
  const scene = useContext(SceneContext);
  const group = useRef<Group | null>(null);
  const followRef = useRef(follow);
  followRef.current = follow;
  const strengthRef = useRef(strength);
  strengthRef.current = strength;
  const motes = useMemo(() => {
    const made = cloud(MOTES, moteMaterial(atmosphere));
    made.renderOrder = 4;
    made.userData = { tint: palette.hush.clone(), strength: 0 };
    return made;
  }, [palette, atmosphere]);

  useEffect(() => {
    if (!scene) return;
    const g = new Group();
    g.visible = false;
    g.add(motes);
    scene.add(g);
    group.current = g;

    let raf: ReturnType<typeof requestAnimationFrame> | null = null;
    const loop = () => {
      driftHush(motes, group.current, strengthRef.current(), followRef.current());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
      scene.remove(g);
      group.current = null;
    };
  }, [scene, motes]);

  return null;
}
