import { nearFar, type ArtModel } from "../catalogue";
import { buildBridge, buildBusShelter, buildFarmFence, buildFarmFencePost, buildGangway, buildMailbox, buildPier, buildPontoon, buildPowerPole, buildStreetLamp, buildTownFence, buildTownFencePost, buildWireSpan } from "./index";
import { roadsideMaterials } from "./material";

/** Every model the roadside gallery shows. The signs are `art/surfaces`' own. */
export const artModels = (): ArtModel[] => [
  nearFar("street lamp", buildStreetLamp(), roadsideMaterials),
  nearFar("power pole", buildPowerPole(), roadsideMaterials),
  nearFar("wire span", buildWireSpan(), roadsideMaterials),
  { ...nearFar("farm fence", buildFarmFence(), roadsideMaterials), laid: {} },
  nearFar("farm fence post", buildFarmFencePost(), roadsideMaterials),
  { ...nearFar("town fence", buildTownFence(), roadsideMaterials), laid: {} },
  nearFar("town fence post", buildTownFencePost(), roadsideMaterials),
  nearFar("mailbox", buildMailbox(), roadsideMaterials),
  nearFar("bus shelter", buildBusShelter(), roadsideMaterials),
  nearFar("bridge 48 × 7 m", buildBridge({ spanM: 48, widthM: 7, dropM: 5 }), roadsideMaterials),
  nearFar("pier 32 × 3 m", buildPier({ lengthM: 32, widthM: 3 }), roadsideMaterials),
  nearFar("pier 60 × 8 m", buildPier({ lengthM: 60, widthM: 8 }), roadsideMaterials),
  nearFar("pontoon 24 × 2.6 m", buildPontoon({ lengthM: 24, widthM: 2.6 }), roadsideMaterials),
  nearFar("gangway 6 m", buildGangway(6), roadsideMaterials),
];
