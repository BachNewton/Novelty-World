"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import { BoxGeometry, InstancedBufferAttribute, InstancedMesh, Mesh, Object3D, type Material } from "three";
import { generateCat } from "../../cats/cat";
import type { Activity } from "../../cats/motion";
import { FORAGE_FORM, FORAGE_VARIANTS } from "../../engine/forage";
import type { Plant } from "../../engine/life";
import { FORAGE_KINDS, PLACE_KINDS, PLANT_KINDS, REGION_CHARACTER, REGIONS, TREE_KINDS, type ForageKind, type PlaceKind, type PlantKind, type TreeKind } from "../../engine/regions";
import type { AtmosphereUniforms } from "../../art/atmosphere";
import { Campfire, type FireState } from "../../art/campfire";
import { COOKWARE_LARGER, panShape, stickShape } from "../../art/cookware";
import { readDishPalette } from "../../art/dish-looks";
import { dishShape } from "../../art/dishes";
import { DISH_SHOWN_LARGER } from "../../art/hearth-cooking";
import { humbleId, type DishId } from "../../gameplay/recipes";
import { forageShape, readForagePalette, type ForagePart } from "../../art/forage-shapes";
import { Fireflies } from "../../art/fireflies";
import { paint } from "../../art/painted";
import type { Palette } from "../../art/palette";
import { plantColour, plantMatrix } from "../../art/plant-instances";
import { plantShape } from "../../art/plant-shapes";
import { fallRibbon, placeGeometry, type PlaceLook } from "../../art/place-shapes";
import type { SkyUniforms } from "../../art/sky/sky";
import { shadowDepth } from "../../art/shading";
import { poolGeometry, waterMesh } from "../../art/water/water";
import { Broom } from "../../art/broom";
import { Witch, type WitchPose } from "../../art/witch";
import { FolkFigure } from "../../art/folk-figure";
import { folkLook, readFolkPalette } from "../../art/folk";
import { homeShape, keepsakeShape, SINKS } from "../../art/folk-homes";
import { HOME_KINDS, ROLES, type HomeKind, type Role } from "../../engine/people";
import { CLUE_MARKS, KEEPSAKES, type ClueMark } from "../../stories/story";
import { CLUE_LARGER, clueShape, readCluePalette } from "../../art/clue-shapes";
import { CatBody } from "../cats/cat-body";
import { generateFox } from "../../foxes/fox";
import { FoxBody } from "../foxes/fox-body";
import { generateHedgehog } from "../../hedgehogs/hedgehog";
import { HedgehogBody } from "../hedgehogs/hedgehog-body";
import { generateSquirrel } from "../../squirrels/squirrel";
import { SquirrelBody } from "../squirrels/squirrel-body";
import { generateHare } from "../../hares/hare";
import { HareBody } from "../hares/hare-body";
import { generateDeer } from "../../deer/deer";
import { DeerBody } from "../deer/deer-body";
import { SONGBIRDS } from "../../birds/bird";
import { PosedBird } from "../birds/posed-bird";
import { Butterflies, BUTTERFLY_KINDS, type ButterflyDay } from "../../art/butterflies";
import { useFeature } from "../valley/feature-renderer";
import { dishName } from "../valley/cooking-icons";
import { FORAGE_NAMES } from "../valley/forage-icons";

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
const SMALL_SIZE: Record<Exclude<PlantKind, TreeKind>, number> = { bush: 1.3, heather: 1.3, fern: 0.9, flowers: 1.1, rock: 1.2 };

function plantOf(kind: PlantKind, variant: number): Plant {
  const tree = (TREE_KINDS as readonly PlantKind[]).includes(kind);
  const size = tree ? TREE_HEIGHT[kind as TreeKind] : SMALL_SIZE[kind as Exclude<PlantKind, TreeKind>];
  return { kind, x: 0, y: 0, z: 0, size, stretch: 1, turn: variant * 2.1, lean: 0, leanToward: 0, tint: 0, variant };
}

