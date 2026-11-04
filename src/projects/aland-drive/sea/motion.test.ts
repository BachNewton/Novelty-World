import { describe, expect, it } from "vitest";
import { FERRY_BERTH, ferryPlace, yawForBearing } from "../art/town-kit/index";
import { LANES } from "./lanes";
import { Lane, Passage, Voyage, type BoatPose, type Handling, type LaneData } from "./motion";
import { HANDLING, sailings, SMALL_VESSELS } from "./timetable";

const SHIP: Handling = { lengthM: 176, beamM: 28, cruiseMs: 9, harbourMs: 2.5, harbourM: 1600, accelMs2: 0.04, lateralMs2: 0.12, swingS: 200, doubleEnded: false };
const DOUBLE: Handling = { ...SHIP, lengthM: 62, beamM: 14, cruiseMs: 5.5, harbourM: 300, doubleEnded: true };

/** A berth at the origin, out east and then north-east to the open sea. */
const OUT_TO_SEA: LaneData = { name: "out", vessel: "ship", line: [0, 0, 3000, 0, 6000, -1500], ends: [{ kind: "berth", turnM: 250 }, { kind: "open" }], keepRightM: 30, keepFromM: 528 };
/** The same, with the quay running north and south, where a ship lies alongside, bow south. */
const ALONGSIDE: LaneData = { ...OUT_TO_SEA, name: "alongside", ends: [{ kind: "berth", turnM: 250, alongsideYaw: -Math.PI / 2 }, { kind: "open" }] };
const ACROSS: LaneData = { name: "across", vessel: "archipelago", line: [0, 0, 1500, 300, 4000, 300], ends: [{ kind: "berth" }, { kind: "berth" }], keepRightM: 10, keepFromM: 186 };
const lanesOf = (...data: LaneData[]) => new Map(data.map((lane) => [lane.name, new Lane(lane)]));
const wrapped = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

describe("a passage", () => {
  const lane = new Lane(ACROSS);
  const passage = new Passage(lane, 0, lane.length, DOUBLE, { moving: [false, false], astern: false });

  it("starts and ends at rest, keeps to the harbour's limit near a berth, and gathers or loses way no faster than the vessel can", () => {
    expect(passage.speeds[0]).toBe(0);
    expect(passage.speeds[passage.samples - 1]).toBe(0);
    const step = lane.length / (passage.samples - 1);
    for (let sample = 1; sample < passage.samples; sample++) {
      const [before, after] = [passage.speeds[sample - 1], passage.speeds[sample]];
      expect(Math.abs(after ** 2 - before ** 2)).toBeLessThanOrEqual(2 * DOUBLE.accelMs2 * step + 1e-9);
      expect(after).toBeLessThanOrEqual(DOUBLE.cruiseMs);
      const s = sample * step;
      if (s < DOUBLE.harbourM || lane.length - s < DOUBLE.harbourM) expect(after).toBeLessThanOrEqual(DOUBLE.harbourMs + 1e-9);
    }
  });

  it("covers the whole lane, always forwards", () => {
    let last = -1;
    for (let t = 0; t <= passage.seconds; t += passage.seconds / 500) {
      const { s } = passage.stateAt(t);
      expect(s).toBeGreaterThanOrEqual(last);
      last = s;
    }
    expect(passage.stateAt(passage.seconds).s).toBeCloseTo(lane.length, 6);
  });
});

/**
 * Every `dt` of a cycle and a little past it: where a place or heading jumps, if anywhere. A vessel keeping to
 * starboard round a corner sails a longer arc than the line its speed is measured along, so a step that moves or
 * turns more than its speed allows is looked at in eighths: smooth motion spreads over them, and a jump doesn't.
 */
function jumpIn(voyage: Voyage, handling: Handling, dt = 0.25): string | null {
  const change = (a: BoatPose, b: BoatPose) => ({ moved: Math.hypot(b.x - a.x, b.z - a.z), turned: Math.abs(wrapped(b.yaw - a.yaw)) });
  const jumps = (t: number, { moved, turned }: { moved: number; turned: number }) => {
    let [most, before] = [{ moved: 0, turned: 0 }, voyage.poseAt(t - dt)];
    for (let part = 1; part <= 8; part++) {
      const now = voyage.poseAt(t - dt + (dt * part) / 8);
      const step = change(before, now);
      most = { moved: Math.max(most.moved, step.moved), turned: Math.max(most.turned, step.turned) };
      before = now;
    }
    return most.moved > moved / 2 || most.turned > turned / 2;
  };
  let before = voyage.poseAt(0);
  for (let t = dt; t <= voyage.periodS + 30; t += dt) {
    const now = voyage.poseAt(t);
    if (before.shown && now.shown) {
      const step = change(before, now);
      // A double-ended ferry leaves by its other end, which looks the same: only it may turn about at once, and only standing.
      const turnsFreely = handling.doubleEnded && before.speedMs === 0;
      const fast = step.moved > Math.max(now.speedMs, before.speedMs) * dt * 1.15 + 1e-3 || (!turnsFreely && step.turned >= 0.12 * dt);
      if (fast && jumps(t, turnsFreely ? { ...step, turned: Infinity } : step)) return `${voyage.name} moves ${step.moved.toFixed(2)} m and turns ${step.turned.toFixed(3)} in ${dt} s at ${t} s`;
    }
    before = now;
  }
  return null;
}

