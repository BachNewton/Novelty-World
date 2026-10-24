import { abs, dot, exp, float, floor, log, max, mix, pow, select, smoothstep, uniform, vec3 } from "three/tsl";
import type { Node } from "three/webgpu";
import type { FeatureArt } from "../feature-art";
import { smooth } from "../light/sun";
import { colourUniform, typed } from "../tsl";
import { celestial, followSky, onlyWhere, skyDirection, skyFrame, skyHash4 } from "./sky-nodes";
import { skyColours } from "./tokens";

/*
 * The stars (`stars`): a field fixed to the sphere of the stars, which turns
 * round the celestial pole as the night goes on (the engine's celestial
 * frame, `uCelestial`). The sphere is cut into cells over the faces of a
 * cube, each holding one star at a seeded spot with a seeded brightness, as
 * many faint ones and few bright ones as the real sky has.
 *
 * Each star is a small soft spot never narrower than a pixel and carrying
 * the same light however wide it is drawn, worked out exactly at every
 * pixel, so the field holds still as the camera turns. A star shows only
 * once it is brighter than the sky behind it, so the brightest come out
 * first as dusk deepens and none show in a midsummer night's glow.
 */

const warm = colourUniform();
const cool = colourUniform();
/** How far the night has come for the stars: none while the sun is up. */
const show = uniform(0);

/** Cells along each side of each of the cube's faces. */
const CELLS = 80;

function stars(sky: Node<"vec3">): Node<"vec3"> {
  const dir = skyDirection();
  return onlyWhere(show.greaterThan(0).and(dir.y.greaterThan(-0.02)), sky, (colour) => {
    const c = celestial(dir);
    const a = abs(c);
    // The cube face the direction falls on, and where on it.
    const onX = a.x.greaterThanEqual(a.y).and(a.x.greaterThanEqual(a.z));
    const onY = a.y.greaterThanEqual(a.z);
    const face = select(onX, select(c.x.greaterThan(0), float(0), float(1)), select(onY, select(c.y.greaterThan(0), float(2), float(3)), select(c.z.greaterThan(0), float(4), float(5))));
    const major = select(onX, a.x, select(onY, a.y, a.z));
    const uv = select(onX, c.yz, select(onY, c.xz, c.xy)).div(major);
    const cell = floor(uv.mul(0.5).add(0.5).mul(CELLS));
    const h = typed<"vec4">(skyHash4(vec3(cell, face.mul(17).add(3))));
    const spot = cell.add(0.22).add(h.xy.mul(0.56)).div(CELLS).mul(2).sub(1);
    // The star's own direction, on the same face.
    const side = select(face.mod(2).lessThan(0.5), float(1), float(-1));
    const onFace = select(face.lessThan(1.5), vec3(side, spot.x, spot.y), select(face.lessThan(3.5), vec3(spot.x, side, spot.y), vec3(spot.x, spot.y, side))).normalize();
    const apart = c.sub(onFace).length();
    // As many faint stars and as few bright ones as the real sky has: each magnitude brighter is about three times rarer.
    const magnitude = log(max(h.z, 1e-5))
      .mul(2.1 / Math.LN10)
      .add(6.4);
    const light = pow(10, magnitude.mul(-0.4));
    // Never narrower than a pixel, and the same light however wide.
    const width = max(0.00012, skyFrame.pixel.mul(0.75));
    const spotLight = exp(apart.mul(apart).div(width.mul(width).mul(2)).negate()).div(width.mul(width));
    const behind = dot(colour, vec3(0.2126, 0.7152, 0.0722));
    const shows = smoothstep(0.6, 2, light.mul(3).div(behind.add(0.002)));
    const low = smoothstep(-0.02, 0.22, dir.y);
    const tint = mix(cool, warm, h.w.mul(h.w));
    return colour.add(tint.mul(light.mul(spotLight).mul(2e-6).mul(shows).mul(low).mul(show)));
  });
}

export const STARS_ART: FeatureArt = {
  feature: "stars",
  stages: [{ kinds: ["sky"], colour: stars }],
  frame: ({ day, sky }) => {
    followSky(sky);
    const colours = skyColours();
    warm.value.copy(colours["star-warm"]);
    cool.value.copy(colours["star-cool"]);
    show.value = 1 - smooth(-8, -3, day.sky.sun.elevation);
  },
};
