import { Lane, Voyage, type Handling, type LaneData, type Leg } from "./motion";

/*
 * Who sails which lane, and when: an invented timetable on Åland's real lines, plausible rather than true. The
 * ships call at Mariehamn and Långnäs a few times a day, never two in one approach at once, and lie at the quay
 * half an hour; Eckerö's ship crosses to Sweden three times a day; Ålandstrafiken's double-ended car ferries shuttle
 * between their terminals; the road ferries cross every twenty minutes; the excursion boats run out to their
 * islands and back. Small boats each have one trip, out and back, with a pause at the far end, on a cycle of
 * their own rolled from the lane, so a summer's day has a few under way in any one view.
 */

const MINUTE = 60;
const HOUR = 60 * MINUTE;

/** The art a vessel is drawn with, by name (`render/boats-under-way.ts` holds the models). */
export type BoatModel = "ship" | "ship-small" | "archipelago" | "cable" | "passenger" | "cruiser-sailing" | "folkboat-sailing" | "large-sailing" | "double-ender-sailing" | "allmogebat-sailing" | "launch" | "rib" | "fishing";

const handling = ([lengthM, beamM]: [number, number], cruiseMs: number, harbourMs: number, harbourM: number, accelMs2: number, lateralMs2: number, swingS: number, doubleEnded = false): Handling => ({ lengthM, beamM, cruiseMs, harbourMs, harbourM, accelMs2, lateralMs2, swingS, doubleEnded });

/** How each kind moves. The names of the lanes' vessels are `pipeline/sea_lanes.py`'s, which a test holds equal. */
export const HANDLING: Record<string, Handling> = {
  // About 17 knots through the islands, and a long, slow last mile.
  ship: handling([176, 28], 9, 2.5, 1600, 0.04, 0.12, 200),
  "ship-small": handling([124, 20], 8, 2.5, 1200, 0.05, 0.15, 160),
  archipelago: handling([62, 14], 5.5, 2, 300, 0.1, 0.25, 0, true),
  cable: handling([42, 12], 2, 1.5, 60, 0.12, 0.3, 0, true),
  passenger: handling([20, 6], 6, 2.5, 200, 0.25, 0.6, 50),
};

/** Small boats, with how often each turns up, and how each goes: under sail or with an engine. */
const SMALL: readonly { model: BoatModel; share: number; handling: Handling }[] = [
  { model: "cruiser-sailing", share: 4, handling: handling([10, 3.4], 3, 2, 0, 0.15, 0.6, 40) },
  { model: "folkboat-sailing", share: 2, handling: handling([7.7, 2.2], 2.6, 2, 0, 0.15, 0.6, 35) },
  { model: "large-sailing", share: 1, handling: handling([13.7, 4.2], 3.4, 2, 0, 0.12, 0.6, 45) },
  { model: "double-ender-sailing", share: 1, handling: handling([15.5, 4], 2.8, 2, 0, 0.1, 0.5, 50) },
  { model: "allmogebat-sailing", share: 1, handling: handling([6.2, 1.9], 2.2, 1.5, 0, 0.15, 0.6, 30) },
  { model: "launch", share: 2, handling: handling([7.25, 1.9], 4.5, 3, 0, 0.3, 1, 25) },
  { model: "rib", share: 2, handling: handling([7, 2.5], 13, 4, 0, 0.8, 2.5, 15) },
  { model: "fishing", share: 1, handling: handling([8.8, 2.9], 5, 3, 0, 0.3, 1, 30) },
];

interface Service {
  model: BoatModel;
  legs: Leg[];
  /** When each vessel on it starts its cycle, in seconds past midnight UTC (mod the period). */
  departs: number[];
  periodS: number;
}

const there = (lane: string, waitS: number): Leg[] => [
  { lane, way: "out", waitS },
  { lane, way: "in" },
];

