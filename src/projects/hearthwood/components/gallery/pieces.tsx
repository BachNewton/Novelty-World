"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import { BoxGeometry, InstancedBufferAttribute, InstancedMesh, Mesh, Object3D, type Material } from "three";
import { generateCat } from "../../cats/cat";
import type { Activity } from "../../cats/motion";
import type { Plant } from "../../engine/life";
import { PLACE_KINDS, PLANT_KINDS, REGION_CHARACTER, REGIONS, TREE_KINDS, type PlaceKind, type PlantKind, type TreeKind } from "../../engine/regions";
import type { AtmosphereUniforms } from "../../art/atmosphere";
import { Campfire, type FireState } from "../../art/campfire";
import { Fireflies } from "../../art/fireflies";
import { paint } from "../../art/painted";
import type { Palette } from "../../art/palette";
import { plantColour, plantMatrix } from "../../art/plant-instances";
import { plantShape } from "../../art/plant-shapes";
import { fallRibbon, placeGeometry, type PlaceLook } from "../../art/place-shapes";
import type { SkyUniforms } from "../../art/sky";
import { poolGeometry, waterMesh } from "../../art/water/water";
import { Broom } from "../../art/broom";
import { Witch, type WitchPose } from "../../art/witch";
import { CatBody } from "../cats/cat-body";

/*
 * Every piece the gallery shows, in one list: a new piece of art appears in
 * the gallery by being added here. The plants of each region and the places
 * come from the game's own lists of kinds, so a new kind shows without being
 * added at all. Each piece is drawn from the art layer alone, on flat ground
 * at its own origin, with plain data made up for it: no world is generated.
 */

/** Elliott on the broom at full speed, the wind in their cloak. */
const ON_THE_BROOM: Partial<WitchPose> = { ride: 1, wind: 1, seconds: 0.4 };

export interface ArtContext {
  palette: Palette;
  atmosphere: AtmosphereUniforms;
  sky: SkyUniforms;
  fire: FireState;
  /** Seconds, for the cats. */
  clock: () => number;
  materials: { foliage: Material; stone: Material; place: Material; water: Material };
}

export interface ArtPiece {
  id: string;
  /** The row it stands in, and its name there. */
  group: string;
  label: string;
  /** How far it reaches from its middle, in metres, and how tall it stands: for spacing and for the camera. */
  radius: number;
  height: number;
  render: (context: ArtContext) => ReactNode;
}

const TREE_HEIGHT: Record<TreeKind, number> = { conifer: 12, pine: 13, broadleaf: 9, birch: 9.5, aspen: 10.5, maple: 9 };
const SMALL_SIZE: Record<Exclude<PlantKind, TreeKind>, number> = { bush: 1.3, heather: 1.3, fern: 0.9, mushroom: 1, flowers: 1.1, rock: 1.2 };

function plantOf(kind: PlantKind, variant: number): Plant {
  const tree = (TREE_KINDS as readonly PlantKind[]).includes(kind);
  const size = tree ? TREE_HEIGHT[kind as TreeKind] : SMALL_SIZE[kind as Exclude<PlantKind, TreeKind>];
  return { kind, x: 0, y: 0, z: 0, size, stretch: 1, turn: variant * 2.1, lean: 0, leanToward: 0, tint: 0, variant };
}

/** One plant of a design, drawn as an instance so it sways in the breeze as it does in the world. */
function PlantPiece({ kind, variant, context }: { kind: PlantKind; variant: number; context: ArtContext }) {
  const mesh = useMemo(() => {
    const geometry = plantShape(kind, variant, "near", context.palette);
    if (geometry === null) throw new Error(`No near shape for ${kind} ${variant}`);
    const instanced = new InstancedMesh(geometry, kind === "rock" ? context.materials.stone : context.materials.foliage, 1);
    const plant = plantOf(kind, variant);
    instanced.setMatrixAt(0, plantMatrix(plant, new Object3D()));
    const colour = new Float32Array(3);
    plantColour(plant, colour, 0);
    instanced.instanceColor = new InstancedBufferAttribute(colour, 3);
    instanced.castShadow = true;
    instanced.frustumCulled = false;
    return instanced;
  }, [kind, variant, context]);
  useEffect(() => () => mesh.geometry.dispose(), [mesh]);
  return <primitive object={mesh} />;
}

