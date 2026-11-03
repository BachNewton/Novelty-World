import { type Node } from "three/webgpu";
import { cameraPosition, cross, dFdx, dFdy, float, mix, normalize, positionWorld, select, vec3 } from "three/tsl";

/*
 * How a plant's leaves take the light, for trees and shrubs alike, so a bush at a
 * forest's edge is lit as the trees behind it. Each face is lit by which way it
 * points, a share of its own direction and a share of the plant's as a whole, so a
 * low-poly crown shows its facets and still turns from light to shade as one mass:
 * the sun, wrapped a little round so the shaded side keeps its form, and the sky,
 * brightest on a face looking up. Broadleaf lets the sun through, so looking towards
 * it, its edges glow. How a plant shades itself is the caller's: it knows its shape.
 */

const SUN_SHARE = 0.95;
const SUN_WRAP = 0.3;
const SKY_SHARE: [down: number, up: number] = [0.42, 0.92];
const BACKLIGHT = 0.4;
const BACKLIGHT_FOCUS = 3;
const FACET_SHARE = 0.5;

export const towardsSun = ({ azimuthDeg, elevationDeg }: { azimuthDeg: number; elevationDeg: number }) => {
  const [way, up] = [(azimuthDeg * Math.PI) / 180, (elevationDeg * Math.PI) / 180];
  return vec3(Math.sin(way) * Math.cos(up), Math.sin(up), -Math.cos(way) * Math.cos(up));
};

/** The light on a pixel of leaves, from the plant's rounded direction there (a varying, out from its middle) and how much of it lets the sun through. */
export function foliageLight(toSun: Node<"vec3">, rounded: Node<"vec3">, seeThrough: Node<"float">): Node<"float"> {
  const facing = normalize(cross(dFdx(positionWorld), dFdy(positionWorld)));
  const facet = select(facing.dot(cameraPosition.sub(positionWorld)).lessThan(0), facing.negate(), facing);
  const normal = normalize(mix(normalize(rounded), facet, FACET_SHARE));
  const sun = normal.dot(toSun).add(SUN_WRAP).div(1 + SUN_WRAP).max(0).mul(SUN_SHARE);
  const sky = mix(float(SKY_SHARE[0]), float(SKY_SHARE[1]), normal.y.mul(0.5).add(0.5));
  const fromCamera = normalize(positionWorld.sub(cameraPosition));
  const edgeOn = float(1).sub(normal.dot(fromCamera).abs());
  const backlight = fromCamera.dot(toSun).max(0).pow(BACKLIGHT_FOCUS).mul(mix(float(0.4), float(1), edgeOn)).mul(seeThrough).mul(BACKLIGHT);
  return sun.add(sky).add(backlight);
}
