import type { CarId } from "../sim/cars";
import type { Difficulty } from "./targets";
import type { ChallengeKind, ScenePoint } from "./types";

/*
 * The first list (`ideas/bucket-list.md`), as written by hand: each challenge's
 * title, kind, car, and the waypoints its route is routed through, picked on
 * the game's own road map. Everything measured from the roads (the start
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
    id: "backrace-climb",
    title: "Climb the Backrace road",
    kind: "route",
    car: "bris",
    where: "Norra Sundsvägen, Sund: its longest climb, the two kilometres up to the top before Faderviksvägen's mouth. The race's own ends aren't on the map",
    waypoints: [
      { x: 11343, z: -10553 },
      { x: 12785, z: -10623 },
    ],
    difficulty: "medium",
  },
  {
    id: "soltuna-climb",
    title: "Climb to Soltuna",
    kind: "route",
    car: "sten",
    where: "Getabergsvägen, Geta: from Södravägen up to the Getabergen tower",
    waypoints: [
      { x: -4066, z: -24575 },
      { x: -3955, z: -25700 },
    ],
    difficulty: "medium",
  },
  {
    id: "getavagen-streetrace",
    title: "165 in 201 metres on Getavägen",
    kind: "speed-trap",
    car: "sund",
    where: "Getavägen, Finström: north from the Pålsböle junction towards Törnebolstad, the Streetrace's 201 m from a standing start. The record was nearly 200 km/h; the fastest car here reaches about 169 in that distance",
    waypoints: [
      { x: 650, z: -13080 },
      { x: 723, z: -13425 },
    ],
    lengthM: 201,
    difficulty: "hard",
  },
  {
    id: "hammarbo-201",
    title: "201 metres at Hammarbo",
    kind: "route",
    car: "strom",
    where: "Hammarlandsvägen at Hammarbo, Hammarland: from Skarpnåtövägen towards Mejerigatan, from a standstill",
    waypoints: [
      { x: -10421, z: -6318 },
      { x: -11486, z: -7560 },
    ],
    lengthM: 201,
    difficulty: "easy",
  },
  {
    id: "lemland-speeding",
    title: "Caught doing 144 through Lemland",
    kind: "speed-trap",
    car: "salta",
    where: "Lemlandsvägen, Lemland: east along its long fast stretch, to where the estate is at its fastest. The real story's 145 is past what the target rule gives it there",
    waypoints: [
      { x: 3474, z: 11129 },
      { x: 13450, z: 10338 },
    ],
    lengthM: 2300,
    difficulty: "hard",
  },
  {
    id: "storagatan",
    title: "Storagatan, harbour to harbour",
    kind: "route",
    car: "vik",
    where: "Storagatan, Mariehamn: Österhamn to Västerhamn, west, since its last block is one way",
    waypoints: [
      { x: -1925, z: 6781 },
      { x: -2845, z: 6794 },
    ],
    difficulty: "easy",
  },
  {
    id: "castle-to-fortress",
    title: "Castle to fortress",
    kind: "route",
    car: "ankar",
    where: "Kastelholm Castle to Bomarsund Fortress, Sund: Slottsvägen, then Sundsvägen east",
    waypoints: [
      { x: 7291, z: -7453 },
      { x: 15691, z: -4259 },
    ],
    difficulty: "medium",
  },
  {
    id: "orrdalsklint",
    title: "Up Orrdalsklint",
    kind: "route",
    car: "berg",
    where: "Saltvik: the forest track up to the Orrdalsklint viewpoint, the main island's highest point",
    waypoints: [
      { x: 10960, z: -16520 },
      { x: 10922, z: -17679 },
      { x: 10460, z: -17895 },
    ],
    difficulty: "easy",
  },
  {
    id: "mockelobacken",
    title: "Möckelöbacken",
    kind: "speed-trap",
    car: "holm",
    where: "Hammarlandsvägen at Möckelö, Jomala: north-west from the Flygfältsrondellen roundabout, the Streetrace's 201 m from a standing start",
    waypoints: [
      { x: -3480, z: 4949 },
      { x: -3910, z: 5205 },
    ],
    lengthM: 201,
    difficulty: "easy",
  },
  {
    id: "road-2-flat-out",
    title: "Road 2, flat out",
    kind: "speed-trap",
    car: "fjard",
    where: "Nya Godbyvägen, Jomala: north along its longest straight",
    waypoints: [
      { x: -356, z: -2535 },
      { x: -325, z: -4106 },
    ],
    lengthM: 1500,
    difficulty: "medium",
  },
  {
    id: "post-road-west",
    title: "Post road, the western leg",
    kind: "route",
    car: "kobb",
    where: "Eckerö: from the Post and Customs House along Gamla Postrotevägen and Eckerövägen, the post road's line, to over the Marsund bridge",
    waypoints: [
      { x: -22515, z: -9410 },
      { x: -22336, z: -9369 },
      { x: -22257, z: -9503 },
      { x: -15235, z: -8160 },
    ],
    difficulty: "easy",
  },
];