const expectSmooth = (voyage: Voyage, handling: Handling) => expect(jumpIn(voyage, handling)).toBeNull();

describe("a voyage", () => {
  it("never jumps, through a cycle of coming in from sea, coming round, backing in, lying at the quay and going out", () => {
    const voyage = new Voyage("ship", [{ lane: "out", way: "in", waitS: 1800 }, { lane: "out", way: "out" }], lanesOf(OUT_TO_SEA), SHIP, 1000, 6 * 3600);
    expectSmooth(voyage, SHIP);
  });

  it("lies at its berth bow out, ready to leave ahead", () => {
    const voyage = new Voyage("ship", [{ lane: "out", way: "in", waitS: 1800 }, { lane: "out", way: "out" }], lanesOf(OUT_TO_SEA), SHIP, 0, 6 * 3600);
    // Find the end of its wait: the last moment it stands still before it sails out.
    let lying = null;
    for (let t = 0; t < voyage.periodS; t += 10) {
      const pose = voyage.poseAt(t);
      if (pose.shown && pose.speedMs === 0 && Math.hypot(pose.x, pose.z) < 1) lying = pose;
    }
    expect(lying).not.toBeNull();
    // The lane leaves the berth along +x, so bow out is a yaw of 0.
    expect(Math.abs(wrapped(lying?.yaw ?? Math.PI))).toBeLessThan(0.02);
  });

  it("comes round off the quay to its line and moves across on to it, and off it the same way, without a jump", () => {
    const voyage = new Voyage("ship", [{ lane: "alongside", way: "in", waitS: 1800 }, { lane: "alongside", way: "out" }], lanesOf(ALONGSIDE), SHIP, 0, 6 * 3600);
    expectSmooth(voyage, SHIP);
    let across = 0;
    for (let t = 0; t < voyage.periodS; t += 5) {
      const pose = voyage.poseAt(t);
      if (!pose.shown || Math.hypot(pose.x, pose.z) > 250 - 1) continue;
      // Within where it comes round, it only ever lies along the quay.
      expect(Math.abs(wrapped(pose.yaw + Math.PI / 2))).toBeLessThan(1e-6);
      if (pose.speedMs > 0) across++;
    }
    expect(across).toBeGreaterThan(0);
  });

  it("is out of sight between its calls, past the open end", () => {
    const voyage = new Voyage("ship", [{ lane: "out", way: "out", untilS: 4 * 3600 }, { lane: "out", way: "in" }], lanesOf(OUT_TO_SEA), SHIP, 0, 6 * 3600);
    expect(voyage.poseAt(3 * 3600).shown).toBe(false);
  });

  it("shuttles a double-ended ferry without a jump", () => {
    const voyage = new Voyage("ferry", [{ lane: "across", way: "out", waitS: 600 }, { lane: "across", way: "in" }], lanesOf(ACROSS), DOUBLE, 0, 2 * 3600);
    expectSmooth(voyage, DOUBLE);
  });

  it("fails loudly when its legs can't fit its cycle", () => {
    expect(() => new Voyage("ferry", [{ lane: "across", way: "out", waitS: 600 }, { lane: "across", way: "in" }], lanesOf(ACROSS), DOUBLE, 0, 600)).toThrow(/cycle|after its next leg/);
  });

  it("keeps to starboard, so two meeting on one lane pass each other", () => {
    const lane = new Lane(ACROSS);
    const out = new Passage(lane, 0, lane.length, DOUBLE, { moving: [false, false], astern: false });
    const back = new Passage(lane, lane.length, 0, DOUBLE, { moving: [false, false], astern: false });
    // Halfway along the straight stretch, sailing east: starboard is south, +z.
    const [east, west] = [out.poseAt(out.seconds / 2), back.poseAt(back.seconds / 2)];
    expect(east.z - 300).toBeCloseTo(10, 1);
    expect(west.z - 300).toBeCloseTo(-10, 1);
  });

  it("is a function of the clock alone: the same time gives the same place", () => {
    const voyage = new Voyage("ferry", [{ lane: "across", way: "out", waitS: 600 }, { lane: "across", way: "in" }], lanesOf(ACROSS), DOUBLE, 123, 2 * 3600);
    expect(voyage.poseAt(1_800_000_000.5)).toEqual(voyage.poseAt(1_800_000_000.5 + 2 * 3600 * 1000));
  });
});

