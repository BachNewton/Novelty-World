import type { Scene } from "three/webgpu";
import { uniform } from "three/tsl";
import { boatMaterials, buildCruiser, buildFolkboat, buildLargeCruiser, buildLaunch, buildRib } from "../art/boats/index";
import type { Placement, RoadsideInputs, RoadsideMaterials } from "../art/roadside/index";
import { buildJettyHead, buildJettySection, buildPierSection, buildPontoonSection, buildRowingBoat, buildSailboat, JETTY_SECTION, PIER_SECTION, PONTOON_SECTION } from "../art/rural/index";
import { createPlacedModels, type PlacedKind } from "./placed-models";
import { PLACE_FLOATS } from "./tile-models";

/*
 * Jetties, piers and pontoons, and the boats at them, as the pipeline placed them
 * (`pipeline/docks.py`). A dock is a run from its place along the model's +x, and
 * is drawn as the shore kit's sections end to end, each stretched a little to fill
 * the run whole and widened to its width. Boats stand as placed.
 */

type Section = { readonly lengthM: number; readonly wideM: number };

function sections({ lengthM: sectionM, wideM }: Section) {
  return (places: Float32Array): Placement[] => {
    const fits: Placement[] = [];
    for (let at = 0; at < places.length; at += PLACE_FLOATS) {
      const [x, y, z, yaw, width, length] = places.subarray(at, at + PLACE_FLOATS);
      const count = Math.max(1, Math.round(length / sectionM));
      const step = length / count;
      // The model's +x turns to (cos yaw, -sin yaw) in the scene.
      const [alongX, alongZ] = [Math.cos(yaw), -Math.sin(yaw)];
      for (let section = 0; section < count; section++) fits.push({ x: x + alongX * step * section, y, z: z + alongZ * step * section, yaw, stretch: step / sectionM, depth: width / wideM });
    }
    return fits;
  };
}

function asPlaced(places: Float32Array): Placement[] {
  const fits: Placement[] = [];
  for (let at = 0; at < places.length; at += PLACE_FLOATS) {
    const [x, y, z, yaw] = places.subarray(at, at + PLACE_FLOATS);
    fits.push({ x, y, z, yaw });
  }
  return fits;
}

export function createDocks(scene: Scene, rural: RoadsideMaterials, inputs: RoadsideInputs, reachM: number) {
  const time = uniform(0);
  const boats = boatMaterials({ ...inputs, time });
  const run = (build: PlacedKind["build"], section: Section): PlacedKind => ({ build, materials: rural, fit: sections(section) });
  const at = (build: PlacedKind["build"], materials: RoadsideMaterials): PlacedKind => ({ build, materials, fit: asPlaced });
  const placed = createPlacedModels(
    scene,
    {
      jetty: run(buildJettySection, JETTY_SECTION),
      pier: run(buildPierSection, PIER_SECTION),
      pontoon: run(buildPontoonSection, PONTOON_SECTION),
      "jetty-head": at(buildJettyHead, rural),
      "rowing-boat-white": at(() => buildRowingBoat("white"), rural),
      "rowing-boat-blue": at(() => buildRowingBoat("blue"), rural),
      "rowing-boat-wood": at(() => buildRowingBoat("wood"), rural),
      sailboat: at(() => buildSailboat("moored"), rural),
      cruiser: at(() => buildCruiser({ cover: "navy", mooring: "bow-to" }), boats),
      large: at(() => buildLargeCruiser({ cover: "grey", mooring: "bow-to" }), boats),
      folkboat: at(() => buildFolkboat({ mooring: "bow-to" }), boats),
      launch: at(() => buildLaunch({ mooring: "bow-to" }), boats),
      rib: at(() => buildRib({ mooring: "bow-to" }), boats),
    },
    reachM,
    "a dock or boat",
  );
  return {
    ...placed,
    /** Moves the water the boats rock on: a paused game passes no time. */
    update(seconds: number) {
      time.value += seconds;
    },
  };
}
