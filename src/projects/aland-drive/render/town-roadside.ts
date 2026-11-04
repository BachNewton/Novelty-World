import type { Mesh } from "three/webgpu";
import { time } from "three/tsl";
import { placeModel, placeSigns, type Placement, type RoadsideInputs, type RoadsideModel } from "../art/roadside/index";
import type { StreetInputs } from "../art/street/index";
import { buildTownLamp } from "../art/town-kit/lamps";
import { namePlateMaterial, placeTrafficLights, townMaterials, trafficLightMaterials } from "../art/town-kit/material";
import { buildTrafficLight } from "../art/town-kit/signals";
import { bladesOnPost, buildStreetNamePlate, buildStreetNamePost, buildVillagePlate, buildVillageSign, createNameSheet, placeNamePlates, STREET_PLATE, VILLAGE_PLATE, VILLAGE_PLATE_Y_M } from "../art/town-kit/signs";
import { roadsidePlaces, type TileRoadside } from "./tile-models";

/*
 * The town kit's part of the roadside: post-top lamps on a town's lesser streets, traffic lights, street names at a
 * town junction and villages' signs. Lists as the roadside's are, one a model across every loaded tile. A name plate
 * reads its face from a sheet holding the names on the loaded tiles' plates, drawn again whenever those change: a few
 * hundred cells round Mariehamn, so the sheet stays a few megabytes, and the island's thousands of names never are.
 */

export const TOWN_MODELS = new Set(["town-lamp", "traffic-light", "name-post", "village-sign"]);

export interface TownLooks {
  inputs: RoadsideInputs;
  /** A token's name to a CSS colour, for the name sheets. */
  ink: (token: string) => string;
}

/** Hands a list's old meshes over to its new ones; the roadside keeps which are shown. */
type Swap = (old: Mesh[], next: Mesh[], shown: boolean) => Mesh[];

const NOWHERE: Placement = { x: 0, y: 0, z: 0, scale: 0 };
/** A street's blade is read close by; a village's board from far down the road. */
const STREET_CELL_PX = 256;
const VILLAGE_CELL_PX = 512;

type Named = Placement & { name: string };

function namePlates(model: RoadsideModel, aspect: number, cellPx: number, inputs: StreetInputs, ink: TownLooks["ink"]) {
  let names = "";
  let sheet = createNameSheet([], aspect, ink, cellPx);
  const { material, show } = namePlateMaterial(inputs, sheet.texture);
  return {
    place(plates: readonly Named[]): Mesh {
      const wanted = [...new Set(plates.map(({ name }) => name))].sort();
      if (wanted.join("\n") !== names) {
        const old = sheet;
        sheet = createNameSheet(wanted, aspect, ink, cellPx);
        show(sheet.texture);
        old.texture.dispose();
        names = wanted.join("\n");
      }
      return plates.length > 0 ? placeNamePlates(model, sheet, plates, material) : placeSigns(model, [{ ...NOWHERE, cell: [0, 0, 1, 1] }], material);
    },
    dispose() {
      sheet.texture.dispose();
      material.dispose();
      model.near.dispose();
    },
  };
}

export function createTownRoadside({ inputs: still, ink }: TownLooks, swap: Swap) {
  // The traffic lights run on the renderer's own clock, as the water does.
  const inputs: StreetInputs = { ...still, time };
  const materials = townMaterials(inputs);
  const signalMaterials = trafficLightMaterials(inputs);
  const models = { lamp: buildTownLamp(), light: buildTrafficLight(), post: buildStreetNamePost(), frame: buildVillageSign() };
  const blades = namePlates(buildStreetNamePlate(), STREET_PLATE.wideM / STREET_PLATE.tallM, STREET_CELL_PX, inputs, ink);
  const boards = namePlates(buildVillagePlate(), VILLAGE_PLATE.wideM / VILLAGE_PLATE.tallM, VILLAGE_CELL_PX, inputs, ink);
  const meshes: Record<string, Mesh[]> = { "town-lamp": [], "traffic-light": [], "name-post": [], "village-sign": [], blades: [], boards: [] };

  const placesOf = (tiles: readonly TileRoadside[], name: string) => tiles.flatMap((tile) => (name in tile.models ? roadsidePlaces(tile.models[name]) : []));
  const list = (key: string, next: (places: Placement[]) => Mesh[], places: Placement[]) => {
    meshes[key] = swap(meshes[key], next(places.length > 0 ? places : [NOWHERE]), places.length > 0);
  };

  const rebuilders: Record<string, (tiles: readonly TileRoadside[]) => void> = {
    "town-lamp": (tiles) => list("town-lamp", (places) => placeModel(models.lamp, places, materials), placesOf(tiles, "town-lamp")),
    "traffic-light": (tiles) => {
      const phases = tiles.flatMap((tile) => [...tile.signalPhases]);
      list("traffic-light", (places) => placeTrafficLights(models.light, places.map((place, index) => ({ ...place, phase: phases[index] })), signalMaterials), placesOf(tiles, "traffic-light"));
    },
    "name-post": (tiles) => {
      const posts = placesOf(tiles, "name-post");
      const names = tiles.flatMap((tile) => tile.streetNames);
      list("name-post", (places) => placeModel(models.post, places, materials), posts);
      const plates = posts.flatMap((post, index) => bladesOnPost(post, names[index]));
      meshes.blades = swap(meshes.blades, [blades.place(plates)], plates.length > 0);
    },
    "village-sign": (tiles) => {
      const signs = placesOf(tiles, "village-sign");
      const names = tiles.flatMap((tile) => tile.villageNames);
      list("village-sign", (places) => placeModel(models.frame, places, materials), signs);
      const plates = signs.map((sign, index) => ({ ...sign, y: sign.y + VILLAGE_PLATE_Y_M, name: names[index] }));
      meshes.boards = swap(meshes.boards, [boards.place(plates)], plates.length > 0);
    },
  };

  return {
    /** Rebuilds the lists of the models named, from every loaded tile. */
    rebuild(tiles: readonly TileRoadside[], names: Iterable<string>) {
      for (const name of names) if (TOWN_MODELS.has(name)) rebuilders[name](tiles);
    },
    counts(tiles: readonly TileRoadside[]) {
      return {
        ...Object.fromEntries([...TOWN_MODELS].map((name) => [name, placesOf(tiles, name).length])),
        "street names on the sheet": new Set(tiles.flatMap((tile) => tile.streetNames.flat().map(({ name }) => name))).size,
      };
    },
    dispose() {
      for (const list of Object.values(meshes)) for (const mesh of list) mesh.geometry.dispose();
      for (const model of Object.values(models)) {
        model.near.dispose();
        model.far?.dispose();
      }
      blades.dispose();
      boards.dispose();
    },
  };
}
