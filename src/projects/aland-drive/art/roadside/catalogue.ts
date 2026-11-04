import { nearFar, type ArtModel } from "../catalogue";
import { buildBridge, buildBusShelter, buildFarmFence, buildFarmFencePost, buildGangway, buildMailbox, buildPier, buildPontoon, buildPowerPole, buildStreetLamp, buildTownFence, buildTownFencePost, buildWireSpan } from "./index";

/** Every model the roadside gallery shows. The signs are `art/surfaces`' own. */
export const artModels = (): ArtModel[] => [
  nearFar("street lamp", buildStreetLamp()),
  nearFar("power pole", buildPowerPole()),
  nearFar("wire span", buildWireSpan()),
  { ...nearFar("farm fence", buildFarmFence()), laid: {} },
  nearFar("farm fence post", buildFarmFencePost()),
  { ...nearFar("town fence", buildTownFence()), laid: {} },
  nearFar("town fence post", buildTownFencePost()),
  nearFar("mailbox", buildMailbox()),
  nearFar("bus shelter", buildBusShelter()),
  nearFar("bridge 48 × 7 m", buildBridge({ spanM: 48, widthM: 7, dropM: 5 })),
  nearFar("pier 32 × 3 m", buildPier({ lengthM: 32, widthM: 3 })),
  nearFar("pier 60 × 8 m", buildPier({ lengthM: 60, widthM: 8 })),
  nearFar("pontoon 24 × 2.6 m", buildPontoon({ lengthM: 24, widthM: 2.6 })),
  nearFar("gangway 6 m", buildGangway(6)),
];
