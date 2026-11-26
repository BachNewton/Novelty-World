import type { CharacterId } from "./characters";

/** The character the player walks as. */
export const PLAYER_CHARACTER: CharacterId = "female-f";

/** A character standing idle in the world, at a point on the ground, looking toward another. */
export interface Villager {
  character: CharacterId;
  x: number;
  z: number;
  looks: readonly [number, number];
}

/** Which way a villager faces, as a turn about y: a character faces +z unturned. */
export function yawOf(villager: Villager): number {
  return Math.atan2(villager.looks[0] - villager.x, villager.looks[1] - villager.z);
}

/** Every character but the player's, each somewhere in or round the village, by what stands there. */
export const VILLAGERS: readonly Villager[] = [
  // Keeping the market stalls, each at the corner of their stall talking to a customer at its counter.
  { character: "male-a", x: -1.1, z: 1.1, looks: [-0.5, 2.6] },
  { character: "female-a", x: -0.5, z: 2.6, looks: [-1.5, 2.5] },
  { character: "male-b", x: 2.1, z: 1.1, looks: [1.4, 2.4] },
  { character: "female-e", x: 1.4, z: 2.4, looks: [2.5, 2.5] },
  // Two neighbours talking under the lanterns, on the way to the windmill.
  { character: "female-c", x: -0.6, z: -3.1, looks: [0.3, -3.5] },
  { character: "female-d", x: 0.3, z: -3.5, looks: [-0.6, -3.1] },
  // The miller at the windmill's door.
  { character: "female-b", x: -0.5, z: -7.3, looks: [-0.5, 0] },
  // The innkeeper out front.
  { character: "male-d", x: -5.5, z: -2.3, looks: [-3, 0] },
  // The cottage's owner, chatting with a soldier at the door.
  { character: "male-c", x: 2.5, z: -1.3, looks: [3.3, -0.7] },
  { character: "soldier", x: 3.3, z: -0.7, looks: [2.5, -1.3] },
  // Someone by the cart.
  { character: "male-f", x: 6.4, z: -3.1, looks: [5.5, -3.5] },
  // The miller's hand at the mill house's door, and a robot watching its wheel turn.
  { character: "male-e", x: 5.3, z: -0.3, looks: [0, 0] },
  { character: "robot", x: 11.7, z: -0.5, looks: [9, -0.5] },
  // A knight waiting at the smithy's door, and a worker in its yard by the cart.
  { character: "knight", x: -3.3, z: 3.5, looks: [-5, 3.5] },
  { character: "worker", x: -4.6, z: 6.4, looks: [-5.5, 5.5] },
  // The lookout's guard, in the gap in the hedge before its door.
  { character: "male-g", x: 5.5, z: 3.6, looks: [5.5, 0] },
  // Out among the trees.
  { character: "zombie", x: -9.6, z: 8.7, looks: [-8.5, 7.5] },
  { character: "alien", x: 11.5, z: 6, looks: [11.5, 4.5] },
  { character: "raider", x: 8, z: 11.3, looks: [9.5, 10.5] },
];
