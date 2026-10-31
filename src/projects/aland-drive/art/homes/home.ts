import type { RoadsideModel } from "../roadside/index";
import type { V3 } from "../roadside/mesh";
import type { Room, RoomCamera } from "./rooms";

/*
 * What a home is to the game: an outside to place, where things are on its plot, and
 * its rooms, built only when someone goes in. Everything on the plot is in the model's
 * frame: +z faces the road, -z the water or the back, ground at y = 0.
 */

export interface HomeSite {
  /** The plot the model needs, as half sizes in x and z, jetty and all. */
  halfPlot: readonly [x: number, z: number];
  /** Where land meets water, for homes on the shore: the model's ground is land on the +z side of it. */
  shoreZ: number | null;
  /** Where a player walks in. */
  frontDoor: V3;
  /** Where a car drives in, and how wide the door is. */
  garageDoor: { at: V3; wide: number };
  /** Good views of the outside, for a showroom or a loading screen. */
  views: RoomCamera[];
}

export interface Home {
  id: string;
  name: string;
  /** Its place on the ladder, 1 the cheapest. */
  tier: number;
  site: HomeSite;
  exterior: () => RoadsideModel;
  interior: () => Room[];
}

export const trianglesOf = ({ near }: RoadsideModel) => (near.index?.count ?? 0) / 3;