/** A way down for showing falling water on its own: off a ledge `drop` metres high, levelling out `run` metres on. */
function showcaseFall(drop: number, run: number): { fall: Float32Array; ground: (x: number, z: number) => number } {
  const ground = (_x: number, z: number) => drop * (1 - Math.min(1, Math.max(0, z / run)) ** 0.5);
  const points: number[] = [];
  for (let z = -3; z <= run + 6; z += 1) points.push(0, ground(0, z), z);
  return { fall: new Float32Array(points), ground };
}

/** A rock ledge for showcase water to fall from: the water runs over its top and falls from its front edge. */
function ledge(palette: Palette, drop: number) {
  const geometry = new BoxGeometry(12, drop, 6.5, 4, 3, 3);
  geometry.translate(0, drop / 2, -2.75);
  return paint([{ geometry, colour: palette.things.rock, shading: 0.4 }]);
}

function PlacePiece({ kind, context }: { kind: PlaceKind; context: ArtContext }) {
  const built = useMemo(() => {
    const look: PlaceLook = { kind, x: 0, z: 0, turn: 0.4, seed: `hearthwood/gallery/${kind}` };
    const meshes: Mesh[] = [];
    let ground = (_x: number, _z: number) => 0;
    if (kind === "tarn") {
      look.pool = { level: 0, radius: 8 };
      const water = waterMesh(poolGeometry(8), context.materials.water);
      water.position.y = 0.05;
      meshes.push(water);
    }
    if (kind === "cascade" || kind === "waterfall") {
      const { fall, ground: slope } = showcaseFall(kind === "cascade" ? 9 : 4, 12);
      look.turn = 0;
      look.fall = fall;
      ground = slope;
      meshes.push(new Mesh(ledge(context.palette, kind === "cascade" ? 9 : 4), context.materials.place), waterMesh(fallRibbon(fall), context.materials.water));
    }
    const mesh = new Mesh(placeGeometry(look, ground, context.palette), context.materials.place);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    meshes.push(mesh);
    return meshes;
  }, [kind, context]);
  useEffect(() => () => built.forEach((m) => m.geometry.dispose()), [built]);
  return (
    <>
      {built.map((m) => (
        <primitive key={m.uuid} object={m} />
      ))}
    </>
  );
}

const PLACE_NAMES: Record<PlaceKind, string> = {
  "stone-circle": "Stone circle",
  cairn: "Cairn and bench",
  tor: "Tor",
  shrine: "Shrine",
  "fallen-tree": "Fallen giant",
  "fairy-ring": "Fairy ring",
  seter: "Seter",
  tarn: "Tarn",
  cascade: "Cascade",
  waterfall: "Waterfall",
};

const PLACE_RADIUS: Record<PlaceKind, number> = {
  "stone-circle": 8,
  cairn: 3.5,
  tor: 6,
  shrine: 2.5,
  "fallen-tree": 9,
  "fairy-ring": 4.5,
  seter: 17,
  tarn: 12,
  cascade: 8,
  waterfall: 8,
};

const PLANT_NAMES: Record<PlantKind, string> = {
  conifer: "Fir",
  pine: "Scots pine",
  broadleaf: "Oak",
  birch: "Birch",
  aspen: "Aspen",
  maple: "Maple",
  bush: "Bush",
  heather: "Heather",
  fern: "Fern",
  mushroom: "Mushrooms",
  flowers: "Flowers",
  rock: "Rock",
};

/** The kinds a region grows, trees first, each with the designs it shows there. */
function regionPlants(region: (typeof REGIONS)[number]): { kind: PlantKind; variants: number[] }[] {
  const character = REGION_CHARACTER[region];
  const kinds = new Set<PlantKind>([...Object.keys(character.trees), ...Object.keys(character.highTrees), ...Object.keys(character.open), ...Object.keys(character.underTrees)] as PlantKind[]);
  kinds.delete("rock");
  return PLANT_KINDS.filter((k) => kinds.has(k)).map((kind) => ({ kind, variants: kind === "flowers" ? [...character.flowers] : [0, 1, 2] }));
}

