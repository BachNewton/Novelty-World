import type { AnimalId } from "./animals";

/** An animal of the Cube Pets pack, standing idle on the ground at a point, looking toward another. */
export interface Beast {
  animal: AnimalId;
  x: number;
  z: number;
  looks: readonly [number, number];
  /** How far below the surface under it it stands, for an animal in water: a fish with its back out of it. */
  sunk?: number;
}

/**
 * Every animal of the pack, each where its kind belongs: the farm's at the farm,
 * pets about the village, the wild ones out in the country. Animals aren't
 * characters, so they stand apart from the villagers, with no roster of who
 * plays as whom.
 */
export const FAUNA: readonly Beast[] = [
  // In the paddock round the trough, a chick at the barn's arch, and a hog in the pen by the ditch.
  { animal: "cow", x: 6.8, z: -13.9, looks: [8, -15] },
  { animal: "pig", x: 9.2, z: -16.2, looks: [8, -15] },
  { animal: "chick", x: -3.3, z: -13.6, looks: [-4, -14.5] },
  { animal: "hog", x: 37.5, z: 9.5, looks: [36, 9.5] },
  // The innkeeper's dog at his feet, and a cat at the market, looking up at a customer.
  { animal: "dog", x: -4.9, z: -1.7, looks: [-5.5, -2.3] },
  { animal: "cat", x: 0.6, z: 3.4, looks: [1.4, 2.4] },
  // A bunny at the kitchen garden's carrots, and a caterpillar at its greens.
  { animal: "bunny", x: 21.2, z: 8.5, looks: [21.5, 7.6] },
  { animal: "caterpillar", x: 21.5, z: 12.3, looks: [21.5, 11.5] },
  // In the meadow, a bee among the flowers and a giraffe grazing.
  { animal: "bee", x: 3.2, z: 23, looks: [2.3, 23.5] },
  { animal: "giraffe", x: 8.6, z: 22.6, looks: [7.3, 21.4] },
  // The oasis: a parrot and a monkey under the palms, an elephant come to drink, and a lion watching it from the ledge.
  { animal: "parrot", x: 29.5, z: 33.7, looks: [29.5, 31] },
  { animal: "monkey", x: 27.6, z: 33.6, looks: [26.7, 33.4] },
  { animal: "elephant", x: 29.8, z: 28.35, looks: [29.8, 29.6] },
  { animal: "lion", x: 28.5, z: 26.5, looks: [29.8, 28.35] },
  // In the woods: a tiger in the wildwood, a deer among the autumn trees, a fox in the trees north of the farm, a koala at a pine.
  { animal: "tiger", x: -24.5, z: -22.5, looks: [-22, -22] },
  { animal: "deer", x: 30, z: -20, looks: [32, -21] },
  { animal: "fox", x: 10, z: -26, looks: [8, -24] },
  { animal: "koala", x: -36, z: -15, looks: [-35.5, -15.4] },
  // By the water: a polar bear at the waterfall's pool, a beaver on the river's bank, and at the lake a panda in the bamboo, a penguin at the jetty's end, a crab on the sand and a fish in the water.
  { animal: "polar", x: -29.6, z: -29.8, looks: [-31.5, -30.5] },
  { animal: "beaver", x: -30.6, z: -7.5, looks: [-31.5, -7.5] },
  { animal: "panda", x: -36.9, z: 15.2, looks: [-37.5, 16.2] },
  { animal: "penguin", x: -29.5, z: 22.3, looks: [-29.5, 25] },
  { animal: "crab", x: -25.6, z: 22.4, looks: [-28, 22.4] },
  { animal: "fish", x: -33, z: 23, looks: [-30, 23], sunk: 0.2 },
];
