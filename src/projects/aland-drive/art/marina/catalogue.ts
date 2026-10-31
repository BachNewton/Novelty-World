import type { RoadsideModel } from "../roadside/index";
import { buildAnchorMonument, buildBoatInCradle, buildBoatTrolley, buildBoatWinterCover, buildCairn, buildCannon, buildCradle, buildDinghyRack, buildFigurehead, buildFingerPontoon, buildFishBoxes, buildFixedMark, buildFlagMast, buildFloatHeap, buildFuelBerth, buildGuestHarbourSign, buildHarbourHut, buildHistoricShedRow, buildHullOnStocks, buildLeadingMark, buildMastRack, buildMooringRing, buildNetMarker, buildPilotStation, buildPillarBuoy, buildPropellerMonument, buildRopewalkShed, buildPyramidBeacon, buildServicePedestal, buildSlipway, buildSkerryLight, buildSmithy, buildSmokehouse, buildSpar, buildSteamBox, buildTarPot, buildTimberStack, buildTravelLift, buildWalkwayGate, buildWheelSign, SEA_MARKS } from "./index";

export interface Entry {
  name: string;
  limit: number;
  model: RoadsideModel;
}

/** Every model the kit builds with its near-triangle limit, for the budget test and the gallery's counts. */
export function catalogue(): Entry[] {
  const small = (name: string, model: RoadsideModel) => ({ name, limit: 150, model });
  /** One-off pieces, a few in the world rather than hundreds. */
  const piece = (name: string, model: RoadsideModel) => ({ name, limit: 320, model });
  const shed = (name: string, model: RoadsideModel) => ({ name, limit: 800, model });
  const hero = (name: string, model: RoadsideModel) => ({ name, limit: 1500, model });
  return [
    small("finger pontoon", buildFingerPontoon()),
    small("walkway gate", buildWalkwayGate()),
    small("power pedestal", buildServicePedestal("power")),
    small("water pedestal", buildServicePedestal("water")),
    shed("harbour hut", buildHarbourHut()),
    shed("fuel berth", buildFuelBerth()),
    piece("dinghy rack", buildDinghyRack()),
    piece("slipway", buildSlipway()),
    piece("rail trolley", buildBoatTrolley("rail")),
    small("launching trolley", buildBoatTrolley("launching")),
    shed("travel lift", buildTravelLift()),
    piece("guest harbour sign", buildGuestHarbourSign()),
    piece("flag mast", buildFlagMast()),
    piece("cradle", buildCradle()),
    shed("boat in cradle", buildBoatInCradle()),
    shed("boat under blue tarp", buildBoatWinterCover("tarp-blue")),
    shed("boat under green tarp", buildBoatWinterCover("tarp-green")),
    shed("boat shrink-wrapped", buildBoatWinterCover("shrink")),
    piece("mast rack", buildMastRack()),
    hero("hull on stocks", buildHullOnStocks()),
    piece("sawn timber stack", buildTimberStack("sawn")),
    small("log stack", buildTimberStack("logs")),
    piece("steam box", buildSteamBox()),
    piece("tar pot", buildTarPot()),
    shed("smithy", buildSmithy()),
    shed("ropewalk shed", buildRopewalkShed()),
    shed("boat shed row", buildHistoricShedRow()),
    ...SEA_MARKS.map((mark) => small(`spar ${mark}`, buildSpar(mark))),
    ...SEA_MARKS.map((mark) => small(`pillar ${mark}`, buildPillarBuoy(mark))),
    piece("fixed north", buildFixedMark("north")),
    piece("leading front", buildLeadingMark("front")),
    piece("leading rear", buildLeadingMark("rear")),
    piece("cairn", buildCairn(3)),
    piece("pyramid beacon", buildPyramidBeacon()),
    shed("skerry light", buildSkerryLight()),
    hero("pilot station", buildPilotStation()),
    small("fish boxes", buildFishBoxes()),
    piece("smokehouse", buildSmokehouse()),
    small("float heap", buildFloatHeap()),
    small("net marker", buildNetMarker()),
    piece("admiralty anchor", buildAnchorMonument("admiralty")),
    piece("stockless anchor", buildAnchorMonument("stockless")),
    piece("propeller", buildPropellerMonument()),
    piece("cannon", buildCannon()),
    piece("figurehead", buildFigurehead()),
    piece("wheel sign", buildWheelSign()),
    small("mooring ring", buildMooringRing()),
  ];
}
