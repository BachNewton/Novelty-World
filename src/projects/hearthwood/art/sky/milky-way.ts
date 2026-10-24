import { atan, cross, dot, exp, float, sin, smoothstep, vec3 } from "three/tsl";
import type { Node } from "three/webgpu";
import type { FeatureArt } from "../feature-art";
import { moonPhaseLight } from "../light/moonlight";
import { smooth } from "../light/sun";
import { colourUniform, typed } from "../tsl";
import { celestial, followSky, onlyWhere, skyDirection, skyFbm3, skyNoise3 } from "./sky-nodes";
import { skyColours } from "./tokens";

/*
 * The Milky Way (`milkyWay`): the galaxy's band where it really lies among
 * the stars, so from the north it arches overhead on autumn evenings and
 * lies low in spring. A soft glow of clouds broken by a dark lane of dust,
 * faint, and only on dark nights: twilight and a bright moon wash it out.
 */

const glowColour = colourUniform();

/** The galaxy's north pole and its centre among the stars (right ascension and declination as a direction on the celestial sphere). */
function galactic(rightAscension: number, declination: number): Node<"vec3"> {
  const a = (rightAscension * Math.PI) / 180;
  const d = (declination * Math.PI) / 180;
  return vec3(Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d));
}

const POLE = galactic(192.86, 27.13);
const CENTRE = galactic(266.4, -28.94);

/** How bright the band's glow is on a dark night. */
const GLOW = 0.05;

function milkyWay(sky: Node<"vec3">): Node<"vec3"> {
  const dir = skyDirection();
  return onlyWhere(glowColour.g.greaterThan(0).and(dir.y.greaterThan(-0.02)), sky, (colour) => {
    const c = celestial(dir);
    const latitude = dot(c, POLE);
    const longitude = atan(dot(c, cross(POLE, CENTRE)), dot(c, CENTRE));
    const spread = typed<"float">(skyNoise3(c.mul(3)))
      .mul(0.06)
      .add(0.15);
    const band = exp(latitude.mul(latitude).div(spread.mul(spread)).negate());
    const bulge = exp(longitude.mul(longitude).div(0.5).add(latitude.mul(latitude).div(0.03)).negate());
    const clouds = skyFbm3(c.mul(7));
    const off = latitude.sub(sin(longitude.mul(3)).mul(0.03)).div(0.035);
    const lane = exp(off.mul(off).negate())
      .mul(smoothstep(0.35, 0.7, skyFbm3(c.mul(11).add(4))))
      .mul(float(1).sub(longitude.abs().mul(0.6 / Math.PI)));
    const glow = band
      .mul(clouds.mul(clouds).mul(1.1).add(0.35))
      .add(bulge.mul(clouds).mul(1.4))
      .mul(float(1).sub(lane.mul(0.8)));
    return colour.add(glowColour.mul(glow).mul(smoothstep(-0.02, 0.3, dir.y)));
  });
}

export const MILKY_WAY_ART: FeatureArt = {
  feature: "milkyWay",
  stages: [{ kinds: ["sky"], colour: milkyWay }],
  frame: ({ day, sky }) => {
    followSky(sky);
    const { sun, moon } = day.sky;
    const dark = 1 - smooth(-16, -9, sun.elevation);
    const moonWash = 1 - 0.85 * moonPhaseLight(moon) * smooth(-2, 10, moon.elevation);
    glowColour.value.copy(skyColours()["milky-way"]).multiplyScalar(GLOW * dark * moonWash);
  },
};
