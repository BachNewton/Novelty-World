import { createNight, skyAtHour, NIGHT_STOPS, type Night } from "../art/night";
import type { Sky } from "../art/sky/sky";
import { createLiveSun, type LiveSun } from "../art/sun";
import { DayClock, dayAsked, type GameTime } from "../time/day";

/*
 * The game's day, as the render sees it: each frame the hour is read off the world's clock, the live sun moves to
 * where it stands, and the night's one dial (`art/night`) follows the sun's height, so dusk, the lamps and the lit
 * windows come when the real sun says, not by a dial of their own. The sky takes the look for that dial, with the real
 * sun in it.
 */

/** The sun's height at each of the night's looks: the golden hour, dusk, and the deepest midsummer night. */
const HEIGHT_AT_STOP: readonly [height: number, amount: number][] = [
  [25, NIGHT_STOPS.day],
  [6, NIGHT_STOPS.golden],
  [-1.5, NIGHT_STOPS.dusk],
  [-6.5, NIGHT_STOPS.night],
];

/** The night's dial for a sun this high: 0 by full day, 1 once it is as deep as Åland's midsummer night. */
export function nightAmount(elevationDeg: number) {
  const [first] = HEIGHT_AT_STOP;
  if (elevationDeg >= first[0]) return first[1];
  for (let at = 1; at < HEIGHT_AT_STOP.length; at++) {
    const [high, from] = HEIGHT_AT_STOP[at - 1];
    const [low, to] = HEIGHT_AT_STOP[at];
    if (elevationDeg >= low) return from + ((high - elevationDeg) / (high - low)) * (to - from);
  }
  return NIGHT_STOPS.night;
}

export interface DayAndNight {
  clock: DayClock;
  sun: LiveSun;
  night: Night;
  /** The hour last drawn. */
  time: () => GameTime;
  /** Each frame, before drawing: the world's clock in seconds, and the seconds the game's own clock moved. */
  update: (worldSeconds: number, gameSeconds: number) => void;
}

export function createDayAndNight(sky: Sky, search: string, startSeconds: number): DayAndNight {
  const clock = new DayClock();
  const asked = dayAsked(search);
  clock.setDate(asked.date);
  // A link's hour is set on the first frame's clock, which `?sea=` may have moved.
  let hourAsked = asked.hour;
  if (hourAsked !== null) clock.setHour(hourAsked, startSeconds);
  let time = clock.at(startSeconds);
  const sun = createLiveSun(time.sun);
  const night = createNight(nightAmount(time.sun.elevationDeg));
  const lookAtHour = skyAtHour();
  const show = () => {
    sun.setSun(time.sun);
    night.amount.value = nightAmount(time.sun.elevationDeg);
    sky.setLook({ ...lookAtHour(night.amount.value), sun: time.sun });
  };
  show();
  return {
    clock,
    sun,
    night,
    time: () => time,
    update(worldSeconds, gameSeconds) {
      if (hourAsked !== null) clock.setHour(hourAsked, worldSeconds);
      hourAsked = null;
      time = clock.at(worldSeconds);
      night.seconds.value += gameSeconds;
      show();
    },
  };
}