type Hull = { pose: BoatPose; handling: Handling };

/** A hull's keel, bow to stern, from its middle along its yaw. */
function keel({ pose: { x, z, yaw }, handling: { lengthM } }: Hull): [number, number, number, number] {
  const [dx, dz] = [(Math.cos(yaw) * lengthM) / 2, (-Math.sin(yaw) * lengthM) / 2];
  return [x - dx, z - dz, x + dx, z + dz];
}

function pointToSegment(px: number, pz: number, [ax, az, bx, bz]: [number, number, number, number]): number {
  const [dx, dz] = [bx - ax, bz - az];
  const share = Math.min(Math.max(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz), 0), 1);
  return Math.hypot(px - ax - dx * share, pz - az - dz * share);
}

/** Metres of water between two hulls, each a keel as long as the boat and half its beam either side. */
function hullsApart(a: Hull, b: Hull): number {
  const [ka, kb] = [keel(a), keel(b)];
  const nearest = Math.min(pointToSegment(ka[0], ka[1], kb), pointToSegment(ka[2], ka[3], kb), pointToSegment(kb[0], kb[1], ka), pointToSegment(kb[2], kb[3], ka));
  // Keels that cross have no water between them.
  const side = (p: number, q: number, [ax, az, bx, bz]: [number, number, number, number]) => Math.sign((bx - ax) * (q - az) - (bz - az) * (p - ax));
  const crossed = side(ka[0], ka[1], kb) !== side(ka[2], ka[3], kb) && side(kb[0], kb[1], ka) !== side(kb[2], kb[3], ka);
  return crossed ? 0 : nearest - (a.handling.beamM + b.handling.beamM) / 2;
}

describe("the island's timetable", () => {
  const data = LANES;
  const fleet = sailings(data);

  it("moves every kind of vessel the lanes were found for", () => {
    for (const { vessel } of data.ferries) expect(Object.keys(HANDLING)).toContain(vessel);
    for (const { vessel } of data.boats) expect(SMALL_VESSELS).toContain(vessel);
  });

  it("never lies two small boats in one place: every trip ends where no other boat waits", () => {
    const ends = data.boats.flatMap(({ line }) => [[line[0], line[1]], [line[line.length - 2], line[line.length - 1]]]);
    for (let a = 0; a < ends.length; a++) {
      for (let b = a + 1; b < ends.length; b++) expect(Math.hypot(ends[a][0] - ends[b][0], ends[a][1] - ends[b][1])).toBeGreaterThanOrEqual(29);
    }
  });

  it("sails every voyage of the timetable without a jump, through calls that leave by another lane", () => {
    for (const { voyage } of fleet) expect(jumpIn(voyage, voyage.handling, 1)).toBeNull();
  });

  it("berths Mariehamn's ships alongside the quay at the ferry art's berth, slid off it as the water is drawn", () => {
    const { x, z } = ferryPlace();
    const yaw = yawForBearing(FERRY_BERTH.bearingDeg);
    const lanes = data.ferries.filter(({ name }) => name.startsWith("mariehamn-"));
    const berths = lanes.map(({ line }) => [line[0], line[1]]);
    expect(berths.length).toBe(3);
    for (const { ends } of lanes) expect(Math.abs(wrapped((ends[0].alongsideYaw ?? Infinity) - yaw))).toBeLessThan(1e-3);
    for (const [bx, bz] of berths) {
      expect(Math.hypot(bx - x, bz - z)).toBeLessThan(40);
      expect(Math.hypot(bx - berths[0][0], bz - berths[0][1])).toBeLessThan(0.01);
    }
  });

  it("never has two ferries in one place: over a whole day no two hulls of the timetabled lines come within 10 m", () => {
    const ferries = fleet.filter(({ voyage }) => !voyage.name.startsWith("trip-"));
    const day = 24 * 3600;
    const start = 1_800_000_000 - (1_800_000_000 % day);
    let closest = { apart: Infinity, what: "" };
    for (let t = start; t < start + day; t += 5) {
      const hulls = ferries.map(({ voyage }) => ({ pose: voyage.poseAt(t), handling: voyage.handling }));
      for (let a = 0; a < hulls.length; a++) {
        for (let b = a + 1; b < hulls.length; b++) {
          if (!hulls[a].pose.shown || !hulls[b].pose.shown) continue;
          const apart = hullsApart(hulls[a], hulls[b]);
          if (apart < closest.apart) closest = { apart, what: `${ferries[a].voyage.name} and ${ferries[b].voyage.name}, ${((t - start) / 3600).toFixed(2)} h past midnight` };
        }
      }
    }
    expect(closest.apart, closest.what).toBeGreaterThan(10);
  });
});
