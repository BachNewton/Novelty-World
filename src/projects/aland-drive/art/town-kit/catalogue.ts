import { nearFar, type ArtModel } from "../catalogue";
import { buildBalticFerry, buildBicycle, buildRoadFerry, buildHangingLamp, buildStreetNamePlate, buildStreetNamePost, buildTerminal, buildTownLamp, buildTrafficLight, buildVillagePlate, buildVillageSign, buildWindowBox } from "./index";
import { townMaterials, trafficLightMaterials } from "./material";

/** Every model the town kit's gallery shows. Its bus shelter, street lamp, bench, rack and planter are the roadside's and street's. */
export const artModels = (): ArtModel[] => [
  nearFar("terminal", buildTerminal(), townMaterials),
  nearFar("Baltic ferry", buildBalticFerry(), townMaterials),
  nearFar("road ferry", buildRoadFerry(), townMaterials),
  nearFar("town lamp", buildTownLamp(), townMaterials),
  nearFar("hanging lamp", buildHangingLamp(), townMaterials),
  { ...nearFar("window box red", buildWindowBox("bloom-red"), townMaterials), onGround: false },
  { ...nearFar("window box white", buildWindowBox("bloom-white", 9), townMaterials), onGround: false },
  nearFar("traffic light", buildTrafficLight(), trafficLightMaterials),
  nearFar("street name post", buildStreetNamePost(), townMaterials),
  nearFar("street name plate", buildStreetNamePlate(), townMaterials),
  ...(["bike-red", "bike-blue", "bike-black"] as const).map((frame) => nearFar(`bicycle ${frame}`, buildBicycle(frame), townMaterials)),
  nearFar("village sign", buildVillageSign(), townMaterials),
  nearFar("village plate", buildVillagePlate(), townMaterials),
];
