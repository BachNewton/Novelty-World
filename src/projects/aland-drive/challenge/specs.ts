import type { CarId } from "../sim/cars";
import type { Difficulty } from "./targets";
import type { ChallengeKind, ScenePoint } from "./types";

/*
 * The list (`ideas/bucket-list.md`), as written by hand: each challenge's
 * title, kind, car, and the waypoints its route is routed through,
 * picked on the game's own road map. A car suits its road, as Forza's did: a
 * gravel road gets a car made for gravel, and what makes one hard is its target. Everything measured from the roads (the start
 * places, the gates, the camera) is `places.json`, written from these by
 * `tools/challenge-places.ts`; par and the target are `targets.json`, from
 * `tools/challenge-par.ts`, by the difficulty asked for here.
 */

export interface ChallengeSpec {
  id: string;
  title: string;
  kind: ChallengeKind;
  car: CarId;
  where: string;
  waypoints: ScenePoint[];
  /** How far from the start the finish or the camera is, where it isn't the route's last waypoint. */
  lengthM?: number;
  difficulty: Difficulty;
}

export const CHALLENGE_SPECS: readonly ChallengeSpec[] = [
  {
    id: "ytterby-sprint",
    title: "Run the Ytterby sprint stage",
    kind: "route",
    car: "grus",
    where: "Tomtbergsvägen and Ljufviksvägen, Jomala: the Rallysprint's gravel stage, joined by the service road the map has between them",
    waypoints: [
      { x: 2136, z: 380 },
      { x: 2121, z: 890 },
      { x: 2871, z: 1321 },
      { x: 1467, z: 1688 },
      { x: 1130, z: 1802 },
    ],
    difficulty: "hard",
  },
  {
    id: "backrace-road",
    title: "Take the Backrace road flat out",
    kind: "route",
    car: "sund",
    where: "Norra Sundsvägen, Sund: the hill race's road, from road 2 east to the top before Faderviksvägen's mouth",
    waypoints: [
      { x: 7446, z: -8026 },
      { x: 12785, z: -10623 },
    ],
    difficulty: "hard",
  },
  {
    id: "langnas-ferry",
    title: "Get the V12 to Långnäs before the boat",
    kind: "route",
    car: "ankar",
    where: "Ängösundsvägen, Lumparland: the main road out to the ferry harbour at Långnäs",
    waypoints: [
      { x: 15917, z: 6654 },
      { x: 17871, z: 2601 },
    ],
    difficulty: "hard",
  },
  {
    id: "djurvik",
    title: "Find Djurvik in the old four-by-four",
    kind: "route",
    car: "berg",
    where: "Djurvikvägen, Hammarland: out to the shore at Djurvik",
    waypoints: [
      { x: -10774, z: 4515 },
      { x: -13494, z: 2391 },
    ],
    difficulty: "medium",
  },
  {
    id: "notviken",
    title: "Rally the forest road to Nötviken",
    kind: "route",
    car: "grus",
    where: "Nötviken, Sund: the road through the forest to the bay",
    waypoints: [
      { x: 13348, z: -9610 },
      { x: 14600, z: -14000 },
    ],
    difficulty: "medium",
  },
  {
    id: "eckero-skagvagen",
    title: "Cruise Skagvägen through Eckerö",
    kind: "route",
    car: "bris",
    where: "Skagvägen, Eckerö: south, the road the GPS takes between Vikvägen's two ends",
    waypoints: [
      { x: -20162, z: -10114 },
      { x: -19344, z: -13501 },
    ],
    difficulty: "easy",
  },
  {
    id: "hultvagen",
    title: "Wring the hot hatch down Hultvägen",
    kind: "route",
    car: "sten",
    where: "Hultvägen, Sund",
    waypoints: [
      { x: 14979, z: -8968 },
      { x: 16228, z: -11279 },
    ],
    difficulty: "medium",
  },
  {
    id: "castle-to-fortress",
    title: "Castle to fortress along the coast",
    kind: "route",
    car: "bris",
    where: "Kastelholm Castle to Bomarsund Fortress, Sund: Slottsvägen, then Sundsvägen east",
    waypoints: [
      { x: 7291, z: -7453 },
      { x: 15691, z: -4259 },
    ],
    difficulty: "medium",
  },
  {
    id: "post-road-west",
    title: "Get the post through on the western leg",
    kind: "route",
    car: "kobb",
    where: "Eckerö: from the Post and Customs House along Gamla Postrotevägen and Eckerövägen, the post road's line, to over the Marsund bridge",
    waypoints: [
      { x: -22515, z: -9410 },
      { x: -22336, z: -9369 },
      { x: -22257, z: -9503 },
      { x: -15235, z: -8160 },
    ],
    difficulty: "medium",
  },
  {
    id: "lemland-speeding",
    title: "Beat the 145 through Lemland",
    kind: "speed-trap",
    car: "salta",
    where: "Lemlandsvägen, Lemland: east along its long fast stretch, to where the old estate is at its fastest. 145 km/h was a real news story's speed",
    waypoints: [
      { x: 3474, z: 11129 },
      { x: 13450, z: 10338 },
    ],
    lengthM: 2300,
    difficulty: "hard",
  },
  {
    id: "road-2-flat-out",
    title: "Flat out on road 2",
    kind: "speed-trap",
    car: "skerry-gt",
    where: "Nya Godbyvägen, Jomala: north along its longest straight",
    waypoints: [
      { x: -356, z: -2535 },
      { x: -325, z: -4106 },
    ],
    lengthM: 1500,
    difficulty: "hard",
  },
];
