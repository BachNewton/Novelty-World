import { exp, float, floor, Loop, max, sin, smoothstep, sqrt, uniform, vec3 } from "three/tsl";
import type { Node } from "three/webgpu";
import { createRng } from "@/shared/lib/seeded-random";
import type { Sun } from "../../engine/astronomy";
import type { CalendarDate, Season } from "../../engine/calendar";
import type { FeatureArt } from "../feature-art";
import { smooth } from "../light/sun";
import { SKY_INPUTS, sighted, type Sighting } from "./sky-inputs";
import { colourUniform, typed } from "../tsl";
import { onlyWhere, skyDirection, skyHash4, skyNoise3 } from "./sky-nodes";
import { skyColours } from "./tokens";

/*
 * The northern lights (`aurora`): on some clear nights, seeded so no two
 * nights are alike, curtains of green with violet edges hang in the north,
 * drifting and rippling, some nights faint and some nights a show. Mostly
 * in the long dark of autumn and winter; summer's bright nights hide them.
 * They light the land a little green, through the light from the sky all
 * round (`AURORA_LIGHT`, in the day's light).
 *
 * The curtains are drawn as the real ones stand: sheets about a hundred
 * kilometres up and more, running east to west across the northern sky,
 * with fine rays down them. The sky gathers their light at a few heights
 * along each view, jittered so the steps never show: green from the oxygen
 * low down, violet at the lower fringe and the tops.
 */

/** The chance of the northern lights on a night, by the season. */
const CHANCE: Record<Season, number> = { autumn: 0.45, winter: 0.4, spring: 0.25, summer: 0.06 };

/** The night a date falls in: a night belongs to the day whose evening it began on. */
export function nightOf(date: CalendarDate): number {
  return date.hour < 12 ? date.day - 1 : date.day;
}

/** How strong a night's northern lights are, 0 for none: seeded by the night, so it is always the same night's show. */
export function auroraTonight(date: CalendarDate): number {
  const rng = createRng(`hearthwood-aurora-${nightOf(date)}`);
  if (rng.next() >= CHANCE[date.season]) return 0;
  return 0.3 + 0.7 * Math.pow(rng.next(), 1.5);
}

/** How lively the show is through the night: brightest round midnight, at a seeded hour, quieter in the evening and towards dawn. */
function activity(date: CalendarDate): number {
  const rng = createRng(`hearthwood-aurora-peak-${nightOf(date)}`);
  const peak = (rng.next() - 0.5) * 3;
  const fromMidnight = ((date.hour + 12) % 24) - 12;
  return 0.3 + 0.7 * Math.exp(-((fromMidnight - peak) ** 2) / (2 * 2.2 * 2.2));
}

/** How bright the northern lights are now, 0 to 1: the night's show, how lively it is, and how dark the sky is. */
export function auroraAt(date: CalendarDate, sun: Sun, sighting: Sighting = SKY_INPUTS.aurora): number {
  const dark = 1 - smooth(-14, -7, sun.elevation);
  if (dark === 0) return 0;
  return sighted(sighting, auroraTonight(date)) * activity(date) * dark;
}

/** The light the aurora casts on the land at its fullest, against the sky's own brightness. */
export const AURORA_LIGHT = 0.05;

const strength = uniform(0);
const time = uniform(0);
const green = colourUniform();
const violet = colourUniform();

/** How many heights the view gathers the curtains' light from: few, as the curtains are soft and each layer is jittered. */
const LAYERS = 8;

/** How much curtain stands at a point (kilometres east and south of the eye): a few sheets running east to west in the north, wandering, folding and rippling. */
function curtain(p: Node<"vec2">, t: Node<"float">): Node<"float"> {
  const noise = (x: Node<"float">, y: Node<"float"> | number, z: Node<"float"> | number) => typed<"float">(skyNoise3(vec3(x, y, z)));
  const wander = sin(p.x.div(420).add(t.mul(0.03)))
    .mul(90)
    .add(noise(p.x.div(260), t.mul(0.02), 1).sub(0.5).mul(120));
  let sum: Node<"float"> = float(0);
  for (let k = 0; k < 3; k++) {
    const line = wander
      .mul(1 - 0.3 * k)
      .add(sin(p.x.div(130 + 40 * k).sub(t.mul(0.08 + 0.03 * k))).mul(25))
      .sub(170 + 130 * k);
    const width = noise(p.x.div(90), k * 3.1, t.mul(0.05))
      .mul(9)
      .add(7);
    const off = p.y.sub(line).div(width);
    const sheet = exp(off.mul(off).negate());
    // The fine rays down a curtain, and its light gathering and fading along it.
    const rays = noise(p.x.div(4.5).add(k * 7), t.mul(0.25), 0)
      .mul(0.55)
      .add(0.45);
    const along = smoothstep(0.25, 0.7, noise(p.x.div(180).add(k * 5), t.mul(0.04), 2));
    sum = sum.add(
      sheet
        .mul(rays)
        .mul(along)
        .mul(1 - 0.35 * k),
    );
  }
  return sum;
}

function aurora(sky: Node<"vec3">): Node<"vec3"> {
  const dir = skyDirection();
  return onlyWhere(strength.greaterThan(0).and(dir.y.greaterThan(0.015)), sky, (colour) => {
    const glow = vec3(0).toVar();
    const jitter = typed<"vec4">(skyHash4(floor(dir.mul(1500)))).x;
    Loop(LAYERS, ({ i }) => {
      const f = float(i).add(jitter).div(LAYERS);
      const height = f.mul(150).add(92);
      // Along the view to that height over the curved earth (kilometres).
      const distance = sqrt(
        dir.y
          .mul(dir.y)
          .mul(6371 * 6371)
          .add(height.mul(2 * 6371))
          .add(height.mul(height)),
      ).sub(dir.y.mul(6371));
      const p = dir.xz.mul(distance);
      const lit = curtain(p, time);
      const greenAt = smoothstep(93, 102, height).mul(exp(max(height.sub(106), 0).div(-30)));
      const low = height.sub(95).div(3.5);
      const violetAt = exp(low.mul(low).negate())
        .mul(0.7)
        .add(
          smoothstep(150, 190, height)
            .mul(exp(max(height.sub(190), 0).div(-30)))
            .mul(0.3),
        );
      glow.addAssign(green.mul(greenAt).add(violet.mul(violetAt)).mul(lit));
    });
    return colour.add(glow.mul(strength.div(LAYERS)).mul(smoothstep(0.015, 0.12, dir.y)));
  });
}

/** How bright the curtains are drawn, at the sky's own brightness, on a night that is a show. */
const BRIGHTNESS = 4.5;

export const AURORA_ART: FeatureArt = {
  feature: "aurora",
  stages: [{ kinds: ["sky"], colour: aurora }],
  frame: ({ day }) => {
    const colours = skyColours();
    strength.value = auroraAt(day.date, day.sky.sun) * BRIGHTNESS;
    time.value = day.motion;
    green.value.copy(colours["aurora-green"]);
    violet.value.copy(colours["aurora-violet"]);
  },
};
