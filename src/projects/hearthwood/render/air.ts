import { Color, Vector3 } from "three/webgpu";
import { cameraPosition, clamp, dot, exp, float, max, mix, normalize, pow, smoothstep, uniform, vec3 } from "three/tsl";
import { colourUniform, type Float, type Vec3 } from "./tsl";

/*
 * The light and the air every surface shares: the key light (the sun by
 * day, the moon by night) and the light from the sky above and the ground
 * below, the sky's colour along any way, and the haze between the eye and
 * what it sees, which is the horizon's colour, so the far land melts into
 * the sky. Each is a uniform the frame sets once, so no material is ever
 * rebuilt as the day turns. Surfaces are lit by these alone, in their own
 * shaders: nothing uses three's lights.
 */

/** The earth's radius, in metres: the far land drops away by its curve. */
export const EARTH_RADIUS = 6_371_000;

export const air = {
  /** Towards the key light, a unit vector. */
  keyDirection: uniform(new Vector3(0, 1, 0)),
  /** The key light's colour times its strength. */
  keyColour: colourUniform(new Color(1, 1, 1)),
  /** The light from the sky above and from the ground below. */
  skyLight: colourUniform(new Color(0.5, 0.6, 0.8)),
  groundLight: colourUniform(new Color(0.3, 0.28, 0.2)),
  /** The sky straight up, and at the horizon (the haze's colour too). */
  zenith: colourUniform(new Color(0.3, 0.5, 0.9)),
  horizon: colourUniform(new Color(0.8, 0.85, 0.9)),
  /** Towards the sun, a unit vector, and its glow's colour in the sky. */
  sunDirection: uniform(new Vector3(0, 1, 0)),
  sunGlow: colourUniform(new Color(1, 0.9, 0.7)),
  /** How thick the haze is: the share of light it lets through per metre, at the ground. */
  haze: uniform(0.000022),
  /** Seconds of motion, for whatever drifts or sways (the breeze in the grass, the northern lights): held still for a screenshot. */
  motion: uniform(0),
};

/** A surface's colour lit by the key light and the sky and ground's light, from its normal in the world. */
export function lit(albedo: Vec3, normal: Vec3): Vec3 {
  const n = normalize(normal);
  const key = max(dot(n, air.keyDirection), 0);
  const up = n.y.mul(0.5).add(0.5);
  const ambient = mix(air.groundLight, air.skyLight, up);
  return albedo.mul(ambient.add(air.keyColour.mul(key)));
}

/** The sky's colour along a direction: from the horizon's haze up to the zenith's blue, with the glow round the sun. */
export function skyAlong(direction: Vec3): Vec3 {
  const d = normalize(direction);
  const up = clamp(d.y, 0, 1);
  const base = mix(air.horizon, air.zenith, pow(up, 0.45));
  const toward = max(dot(d, air.sunDirection), 0);
  return base.add(air.sunGlow.mul(pow(toward, 8).mul(0.35).add(pow(toward, 64).mul(0.4))));
}

/** A colour seen through the haze from the eye, at a point in the world: thinner up high, so the peaks stand clearer than the valleys. */
export function throughAir(colour: Vec3, world: Vec3): Vec3 {
  const toward = world.sub(cameraPosition);
  const distance = toward.length();
  const height = max(world.y.add(cameraPosition.y).mul(0.5), float(0));
  const thickness = air.haze.mul(exp(height.div(-2400)));
  const seen = exp(distance.mul(thickness).negate());
  const sky = skyAlong(vec3(toward.x, max(toward.y, distance.mul(0.02)), toward.z));
  return mix(sky, colour, smoothstep(0, 1, seen));
}

/** How far the land has dropped by the curve of the earth at a point, from the eye, in metres. */
export function earthDrop(world: Vec3): Float {
  const dx = world.x.sub(cameraPosition.x);
  const dz = world.z.sub(cameraPosition.z);
  return dx.mul(dx).add(dz.mul(dz)).div(2 * EARTH_RADIUS);
}
