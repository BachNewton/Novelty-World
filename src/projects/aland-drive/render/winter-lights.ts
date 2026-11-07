import type { BufferAttribute, Mesh, Scene } from "three/webgpu";
import { createGlows, LAMPS_ON_FROM, type GlowInstance, type LampSpot, type Night } from "../art/night";
import { bulbGlow, esplanadeStrings, julgatanStrings, starGlow, TREE_THRESHOLD, treePlace, type TownString } from "../art/night/winter-town";
import { buildChristmasTree, christmasTreeLights } from "../art/town-kit";
import { placeModel, type RoadsideMaterials } from "../art/roadside";
import { dialsNow, type LiveSeason } from "../art/season";
import { oneByOne } from "../climate/season";

/*
 * Mariehamn's Christmas in the game (`art/night/winter-town.ts`): Torget's tree, which stands by day too, and the town's
 * strings of lights, the Julgatan's across Torggatan, the Esplanade's from lamp to lamp, and the tree's own, as glows in
 * one draw. Out of season none of it is drawn. In season the strings are written into the glows' list as the season
 * reaches each one's threshold, which happens a few times a season, not each frame, and the glows show only once the
 * lamps are coming on.
 */

/** Room for every bulb: the Julgatan's and the Esplanade's strings, and the tree's. */
const BULBS_MOST = 12000;
/** Near enough to Torget to read the ground there again when the world's detail changes. */
const GROUND_NEAR_M = 3000;
const NOWHERE = { x: 0, y: -10000, z: 0 };

export interface WinterLights {
  /** The roadside's lamps, whenever they change: the Esplanade's strings hang from them. */
  setLamps: (spots: readonly LampSpot[]) => void;
  /** Each frame: follows the season and the hour, and the ground under the tree as detail lands round it. */
  update: (camera: { x: number; z: number }) => void;
  /** Every mesh shown, for compiling before the drive; `false` puts back what the season and hour say. */
  showAll: (all: boolean) => void;
  /** Shows the town's Christmas or leaves it out, to see what it costs. */
  show: (shown: boolean) => void;
  dispose: () => void;
}

interface Ground {
  height: (x: number, z: number) => number;
  /** Grows whenever the world's detail changes. */
  revision: () => number;
}

export function createWinterLights(scene: Scene, night: Night, season: LiveSeason, { origin, ground, materials }: { origin: { east: number; north: number }; ground: Ground; materials: RoadsideMaterials }): WinterLights {
  const glows = createGlows(night, [], [], BULBS_MOST);
  const tree = placeModel(buildChristmasTree(), [NOWHERE], materials);
  const meshes: Mesh[] = [glows.mesh, ...tree];
  scene.add(...meshes);
  const treeAt = treePlace(origin);
  const treeLights = christmasTreeLights();

  let lamps: readonly LampSpot[] = [];
  let strings: TownString[] = [];
  let treeY = NOWHERE.y;
  let groundRead = -1;
  let shownShare = -1;
  let compiling = false;
  let hidden = false;

  const standTree = (y: number) => {
    treeY = y;
    for (const mesh of tree) {
      const place = mesh.geometry.getAttribute("place") as BufferAttribute;
      place.setXYZ(0, treeAt.x, y, treeAt.z);
      place.needsUpdate = true;
    }
  };
  const readGround = () => {
    groundRead = ground.revision();
    standTree(ground.height(treeAt.x, treeAt.z));
    strings = [...julgatanStrings(origin, ground.height), ...esplanadeStrings(lamps, origin)];
    shownShare = -1;
  };
  /** Writes the bulbs of every string the season has reached, and the tree's once it stands. */
  const writeBulbs = (share: number) => {
    shownShare = share;
    const up: GlowInstance[] = [];
    if (oneByOne(share, TREE_THRESHOLD) > 0.5) {
      const at = (x: number, y: number, z: number) => ({ x: treeAt.x + x, y: treeY + y, z: treeAt.z + z });
      up.push(...treeLights.bulbs.map(([x, y, z]) => bulbGlow(at(x, y, z))), starGlow(at(...treeLights.star)));
    }
    for (const { bulbs, threshold } of strings) if (oneByOne(share, threshold) > 0.5) up.push(...bulbs.map((bulb) => bulbGlow(bulb)));
    if (up.length > BULBS_MOST) throw new Error(`${up.length} bulbs, and room for ${BULBS_MOST}`);
    up.forEach((glow, at) => {
      glows.set(at, glow);
    });
    glows.upload(up.length);
  };

  const show = (share: number) => {
    const standing = compiling || (!hidden && oneByOne(share, TREE_THRESHOLD) > 0.5);
    for (const mesh of tree) mesh.visible = standing;
    glows.mesh.visible = compiling || (!hidden && share > 0 && night.amount.value > LAMPS_ON_FROM);
  };

  return {
    setLamps(spots) {
      lamps = spots;
      groundRead = -1;
    },
    update(camera) {
      const share = dialsNow(season).lightsTown;
      const near = Math.hypot(camera.x - treeAt.x, camera.z - treeAt.z) < GROUND_NEAR_M;
      if (share > 0 && near && ground.revision() !== groundRead) readGround();
      // Rounded, so the list is written as strings go up or come down, not for every change of the dial between.
      const step = Math.round(share * 200) / 200;
      if (step !== shownShare && groundRead >= 0) writeBulbs(step);
      show(share);
    },
    showAll(all) {
      compiling = all;
      if (all) {
        glows.set(0, bulbGlow(NOWHERE));
        glows.upload(1);
      } else shownShare = -1;
      show(dialsNow(season).lightsTown);
    },
    show(shown) {
      hidden = !shown;
      show(dialsNow(season).lightsTown);
    },
    dispose() {
      for (const mesh of meshes) {
        scene.remove(mesh);
        if (mesh !== glows.mesh) mesh.geometry.dispose();
      }
      glows.dispose();
    },
  };
}