/** One plant of a design, drawn as an instance so it sways in the breeze as it does in the world. */
function PlantPiece({ kind, variant, context }: { kind: PlantKind; variant: number; context: ArtContext }) {
  const seasonal = useFeature("seasonalFoliage");
  const mesh = useMemo(() => {
    const geometry = plantShape(kind, variant, "near", context.palette, seasonal);
    if (geometry === null) throw new Error(`No near shape for ${kind} ${variant}`);
    const instanced = new InstancedMesh(geometry, kind === "rock" ? context.materials.stone : context.materials.foliage, 1);
    const plant = plantOf(kind, variant);
    instanced.setMatrixAt(0, plantMatrix(plant, new Object3D()));
    const colour = new Float32Array(3);
    plantColour(plant, colour, 0);
    instanced.instanceColor = new InstancedBufferAttribute(colour, 3);
    instanced.castShadow = true;
    instanced.customDepthMaterial = shadowDepth(kind === "rock" ? "solid" : "foliage", context.atmosphere);
    instanced.frustumCulled = false;
    return instanced;
  }, [kind, variant, context, seasonal]);
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

/** A berry bush or mushrooms to pick, as they are ripe or once picked. */
function ForagePiece({ kind, variant, picked, context }: { kind: ForageKind; variant: number; picked: boolean; context: ArtContext }) {
  const meshes = useMemo(() => {
    const palette = readForagePalette();
    const berry = FORAGE_FORM[kind] === "berry";
    const parts: ForagePart[] = berry ? (picked ? ["plant"] : ["plant", "fruit"]) : [picked ? "cut" : "plant"];
    return parts.map((part) => {
      const mesh = new Mesh(forageShape(kind, variant, part, palette), context.materials.stone);
      mesh.castShadow = true;
      return mesh;
    });
  }, [kind, variant, picked, context]);
  useEffect(() => () => meshes.forEach((m) => m.geometry.dispose()), [meshes]);
  return (
    <>
      {meshes.map((m) => (
        <primitive key={m.uuid} object={m} />
      ))}
    </>
  );
}

/** A dish as it is served before the fire, or the cookware it is made in, drawn as large as the fire shows it. */
function CookingPiece({ thing, context }: { thing: DishId | "pan" | "stick"; context: ArtContext }) {
  const mesh = useMemo(() => {
    const palette = readDishPalette();
    const geometry = thing === "pan" ? panShape(palette) : thing === "stick" ? stickShape(palette, 1.9) : dishShape(thing, palette);
    const made = new Mesh(geometry, context.materials.stone);
    made.scale.setScalar(thing === "pan" ? COOKWARE_LARGER : thing === "stick" ? 1 : DISH_SHOWN_LARGER);
    if (thing === "stick") made.rotation.z = -1.2;
    made.castShadow = true;
    return made;
  }, [thing, context]);
  useEffect(() => () => mesh.geometry.dispose(), [mesh]);
  return <primitive object={mesh} />;
}

/** A person as the world draws them, standing (waving, for the first of each role) or sat on a stone. */
function FolkPiece({ role, seed, seat, waving, context }: { role: Role; seed: string; seat: number | null; waving: boolean; context: ArtContext }) {
  const palette = useMemo(() => readFolkPalette(), []);
  const look = useMemo(() => folkLook(seed, role), [seed, role]);
  const still = useMemo(() => ({ wave: waving ? 0.42 : 0, seconds: 0.6 }), [waving]);
  return (
    <>
      {seat !== null && <HomePiece kind="stone" seed={seed} context={context} />}
      <FolkFigure look={look} seat={seat} palette={palette} material={context.materials.stone} still={still} />
    </>
  );
}

function HomePiece({ kind, seed, context }: { kind: HomeKind; seed: string; context: ArtContext }) {
  const mesh = useMemo(() => {
    const made = new Mesh(homeShape(kind, seed, readFolkPalette()), context.materials.stone);
    made.position.y = -SINKS[kind];
    made.castShadow = true;
    made.receiveShadow = true;
    return made;
  }, [kind, seed, context]);
  useEffect(() => () => mesh.geometry.dispose(), [mesh]);
  return <primitive object={mesh} />;
}

function KeepsakesPiece({ context }: { context: ArtContext }) {
  const meshes = useMemo(() => {
    const palette = readFolkPalette();
    return KEEPSAKES.map((k, i) => {
      const made = new Mesh(keepsakeShape(k, palette), context.materials.stone);
      made.position.x = (i - (KEEPSAKES.length - 1) / 2) * 0.45;
      made.scale.setScalar(1.5);
      made.castShadow = true;
      return made;
    });
  }, [context]);
  useEffect(() => () => meshes.forEach((m) => m.geometry.dispose()), [meshes]);
  return (
    <>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </>
  );
}

function CluePiece({ mark, context }: { mark: ClueMark; context: ArtContext }) {
  const mesh = useMemo(() => {
    const made = new Mesh(clueShape(mark, readCluePalette()), context.materials.stone);
    made.scale.setScalar(CLUE_LARGER);
    made.castShadow = true;
    made.receiveShadow = true;
    return made;
  }, [mark, context]);
  useEffect(() => () => mesh.geometry.dispose(), [mesh]);
  return <primitive object={mesh} />;
}

const CLUE_NAMES: Record<ClueMark, string> = {
  "fox-prints": "Fox prints in mud",
  fur: "Fur on a twig",
  mitten: "A small mitten",
  crumbs: "Crumbs and honey",
  twigs: "Twigs and wool",
  feather: "A jackdaw's feather",
  button: "A brass button",
  rope: "A coil of rope",
  "cane-prints": "Boot and cane prints",
  "cloudberry-leaf": "A cloudberry leaf",
};

const ROLE_NAMES: Record<Role, string> = {
  shepherd: "Shepherd",
  beekeeper: "Beekeeper",
  fisher: "Fisher",
  herder: "Reindeer herder",
  "sauna-keeper": "Sauna keeper",
  cottager: "Cottager",
  traveller: "Traveller",
  hiker: "Hiker",
};
const HOME_NAMES: Record<HomeKind, string> = { sheep: "Sheep", hives: "Straw skep", boat: "Rowing boat", sauna: "Smoke sauna", cottage: "Cottage", lavvu: "Herder's tent", stone: "Sitting stone" };
const HOME_RADIUS: Record<HomeKind, number> = { sheep: 0.8, hives: 0.6, boat: 1.8, sauna: 2.6, cottage: 3.6, lavvu: 2, stone: 0.7 };
const HOME_HEIGHT: Record<HomeKind, number> = { sheep: 0.8, hives: 1, boat: 0.6, sauna: 3.4, cottage: 4.8, lavvu: 3.2, stone: 0.5 };
/** The roles drawn sat down too, as they are met. */
const SEATED: ReadonlySet<Role> = new Set(["traveller", "hiker"]);

const GALLERY_DISHES: DishId[] = ["blueberry-pie", "lingonberry-porridge", "cloudberry-pancakes", "strawberries-and-cream", "chanterelle-toast", "mushroom-soup", "berry-tea", "lingonberry-stick-bread", "mushroom-skewers", humbleId("pan", "porcini")];

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

const SUMMER = { winter: 0, white: 0 };
const WINTER = { winter: 1, white: 1 };
/** Butterflies always on the wing in the gallery, one of each kind over a patch. */
const GALLERY_BUTTERFLIES: ButterflyDay = { uAbout: { value: 1 } };
const BUTTERFLY_SPOTS = BUTTERFLY_KINDS.map((_, kind) => ({ x: 0, y: 0, z: 0, seed: 0.15 + kind * 0.2, kind }));

/** The forest's animals, each in a pose that shows it best. */
const FOREST_ANIMALS: { id: string; label: string; radius: number; height: number; render: (context: ArtContext) => ReactNode }[] = [
  { id: "fox", label: "Red fox", radius: 0.8, height: 0.6, render: (c) => <FoxBody fox={generateFox("gallery-fox")} activity="stand" clock={c.clock} atmosphere={c.atmosphere} /> },
  { id: "fox-trotting", label: "Fox at a trot", radius: 0.8, height: 0.6, render: (c) => <FoxBody fox={generateFox("gallery-fox-2")} activity="trot" speed={1.9} clock={c.clock} atmosphere={c.atmosphere} /> },
  { id: "silver-fox", label: "Silver fox", radius: 0.8, height: 0.6, render: (c) => { const fox = generateFox("gallery-fox-3"); return <FoxBody fox={{ ...fox, coat: { ...fox.coat, phase: "silver" } }} activity="sit" clock={c.clock} atmosphere={c.atmosphere} />; } },
  { id: "hedgehog", label: "Hedgehog", radius: 0.3, height: 0.2, render: (c) => <HedgehogBody hedgehog={generateHedgehog("gallery-hedgehog")} activity="stand" clock={c.clock} atmosphere={c.atmosphere} /> },
  { id: "hedgehog-curled", label: "Hedgehog, curled up", radius: 0.3, height: 0.2, render: (c) => <HedgehogBody hedgehog={generateHedgehog("gallery-hedgehog-2")} activity="lie" clock={c.clock} atmosphere={c.atmosphere} /> },
  { id: "squirrel", label: "Red squirrel", radius: 0.3, height: 0.3, render: (c) => <SquirrelBody squirrel={generateSquirrel("gallery-squirrel")} coatSeason={SUMMER} activity="sit" clock={c.clock} atmosphere={c.atmosphere} /> },
  { id: "hare", label: "Mountain hare, summer", radius: 0.5, height: 0.4, render: (c) => <HareBody hare={generateHare("gallery-hare")} coatSeason={SUMMER} activity="stand" clock={c.clock} atmosphere={c.atmosphere} /> },
  { id: "hare-winter", label: "Mountain hare, winter", radius: 0.5, height: 0.4, render: (c) => <HareBody hare={generateHare("gallery-hare")} coatSeason={WINTER} activity="sit" clock={c.clock} atmosphere={c.atmosphere} /> },
  { id: "roe-buck", label: "Roe buck", radius: 1.1, height: 1.2, render: (c) => { const deer = generateDeer("gallery-deer"); return <DeerBody deer={{ ...deer, sex: "male", build: { ...deer.build, antlers: 1 } }} coatSeason={SUMMER} activity="stand" clock={c.clock} atmosphere={c.atmosphere} />; } },
  { id: "roe-doe", label: "Roe doe, winter, grazing", radius: 1.1, height: 1, render: (c) => { const deer = generateDeer("gallery-deer-2"); return <DeerBody deer={{ ...deer, sex: "female", build: { ...deer.build, antlers: 0 } }} coatSeason={WINTER} activity="graze" clock={c.clock} atmosphere={c.atmosphere} />; } },
  ...SONGBIRDS.map((species) => ({ id: species, label: species === "great-tit" ? "Great tit" : species === "robin" ? "Robin" : "Chaffinch", radius: 0.2, height: 0.2, render: (c: ArtContext) => <PosedBird species={species} activity="perch" clock={c.clock} atmosphere={c.atmosphere} /> })),
  { id: "butterflies", label: "Butterflies", radius: 2, height: 1, render: (c) => <Butterflies spots={BUTTERFLY_SPOTS} atmosphere={c.atmosphere} day={GALLERY_BUTTERFLIES} /> },
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
  ...FORAGE_KINDS.flatMap((kind) =>
    Array.from({ length: FORAGE_VARIANTS }, (_, variant) =>
      [false, true].map((picked) => ({
        id: `forage/${kind}/${variant}${picked ? "/picked" : ""}`,
        group: "Foraging",
        label: `${FORAGE_NAMES[kind]} ${variant + 1}${picked ? ", picked" : ""}`,
        radius: kind === "raspberry" ? 1 : 0.8,
        height: kind === "raspberry" ? 1.2 : 0.3,
        render: (context: ArtContext) => <ForagePiece kind={kind} variant={variant} picked={picked} context={context} />,
      })),
    ).flat(),
  ),
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
    id: "cooking/pan",
    group: "Cooking",
    label: "Cast-iron pan",
    radius: 0.6,
    height: 0.2,
    render: (context) => <CookingPiece thing="pan" context={context} />,
  },
  {
    id: "cooking/stick",
    group: "Cooking",
    label: "Roasting stick",
    radius: 1,
    height: 0.8,
    render: (context) => <CookingPiece thing="stick" context={context} />,
  },
  ...GALLERY_DISHES.map((dish) => ({
    id: `cooking/${dish}`,
    group: "Cooking",
    label: dishName(dish),
    radius: dish.includes("stick") || dish.includes("skewers") ? 0.65 : 0.45,
    height: 0.3,
    render: (context: ArtContext) => <CookingPiece thing={dish} context={context} />,
  })),
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
  ...ROLES.flatMap((role) =>
    [1, 2, 3].map((variant) => ({
      id: `people/${role}/${variant}`,
      group: "People",
      label: `${ROLE_NAMES[role]} ${variant}${variant === 3 && SEATED.has(role) ? ", seated" : ""}`,
      radius: 0.7,
      height: 1.7,
      render: (context: ArtContext) => <FolkPiece role={role} seed={`gallery-${role}-${variant}`} seat={variant === 3 && SEATED.has(role) ? 0.42 : null} waving={variant === 1} context={context} />,
    })),
  ),
  ...HOME_KINDS.map((kind) => ({
    id: `people/home/${kind}`,
    group: "People's homes",
    label: HOME_NAMES[kind],
    radius: HOME_RADIUS[kind],
    height: HOME_HEIGHT[kind],
    render: (context: ArtContext) => <HomePiece kind={kind} seed={`gallery-${kind}`} context={context} />,
  })),
  {
    id: "people/keepsakes",
    group: "People's homes",
    label: "Keepsakes",
    radius: 1,
    height: 0.5,
    render: (context) => <KeepsakesPiece context={context} />,
  },
  ...CLUE_MARKS.map((mark) => ({
    id: `mysteries/clue/${mark}`,
    group: "Clues",
    label: CLUE_NAMES[mark],
    radius: 0.7,
    height: 0.5,
    render: (context: ArtContext) => <CluePiece mark={mark} context={context} />,
  })),
  ...CATS.map(({ seed, activity }, i) => ({
    id: `folk/cat/${i + 1}`,
    group: "Elliott and the cats",
    label: `Cat ${i + 1}`,
    radius: 0.7,
    height: 0.5,
    render: (context: ArtContext) => <CatBody cat={generateCat(seed)} activity={activity} speed={0.4} clock={context.clock} atmosphere={context.atmosphere} />,
  })),
  ...FOREST_ANIMALS.map(({ id, label, radius, height, render }) => ({ id: `forest/${id}`, group: "Animals of the forest", label, radius, height, render })),
];
