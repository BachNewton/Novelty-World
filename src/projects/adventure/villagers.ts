import type { CharacterId } from "./characters";

/** The character the player walks as. */
export const PLAYER_CHARACTER: CharacterId = "female-f";

/** The character a second player walks as: the villager by the cart, who steps out of the village while they play. */
export const SECOND_PLAYER_CHARACTER: CharacterId = "male-f";

/** Who a second player walks as: the villager by the cart, unless the first plays as him, and then the first's own character, so the two are never one. */
export const secondPlayerOf = (first: CharacterId): CharacterId => (first === SECOND_PLAYER_CHARACTER ? PLAYER_CHARACTER : SECOND_PLAYER_CHARACTER);

/** The town kit's seats, by the height of their tops, measured from their files. */
export const SEATS = { "stall-bench": 0.226, "stall-stool": 0.226 } as const;
export type Seat = keyof typeof SEATS;

/**
 * A character in the world, looking toward a point: standing idle on the ground
 * at a point, or sitting on the seat whose middle is at that point.
 */
export interface Villager {
  character: CharacterId;
  x: number;
  z: number;
  looks: readonly [number, number];
  sits?: Seat;
}

/** Which way a villager or an animal faces, as a turn about y: a character, and an animal, faces +z unturned. */
export function yawOf({ x, z, looks }: Pick<Villager, "x" | "z" | "looks">): number {
  return Math.atan2(looks[0] - x, looks[1] - z);
}

/** Every character but the player's, each somewhere in or round the village, by what stands there. */
export const VILLAGERS: readonly Villager[] = [
  // Keeping the market stalls, sat behind them on the bench and the stool, a customer at each counter.
  { character: "male-a", x: -2.5, z: 2.22, looks: [0, 2.22], sits: "stall-bench" },
  { character: "female-a", x: -0.5, z: 2.6, looks: [-1.5, 2.5] },
  { character: "male-b", x: 3.5, z: 2.5, looks: [0, 2.5], sits: "stall-stool" },
  { character: "female-e", x: 1.4, z: 2.4, looks: [2.5, 2.5] },
  // A neighbour sat beside the red stall's keeper, and another stopped by the bench to talk to them.
  { character: "female-c", x: -2.5, z: 2.78, looks: [0, 2.78], sits: "stall-bench" },
  { character: "female-d", x: -2.4, z: 3.6, looks: [-2.5, 2.6] },
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
  { character: "zombie", x: -6.4, z: 15.2, looks: [-5.5, 16.5] },
  { character: "alien", x: 11.5, z: 7, looks: [11.5, 5.5] },
  { character: "raider", x: 15.2, z: 13.4, looks: [15.5, 12.5] },
];
