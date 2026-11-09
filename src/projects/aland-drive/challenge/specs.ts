import type { CarId } from "../sim/cars";
import { conditions, type ChallengeConditions } from "./conditions";
import type { BucketChallenge, ScenePoint } from "./types";

/*
 * The list (`ideas/bucket-list.md`), as written by hand: each challenge's
 * title, kind, car, the waypoints its route is routed through, picked on the
 * game's own road map, and its conditions, the date, hour and weather it is
 * played in. A car suits its road, as Forza's did: a gravel road gets a car
 * made for gravel. Everything measured from the roads (the start places, the
 * gates, the camera) is `places.json`, written from these by
 * `tools/challenge-places.ts`; par and the target are `targets.json`, the AI
 * racer's best clean run in the challenge's conditions, from
 * `tools/challenge-par.ts`.
 */

export interface ChallengeSpec {
  id: string;
  title: string;
  kind: BucketChallenge["kind"];
  car: CarId;
  where: string;
  waypoints: ScenePoint[];
  /** How far from the start the finish or the camera is, where it isn't the route's last waypoint. */
  lengthM?: number;
  conditions: ChallengeConditions;
}

export const CHALLENGE_SPECS: readonly ChallengeSpec[] = [
  {
    id: "streetrace-hammarbo",
    title: "Do 200 in 201 metres where the Streetrace was rained off",
    kind: "speed-trap",
    car: "blixt",
    where: "Hammarlandsvägen, road 1, at Hammarbo, Hammarland: the Streetrace's straight in 2025 and 2026, between Skarpnåtövägen and Mejerigatan, 201 m from a standstill. The 2026 meeting, on 29 August, was rained off with no race run",
    waypoints: [
      { x: -10421, z: -6318 },
      { x: -11486, z: -7560 },
    ],
    lengthM: 201,
    conditions: conditions("2026-08-29", 19, "rain"),
  },
  {
    id: "ship-at-three",
    title: "Catch the ship that calls at three",
    kind: "route",
    car: "aska",
    where: "Lemlandsvägen and Långnäsvägen, road 3, from Lemland church east across the parish to the ferry harbour at Långnäs, on the midsummer night that never darkens. The run to Långnäs from Mariehamn itself is 26 km, too long for one attempt, so it starts at the church",
    waypoints: [
      { x: 5372, z: 10820 },
      { x: 6856, z: 10912 },
      { x: 8293, z: 10557 },
      { x: 9781, z: 10693 },
      { x: 11274, z: 10599 },
      { x: 12755, z: 10450 },
      { x: 14052, z: 10032 },
      { x: 15433, z: 9756 },
      { x: 15944, z: 8373 },
      { x: 16758, z: 7187 },
      { x: 17826, z: 6652 },
    ],
    conditions: conditions("2026-06-22", 2.5, "clear"),
  },
  {
    id: "godby-to-geta-fog",
    title: "Godby to Geta in the September fog",
    kind: "route",
    car: "virvel",
    where: "Getavägen, road 4, north from Godby past Stallhagen's brewery, Finström church at Pålsböle and the 2024 Streetrace's straight at Törnebolstad, into the fog towards Geta. The whole road is 21 km; this is its first 9, and the snowstorm takes the rest",
    waypoints: [
      { x: 2171, z: -7562 },
      { x: 2091, z: -7681 },
      { x: 1396, z: -8832 },
      { x: 743, z: -9812 },
      { x: 77, z: -11038 },
      { x: -542, z: -12211 },
      { x: 616, z: -13041 },
      { x: 887, z: -14502 },
    ],
    conditions: conditions("2026-09-20", 6.5, "fog"),
  },
  {
    id: "eckero-boat-rain",
    title: "Make the Eckerö boat in the rain",
    kind: "route",
    car: "orkan",
    where: "Hammarlandsvägen and Eckerövägen, road 1, west from Hammarland over the Marsund bridge to the ferry harbour at Eckerö's Storby, at dusk",
    waypoints: [
      { x: -12580, z: -7820 },
      { x: -21869, z: -9651 },
    ],
    conditions: conditions("2026-10-14", 17.5, "rain"),
  },
  {
    id: "road-2-midnight",
    title: "Light up road 2 at midnight",
    kind: "speed-trap",
    car: "varg",
    where: "Nya Godbyvägen, road 2, Jomala: north along its longest straight, the Streetrace's road in 2021 and 2022",
    waypoints: [
      { x: -356, z: -2535 },
      { x: -325, z: -4106 },
    ],
    lengthM: 1500,
    conditions: conditions("2026-07-18", 23.5, "clear"),
  },
  {
    id: "castle-to-fortress-sunset",
    title: "Castle to fortress at sunset",
    kind: "route",
    car: "dyning",
    where: "Kastelholm Castle to Bomarsund Fortress, Sund: Slottsvägen, then Sundsvägen east, into the sunset's last light",
    waypoints: [
      { x: 7291, z: -7453 },
      { x: 15691, z: -4259 },
    ],
    conditions: conditions("2026-08-10", 20.75, "clear"),
  },
  {
    id: "backrace-weekend",
    title: "Take the Backrace road on Backrace weekend",
    kind: "route",
    car: "strimma",
    where: "Norra Sundsvägen, Sund: the hill race's road, from road 2 east to the top before Faderviksvägen's mouth, wet under an October sky",
    waypoints: [
      { x: 7446, z: -8026 },
      { x: 12785, z: -10623 },
    ],
    conditions: conditions("2026-10-10", 14, "overcast-wet"),
  },
  {
    id: "hultvagen-dawn",
    title: "Barely a body down Hultvägen",
    kind: "route",
    car: "span",
    where: "Hultvägen, Sund, at five on a July morning",
    waypoints: [
      { x: 14979, z: -8968 },
      { x: 16228, z: -11279 },
    ],
    conditions: conditions("2026-07-02", 5, "clear"),
  },
  {
    id: "painters-light",
    title: "Chase the painters' light round Önningeby",
    kind: "route",
    car: "sund",
    where: "Önningebyvägen south through Önningeby, where the artists' colony painted from the 1880s, then Lemlandsvägen on towards Lemland, in the midsummer golden hour",
    waypoints: [
      { x: -814, z: 1389 },
      { x: 1999, z: 4308 },
      { x: 1753, z: 5600 },
      { x: 2247, z: 7586 },
    ],
    conditions: conditions("2026-06-24", 22, "clear"),
  },
  {
    id: "jarso-sunrise",
    title: "Island to island to Järsö at sunrise",
    kind: "route",
    car: "brus",
    where: "Järsövägen south from Mariehamn over the bridges and causeways between the islands, to Järsö",
    waypoints: [
      { x: -1597, z: 9545 },
      { x: -1491, z: 9651 },
      { x: -1498, z: 10966 },
      { x: -826, z: 12223 },
      { x: -1377, z: 13554 },
      { x: -475, z: 14618 },
      { x: 411, z: 15386 },
      { x: 509, z: 15124 },
    ],
    conditions: conditions("2026-05-15", 4.75, "clear"),
  },
  {
    id: "geta-snowstorm",
    title: "Get the family to Geta in a snowstorm",
    kind: "route",
    car: "flod",
    where: "Getavägen, road 4, the second half of the apple-orchard road, north to Geta church after dark, on winter tyres. From Finström church it is 17 km, so it starts where the fog run ends",
    waypoints: [
      { x: 1012, z: -15995 },
      { x: 528, z: -17349 },
      { x: -292, z: -18572 },
      { x: -96, z: -20026 },
      { x: 187, z: -21454 },
      { x: 83, z: -22936 },
      { x: -1012, z: -23837 },
      { x: -2198, z: -24672 },
      { x: -3660, z: -24676 },
    ],
    conditions: conditions("2027-01-12", 15, "snowfall"),
  },
  {
    id: "ytterby-rallysprint",
    title: "Run the Ytterby stage on rallysprint day",
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
    conditions: conditions("2026-07-25", 10, "clear"),
  },
  {
    id: "notviken-night-rain",
    title: "Rally Nötviken's forest by night in the rain",
    kind: "route",
    car: "hagel",
    where: "Nötviken, Sund: the gravel road through the forest to the bay",
    waypoints: [
      { x: 13348, z: -9610 },
      { x: 14600, z: -14000 },
    ],
    conditions: conditions("2026-10-24", 21, "rain"),
  },
  {
    id: "vessingsboda-folkrace",
    title: "Open the folkrace season at Vessingsboda",
    kind: "route",
    car: "gnista",
    where: "Hagsviksvägen and Norra Byvägen, Lemland: the gravel lanes beside Motorstadion, where the folkrace season opens",
    waypoints: [
      { x: 11969, z: 12841 },
      { x: 11306, z: 13394 },
      { x: 10531, z: 12865 },
      { x: 11413, z: 11945 },
    ],
    conditions: conditions("2026-04-25", 10, "overcast-wet"),
  },
  {
    id: "djurvik-first-snow",
    title: "Plough to Djurvik in the first snow",
    kind: "route",
    car: "dyn",
    where: "Djurvikvägen, Hammarland: the gravel out to the shore at Djurvik, on winter tyres",
    waypoints: [
      { x: -10774, z: 4515 },
      { x: -13494, z: 2391 },
    ],
    conditions: conditions("2026-11-18", 13, "snowfall"),
  },
  {
    id: "kullskar-fog",
    title: "Out to Kullskär through the morning fog",
    kind: "route",
    car: "borg",
    where: "Alskog and Kullskärsvägen, Hammarland's west coast: the gravel out to Kullskär",
    waypoints: [
      { x: -14128, z: -1950 },
      { x: -13417, z: -2806 },
      { x: -12362, z: -2548 },
      { x: -12407, z: -959 },
    ],
    conditions: conditions("2026-05-08", 6, "fog"),
  },
  {
    id: "orrdalsklint-climb",
    title: "Climb to the old shore at Orrdalsklint",
    kind: "route",
    car: "knott",
    where: "Saltvik: Västergatan's gravel and the forest track up Orrdalsklint, Åland's highest point, where the first people camped on what was then the shore",
    waypoints: [
      { x: 10114, z: -15190 },
      { x: 10573, z: -16322 },
      { x: 10881, z: -16896 },
      { x: 10922, z: -17679 },
      { x: 10453, z: -17901 },
    ],
    conditions: conditions("2026-06-01", 7, "clear"),
  },
  {
    id: "mockelo-straight",
    title: "Bring a legend to the Möckelö straight",
    kind: "speed-trap",
    car: "altura",
    where: "Hammarlandsvägen, road 1, at Möckelöbacken, Jomala: west from Flygfältsrondellen along the Streetrace's 2023 straight",
    waypoints: [
      { x: -3480, z: 4950 },
      { x: -4914, z: 5274 },
    ],
    lengthM: 900,
    conditions: conditions("2026-06-10", 20, "clear"),
  },
  {
    id: "degersand-group-b",
    title: "Let Group B loose at Degersand",
    kind: "route",
    car: "frost",
    where: "Skeppsviksvägen, Långnabbavägen and Degersandsvägen, Eckerö's south-west, gravel and tarmac on the Potato Race weekend",
    waypoints: [
      { x: -21189, z: -5084 },
      { x: -21744, z: -4265 },
      { x: -21712, z: -3076 },
      { x: -20596, z: -3357 },
      { x: -20239, z: -4704 },
    ],
    conditions: conditions("2026-10-03", 16, "overcast-wet"),
  },
  {
    id: "post-road-old-way",
    title: "Carry the post the old way",
    kind: "route",
    car: "lontano",
    where: "Eckerö: from the Post and Customs House along Gamla Postrotevägen and Eckerövägen, the post road's line, to over the Marsund bridge",
    waypoints: [
      { x: -22515, z: -9410 },
      { x: -22336, z: -9369 },
      { x: -22257, z: -9503 },
      { x: -15235, z: -8160 },
    ],
    conditions: conditions("2026-05-20", 10, "clear"),
  },
  {
    id: "harbour-cruise",
    title: "Cruise harbour to harbour, the Saturday-night way",
    kind: "route",
    car: "kraft",
    where: "Mariehamn: Storagatan from Österhamn to Västerhamn, then north along the western harbour on Sjöpromenaden, after the car show",
    waypoints: [
      { x: -1903, z: 6780 },
      { x: -2500, z: 6788 },
      { x: -2860, z: 6823 },
      { x: -2900, z: 6745 },
      { x: -2847, z: 5755 },
    ],
    conditions: conditions("2026-07-18", 18.5, "clear"),
  },
  {
    id: "getabergen-peoples-car",
    title: "Get the people's car up Getabergen",
    kind: "route",
    car: "kula",
    where: "Geta: from Geta church up Getabergsvägen to Soltuna at the top, where the Backrace began",
    waypoints: [
      { x: -3817, z: -24611 },
      { x: -3980, z: -25729 },
    ],
    conditions: conditions("2026-08-15", 12, "cloud"),
  },
  {
    id: "lemland-145",
    title: "Beat the 145 through Lemland",
    kind: "speed-trap",
    car: "salta",
    where: "Lemlandsvägen, Lemland: east along its long fast stretch, to where the old estate is at its fastest. 145 km/h was a real news story's speed",
    waypoints: [
      { x: 3474, z: 11129 },
      { x: 13450, z: 10338 },
    ],
    lengthM: 2300,
    conditions: conditions("2026-06-04", 13, "clear"),
  },
  {
    id: "jomala-ice",
    title: "Keep the electric saloon on the road in January ice",
    kind: "route",
    car: "strom",
    where: "Jomala: Norra Torpvägen and Södersundavägen through the farmland west of Jomala's church, the sun barely up",
    waypoints: [
      { x: -4130, z: 2250 },
      { x: -4943, z: 1273 },
      { x: -5434, z: 202 },
      { x: -4145, z: -355 },
      { x: -2692, z: -120 },
    ],
    conditions: conditions("2027-01-20", 9.5, "ice"),
  },
  {
    id: "skagvagen-sunrise",
    title: "Wring the hot hatch along Skagvägen at sunrise",
    kind: "route",
    car: "sten",
    where: "Skagvägen, Eckerö: south, the road the GPS takes between Vikvägen's two ends, at midsummer's sunrise",
    waypoints: [
      { x: -20162, z: -10114 },
      { x: -19344, z: -13501 },
    ],
    conditions: conditions("2026-06-21", 3.5, "clear"),
  },
];
