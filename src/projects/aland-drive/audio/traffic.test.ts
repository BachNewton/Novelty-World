import { describe, expect, it } from "vitest";
import { dopplerRate, TRAFFIC_VOICES, trafficRpm, TrafficSound, type TrafficHeard } from "./traffic";

const LISTENER = { x: 0, z: 0, rightX: 1, rightZ: 0 };
/** A car driving east (yaw -π/2 points its nose to +x) along z = 5, at x. */
const eastbound = (id: string, x: number, speedMS = 25): TrafficHeard => ({ id, voice: "petrol", x, z: 5, yaw: -Math.PI / 2, speedMS, surface: "asphalt" });

describe("traffic's sound", () => {
  it("rises in pitch as a car comes and falls once it has passed", () => {
    const sound = new TrafficSound();
    const rateAt = (x: number) => sound.frame(LISTENER, [eastbound("a", x)], "dry", 3, 1 / 60).find(({ id }) => id === "a:engine")?.rate ?? 0;
    const coming = rateAt(-60);
    const beside = rateAt(0);
    const gone = rateAt(60);
    expect(coming).toBeGreaterThan(beside * 1.05);
    expect(gone).toBeLessThan(beside / 1.05);
  });

  it("is heard moving when the listener moves, as when the car does", () => {
    expect(dopplerRate(-50, 0, 0, 0, 0, 0, -20, 0)).toBeCloseTo(dopplerRate(-50, 0, 20, 0, 0, 0, 0, 0), 1);
  });

  it("voices only the nearest few, and none far off", () => {
    const sound = new TrafficSound();
    const cars = [eastbound("far", 400), eastbound("near", 10), eastbound("mid", 60), eastbound("next", 30)];
    const voiced = new Set(sound.frame(LISTENER, cars, "dry", 2, 1 / 60).map(({ id }) => id.split(":")[0]));
    expect([...voiced].sort()).toEqual(["near", "next"]);
    expect(sound.frame(LISTENER, [eastbound("far", 400)], "dry", 3, 1 / 60)).toEqual([]);
  });

  it("climbs through a gear and drops at the change, never below idle", () => {
    const { revs } = TRAFFIC_VOICES.petrol;
    if (revs === null) throw new Error("the petrol voice has a gearbox");
    const top = revs.gearTopKmh[1] / 3.6;
    expect(trafficRpm(revs, top * 0.99)).toBeGreaterThan(trafficRpm(revs, top * 0.8));
    expect(trafficRpm(revs, top * 1.02)).toBeLessThan(trafficRpm(revs, top * 0.99));
    expect(trafficRpm(revs, 0)).toBe(revs.idleRpm);
  });
});
