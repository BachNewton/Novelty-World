import type { Listener } from "../audio/model";
import type { PlacedLoop } from "../audio/placed";
import { trafficVoiceOf, TrafficSound, type TrafficHeard } from "../audio/traffic";
import type { Condition, Surface } from "../sim/surfaces";
import type { Bubble } from "./bubble";
import type { LaneCar, LaneTraffic } from "./lane-driver";
import type { LaneNet } from "./lane-net";
import type { TrafficClock } from "./rhythm";
import { useTrafficSettings } from "./settings";

/*
 * What makes the lanes feel lived in, in one place for the game's loop to call: each traffic step, the bubble follows
 * the game's hour and day of the year (`rhythm.ts`) and the player's cost settings (`settings.ts`); each frame, the
 * nearest traffic cars are voiced through the placed sounds (`audio/traffic.ts`).
 */

/** A lane's road surface as the traffic's tyres hear it: tracks are gravel, every other road sealed. */
const surfaceOf = (net: LaneNet, { place }: LaneCar): Surface => {
  if (place.connector || place.link === true) return "asphalt";
  return net.tile(place.tile)?.lanes[place.index]?.kind === "track" ? "gravel" : "asphalt";
};

export interface TrafficLife {
  /** Each traffic step, before the bubble's update: the hour it fills for, and what the settings let it hold. */
  step(clock: TrafficClock): void;
  /** Each frame: the voiced cars' loops, heard from the listener. */
  sound(listener: Listener, condition: Condition, dt: number): readonly PlacedLoop[];
  /** After a jump: the camera's leap isn't a speed to hear. */
  reset(): void;
}

/** `modelNames` names each `LaneCar.model`, the fleet's world cars, whose voice follows what it is. */
export function createTrafficLife(bubble: Bubble, traffic: LaneTraffic, net: LaneNet, modelNames: readonly string[]): TrafficLife {
  const heard = new TrafficSound();
  const settings = () => useTrafficSettings.getState().settings;
  return {
    step(clock) {
      const { density, reach } = settings();
      bubble.setClock(clock);
      bubble.setCost(density, reach);
    },
    sound(listener, condition, dt) {
      const cars: TrafficHeard[] = [];
      for (const car of traffic.all()) {
        if (car.kind !== "car") continue;
        cars.push({ id: car.id, voice: trafficVoiceOf(modelNames[car.model], car.seed), x: car.pose.x, z: car.pose.z, yaw: car.pose.yaw, speedMS: car.speedMS, surface: surfaceOf(net, car) });
      }
      return heard.frame(listener, cars, condition, settings().voiced, dt);
    },
    reset() {
      heard.reset();
    },
  };
}