const CATS: { seed: string; activity: Activity }[] = [
  { seed: "gallery-cat-1", activity: "sit" },
  { seed: "gallery-cat-2", activity: "stand" },
  { seed: "gallery-cat-3", activity: "loaf" },
  { seed: "gallery-cat-4", activity: "walk" },
];

const FIREFLY_SPOTS = new Float32Array(Array.from({ length: 24 }, (_, f) => [Math.cos(f * 2.4) * (1 + (f % 4)), 0.8 + (f % 3) * 0.5, Math.sin(f * 2.4) * (1 + (f % 4))]).flat());

export const ART_PIECES: ArtPiece[] = [
  ...REGIONS.flatMap((region) =>
    regionPlants(region).flatMap(({ kind, variants }) =>
      variants.map((variant) => {
        const tree = (TREE_KINDS as readonly PlantKind[]).includes(kind);
        return {
          id: `${region}/${kind}/${variant}`,
          group: REGION_CHARACTER[region].name,
          label: `${PLANT_NAMES[kind]} ${variant + 1}`,
          radius: tree ? 3.4 : 0.9,
          height: tree ? TREE_HEIGHT[kind as TreeKind] : 1,
          render: (context: ArtContext) => <PlantPiece kind={kind} variant={variant} context={context} />,
        };
      }),
    ),
  ),
  ...[0, 1, 2].map((variant) => ({
    id: `stones/rock/${variant}`,
    group: "Stones",
    label: `Rock ${variant + 1}`,
    radius: 1.2,
    height: 1.2,
    render: (context: ArtContext) => <PlantPiece kind="rock" variant={variant} context={context} />,
  })),
  ...PLACE_KINDS.map((kind) => ({
    id: `places/${kind}`,
    group: "Places",
    label: PLACE_NAMES[kind],
    radius: PLACE_RADIUS[kind],
    height: kind === "cascade" ? 9 : kind === "seter" ? 5 : 3,
    render: (context: ArtContext) => <PlacePiece kind={kind} context={context} />,
  })),
  {
    id: "camp/campfire",
    group: "Camp",
    label: "Campfire, seats, bedroll and pot",
    radius: 4,
    height: 1.5,
    render: (context) => <Campfire at={{ x: 0, y: 0, z: 0 }} seed="hearthwood/gallery/camp" palette={context.palette} atmosphere={context.atmosphere} fire={context.fire} />,
  },
  {
    id: "camp/fireflies",
    group: "Camp",
    label: "Fireflies (at night)",
    radius: 4,
    height: 2,
    render: (context) => <Fireflies spots={FIREFLY_SPOTS} palette={context.palette} atmosphere={context.atmosphere} sky={context.sky} />,
  },
  {
    id: "folk/witch",
    group: "Elliott and the cats",
    label: "Elliott",
    radius: 1.2,
    height: 1.8,
    render: (context) => <Witch palette={context.palette} atmosphere={context.atmosphere} />,
  },
  {
    id: "folk/witch-on-broom",
    group: "Elliott and the cats",
    label: "Elliott on the broom",
    radius: 1.3,
    height: 2.2,
    render: (context) => (
      <group position={[0, 0.5, 0]}>
        <Witch palette={context.palette} atmosphere={context.atmosphere} still={ON_THE_BROOM} />
      </group>
    ),
  },
  {
    id: "folk/broom",
    group: "Elliott and the cats",
    label: "Broom",
    radius: 1,
    height: 0.5,
    render: (context) => <Broom palette={context.palette} atmosphere={context.atmosphere} />,
  },
  ...CATS.map(({ seed, activity }, i) => ({
    id: `folk/cat/${i + 1}`,
    group: "Elliott and the cats",
    label: `Cat ${i + 1}`,
    radius: 0.7,
    height: 0.5,
    render: (context: ArtContext) => <CatBody cat={generateCat(seed)} activity={activity} speed={0.4} clock={context.clock} />,
  })),
];
