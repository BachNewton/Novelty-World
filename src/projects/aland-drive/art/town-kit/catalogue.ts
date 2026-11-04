import { nearFar, type ArtModel } from "../catalogue";
import { buildBalticFerry, buildBicycle, buildRoadFerry, buildHangingLamp, buildStreetNamePlate, buildStreetNamePost, buildTerminal, buildTownLamp, buildTrafficLight, buildVillagePlate, buildVillageSign, buildWindowBox } from "./index";

/** Every model the town kit's gallery shows. Its bus shelter, street lamp, bench, rack and planter are the roadside's and street's. */
export const artModels = (): ArtModel[] => [
  nearFar("terminal", buildTerminal()),
  nearFar("Baltic ferry", buildBalticFerry()),
  nearFar("road ferry", buildRoadFerry()),
  nearFar("town lamp", buildTownLamp()),
  nearFar("hanging lamp", buildHangingLamp()),
  nearFar("window box red", buildWindowBox("bloom-red")),
  nearFar("window box white", buildWindowBox("bloom-white", 9)),
  nearFar("traffic light", buildTrafficLight()),
  nearFar("street name post", buildStreetNamePost()),
  nearFar("street name plate", buildStreetNamePlate()),
  ...(["bike-red", "bike-blue", "bike-black"] as const).map((frame) => nearFar(`bicycle ${frame}`, buildBicycle(frame))),
  nearFar("village sign", buildVillageSign()),
  nearFar("village plate", buildVillagePlate()),
];