const SERVICES: readonly Service[] = [
  // Through Mariehamn between Stockholm and Turku, two ships calling in turn, each twice a cycle.
  {
    model: "ship",
    legs: [
      { lane: "mariehamn-stockholm", way: "in", waitS: 30 * MINUTE },
      { lane: "mariehamn-turku", way: "out", untilS: 6 * HOUR },
      { lane: "mariehamn-turku", way: "in", waitS: 30 * MINUTE },
      { lane: "mariehamn-stockholm", way: "out" },
    ],
    departs: [0, 3 * HOUR],
    periodS: 12 * HOUR,
  },
  { model: "ship", legs: [{ lane: "mariehamn-tallinn", way: "in", waitS: 40 * MINUTE }, { lane: "mariehamn-tallinn", way: "out" }], departs: [1.15 * HOUR, 5.25 * HOUR], periodS: 12 * HOUR },
  {
    model: "ship",
    legs: [
      { lane: "langnas-turku", way: "in", waitS: 30 * MINUTE },
      { lane: "langnas-kapellskar", way: "out", untilS: 6 * HOUR },
      { lane: "langnas-kapellskar", way: "in", waitS: 30 * MINUTE },
      { lane: "langnas-turku", way: "out" },
    ],
    departs: [2 * HOUR, 5 * HOUR],
    periodS: 12 * HOUR,
  },
  { model: "ship-small", legs: [{ lane: "eckero-grisslehamn", way: "in", waitS: 1 * HOUR }, { lane: "eckero-grisslehamn", way: "out" }], departs: [0.5 * HOUR], periodS: 8 * HOUR },
  { model: "archipelago", legs: there("foglo", 15 * MINUTE), departs: [0], periodS: 2 * HOUR },
  { model: "archipelago", legs: there("norra", 30 * MINUTE), departs: [1 * HOUR], periodS: 4 * HOUR },
  // Södra and Tvärgående share a quay at Överö, so each lies there while the other is away.
  { model: "archipelago", legs: there("sodra", 2 * HOUR), departs: [0.5 * HOUR], periodS: 4 * HOUR },
  // Off Överö Tvärgående shares the ships' fairway out of Långnäs, so it leaves when none is there.
  { model: "archipelago", legs: there("tvargaende", 30 * MINUTE), departs: [0.25 * HOUR], periodS: 4 * HOUR },
  ...["tofto", "embarsund", "angosund"].map((lane, index): Service => ({ model: "cable", legs: there(lane, 6 * MINUTE), departs: [index * 4 * MINUTE], periodS: 20 * MINUTE })),
  // A kilometre across, Simskäla's is the one road ferry that takes a while over it.
  { model: "cable", legs: there("simskala", 10 * MINUTE), departs: [0], periodS: 40 * MINUTE },
  ...["kobba-klintar", "rodhamn", "boxo", "bjorkor", "signilskar"].map((lane, index): Service => ({ model: "passenger", legs: there(lane, 50 * MINUTE), departs: [(index * 40 + 30) * MINUTE], periodS: 4 * HOUR })),
];

/** A share from 0 to 1 that a name and a salt always give. */
function roll(name: string, salt: number): number {
  let hash = 2166136261 ^ salt;
  for (let at = 0; at < name.length; at++) hash = Math.imul(hash ^ name.charCodeAt(at), 16777619);
  hash = Math.imul(hash ^ (hash >>> 15), 2246822507);
  return ((hash ^ (hash >>> 13)) >>> 0) / 4294967296;
}

function smallBoat(lane: string): { model: BoatModel; handling: Handling } {
  const total = SMALL.reduce((sum, { share }) => sum + share, 0);
  let left = roll(lane, 1) * total;
  for (const kind of SMALL) {
    left -= kind.share;
    if (left < 0) return kind;
  }
  return SMALL[SMALL.length - 1];
}

export interface Sailing {
  model: BoatModel;
  voyage: Voyage;
}

/** Every vessel under way, on the lanes `pipeline/sea_lanes.py` found. */
export function sailings({ ferries, boats }: { ferries: LaneData[]; boats: LaneData[] }): Sailing[] {
  const lanes = new Map([...ferries, ...boats].map((data) => [data.name, new Lane(data)]));
  const found: Sailing[] = [];
  for (const { model, legs, departs, periodS } of SERVICES) {
    const vessel = lanes.get(legs[0].lane)?.data.vessel;
    if (vessel === undefined) throw new Error(`no lane ${legs[0].lane}`);
    departs.forEach((departS, index) => found.push({ model, voyage: new Voyage(`${legs[0].lane} ${index}`, legs, lanes, HANDLING[vessel], departS, periodS) }));
  }
  for (const { name } of boats) {
    const { model, handling: moves } = smallBoat(name);
    // Out, a pause of a quarter to an hour and a quarter at the far end, back, and an hour or two at home.
    const legs: Leg[] = [
      { lane: name, way: "out", waitS: (15 + roll(name, 2) * 60) * MINUTE },
      { lane: name, way: "in", waitS: (60 + roll(name, 3) * 60) * MINUTE },
    ];
    found.push({ model, voyage: new Voyage(name, legs, lanes, moves, roll(name, 4) * 24 * HOUR) });
  }
  return found;
}
