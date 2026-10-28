import { BackSide, Group, Mesh, MeshBasicNodeMaterial, SphereGeometry, Vector3 } from "three/webgpu";
import { cos, cross, dot, exp, float, floor, fract, max, mix, mx_noise_float, normalize, positionWorld, cameraPosition, pow, sin, smoothstep, uniform, vec3, normalWorld } from "three/tsl";
import type { Palette } from "./palette";
import { air, skyAlong } from "./air";
import { type Float, type Vec3, colourOf } from "./tsl";

/*
 * The sky: a dome round the eye drawn from the shared air (the horizon's
 * haze up to the zenith's blue, the sun's glow and its disc), the stars
 * turning with the night, the northern lights hanging in the north, and the
 * moon, a lit sphere whose phase is the sun lighting it from where the sun
 * really is.
 *
 * The stars are worked out per pixel: the sphere of the stars is cut into
 * cells, each holding a star or not by a hash of where it is, and each star
 * is a soft spot a pixel or so wide, so the field never shimmers as the
 * camera turns. A star shows only once it is brighter than the sky behind
 * it, so twilight and a summer night show few.
 */

/** How far off the dome and the moon are drawn, in metres: beyond the furthest land. */
export const SKY_RADIUS = 280_000;
const MOON_DISTANCE = 240_000;
/** The moon's angular radius, a little larger than life (about 0.26°), in radians. */
const MOON_RADIUS = 0.0065;
/** The sun's disc's angular radius, in radians, drawn larger than life. */
const SUN_RADIUS = 0.0075;
/** Cells across the sphere of the stars per unit of its radius. */
const STAR_CELLS = 90;
/** The share of cells holding a star. */
const STAR_CHANCE = 0.09;
/** A star's spot, in radians: about a pixel at the game's field of view. */
const STAR_SPOT = 0.0011;

export const skyState = {
  /** How dark the sky is for the stars to show, 0 to 1. */
  night: uniform(0),
  /** The celestial pole and the equinox's point, as the stars stand now. */
  pole: uniform(new Vector3(0, 1, 0)),
  equinox: uniform(new Vector3(1, 0, 0)),
  /** How strong the northern lights are now, 0 to 1. */
  aurora: uniform(0),
  /** How much of the sun's disc shows above the horizon, 0 to 1. */
  sunShows: uniform(1),
  /** Towards the moon, and how much it shows against the sky (faint by day). */
  moonDirection: uniform(new Vector3(0, -1, 0)),
  moonShows: uniform(0),
};

function hash3(p: Vec3): Float {
  return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))).mul(43758.5453));
}

/** The stars along a direction in the world, turned by the sky's frame. */
function stars(direction: Vec3, palette: Palette): Vec3 {
  const east = cross(skyState.pole, skyState.equinox);
  const c = vec3(dot(direction, skyState.equinox), dot(direction, east), dot(direction, skyState.pole));
  const p = c.mul(STAR_CELLS);
  const cell = floor(p);
  const here = hash3(cell);
  const offset = vec3(hash3(cell.add(17.1)), hash3(cell.add(31.7)), hash3(cell.add(5.3))).mul(0.5).add(0.25);
  const star = normalize(cell.add(offset).div(STAR_CELLS));
  const apart = star.sub(c).length();
  const spot = exp(apart.div(STAR_SPOT).pow(2).negate());
  // Few bright and many faint, as the real sky has.
  const brightness = pow(hash3(cell.add(71.9)), 6).mul(2.4).add(0.04);
  const exists = smoothstep(1 - STAR_CHANCE, 1 - STAR_CHANCE + 0.0005, here);
  const tint = mix(colourOf(palette.sky["star-warm"]), colourOf(palette.sky["star-cool"]), hash3(cell.add(3.1)));
  return tint.mul(spot.mul(brightness).mul(exists));
}

