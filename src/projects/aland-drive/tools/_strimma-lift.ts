import { ALL_ASSISTS, NO_INPUT } from "../sim/car";
import { headingOf, speedOf } from "../sim/car-state";
import { Drive, initPhysics } from "../sim/drive";
import { PAD_M, padPoint, testPad } from "../sim/test-pad";
import type { CarId } from "../sim/cars";
await initPhysics();
const pad = testPad("asphalt");
const offAngle = (on: Drive) => {
  const s = on.stateAt(1);
  const way = Math.atan2(-s.velocity[0], -s.velocity[2]) - headingOf(s.rotation);
  return (Math.atan2(Math.sin(way), Math.cos(way)) * 180) / Math.PI;
};
for (const id of (process.argv[2] ?? "strimma,sund,skerry-gt,aska").split(",") as CarId[]) {
  for (const stability of [true, false]) {
    const on = new Drive(pad, { ...padPoint(200, -PAD_M / 2), heading: -Math.PI / 2 }, id);
    on.assists = { ...ALL_ASSISTS, stability };
    for (let step = 0; step < 60; step++) on.step(NO_INPUT);
    while (speedOf(on.stateAt(1)) < 90 / 3.6) on.step({ ...NO_INPUT, throttle: 1 });
    // Settle into a steady corner at 90 km/h on 0.5 steer.
    for (let step = 0; step < 240; step++) {
      const error = 90 / 3.6 - speedOf(on.stateAt(1));
      on.step({ ...NO_INPUT, steer: 1, throttle: Math.max(0, Math.min(1, 0.4 + error)) });
    }
    const before = on.stateAt(1).spin[1];
    const offBefore = offAngle(on);
    let worst = 0;
    let peakYaw = Math.abs(before);
    for (let step = 0; step < 120; step++) {
      on.step({ ...NO_INPUT, steer: 1 });
      worst = Math.max(worst, Math.abs(offAngle(on)));
      peakYaw = Math.max(peakYaw, Math.abs(on.stateAt(1).spin[1]));
    }
    console.log(`${id.padEnd(10)} stability ${stability ? "on " : "off"}: yaw ${Math.abs(before).toFixed(2)} -> peak ${peakYaw.toFixed(2)} rad/s (+${((peakYaw / Math.abs(before) - 1) * 100).toFixed(0)}%), slip ${Math.abs(offBefore).toFixed(1)}° -> worst ${worst.toFixed(1)}°`);
    on.dispose();
  }
}