/** The northern lights along a direction: curtains running east to west across the northern sky, green low down and violet at the tops. */
function aurora(direction: Vec3, palette: Palette): Vec3 {
  const north = max(direction.z.negate(), 0);
  const elevation = max(direction.y, 0);
  // Across the northern sky, as if on a far wall: the curtains' way runs along it.
  const across = direction.x.div(north.add(0.25));
  const wander = mx_noise_float(vec3(across.mul(0.9), air.motion.mul(0.03), 1.7)).mul(0.12);
  const band = smoothstep(0.08, 0.16, elevation.add(wander)).mul(float(1).sub(smoothstep(0.3, 0.75, elevation.add(wander))));
  const rays = mx_noise_float(vec3(across.mul(14), air.motion.mul(0.08), 4.2)).mul(0.5).add(0.5);
  const fold = mx_noise_float(vec3(across.mul(2.2), air.motion.mul(0.05), 9.1)).mul(0.5).add(0.5);
  const height = smoothstep(0.1, 0.6, elevation);
  const colour = mix(colourOf(palette.sky["aurora-green"]), colourOf(palette.sky["aurora-violet"]), height.mul(height));
  return colour.mul(band.mul(rays.mul(0.6).add(0.4)).mul(fold).mul(smoothstep(0, 0.3, north)).mul(skyState.aurora).mul(0.8));
}

function domeMaterial(palette: Palette): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial({ side: BackSide, depthWrite: false });
  const direction = normalize(positionWorld.sub(cameraPosition));
  const sky = skyAlong(direction);
  const toSun = dot(direction, air.sunDirection);
  const disc = smoothstep(cos(SUN_RADIUS), cos(SUN_RADIUS * 0.8), toSun).mul(skyState.sunShows);
  const withSun = mix(sky, colourOf(palette.things["sun-disc"]).mul(3), disc);
  // A star shows only where it is brighter than the sky behind it.
  const skyBright = dot(sky, vec3(0.3, 0.59, 0.11));
  const starLight = stars(direction, palette).mul(skyState.night).mul(max(float(1).sub(skyBright.mul(6)), 0));
  const above = smoothstep(-0.02, 0.04, direction.y);
  material.colorNode = withSun.add(starLight.add(aurora(direction, palette)).mul(above));
  material.fog = false;
  return material;
}

function moonMaterial(palette: Palette): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  const sunlit = smoothstep(-0.05, 0.25, dot(normalWorld, air.sunDirection));
  const face = mix(colourOf(palette.sky.earthshine).mul(0.08), colourOf(palette.things.moon).mul(1.6), sunlit);
  material.colorNode = face;
  // By day only its lit side shows, faint against the blue; by night its dark side hides the stars behind it.
  material.opacityNode = mix(sunlit.mul(0.55), float(1), skyState.night).mul(skyState.moonShows);
  material.fog = false;
  return material;
}

export interface Sky {
  object: Group;
  /** Keeps the dome and the moon round the eye. */
  follow: (eye: Vector3) => void;
  dispose: () => void;
}

export function makeSky(palette: Palette): Sky {
  const object = new Group();
  const domeGeometry = new SphereGeometry(SKY_RADIUS, 48, 24);
  const dome = new Mesh(domeGeometry, domeMaterial(palette));
  dome.frustumCulled = false;
  dome.renderOrder = -1;
  const moonGeometry = new SphereGeometry(MOON_DISTANCE * Math.tan(MOON_RADIUS), 32, 16);
  const moon = new Mesh(moonGeometry, moonMaterial(palette));
  moon.frustumCulled = false;
  object.add(dome, moon);
  const toMoon = new Vector3();
  return {
    object,
    follow(eye) {
      dome.position.copy(eye);
      toMoon.copy(skyState.moonDirection.value);
      moon.position.copy(eye).addScaledVector(toMoon, MOON_DISTANCE);
      moon.visible = skyState.moonShows.value > 0;
    },
    dispose() {
      domeGeometry.dispose();
      moonGeometry.dispose();
      (dome.material as MeshBasicNodeMaterial).dispose();
      (moon.material as MeshBasicNodeMaterial).dispose();
    },
  };
}
