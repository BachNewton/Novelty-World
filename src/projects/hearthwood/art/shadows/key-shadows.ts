import { PCFShadowMap, type DirectionalLight, type WebGPURenderer } from "three/webgpu";
import type { FeatureSwitches } from "../../features";
import type { FeatureFrame } from "../feature-art";
import { KEY_LIGHT_NAME } from "../light/daylight";
import { QUALITY, type Quality } from "../../quality";
import { weatherInput } from "./weather-input";

/*
 * The key light's shadows, on three's own shadow maps: the sun casts while
 * `sunShadows` is on, and the moon at night while `moonShadows` is as well.
 * One map follows the camera over the near ground, moved only in whole texels
 * so an edge never crawls as Elliott walks or looks round. Every map is
 * softened by one cheap filter (three's soft PCF), never a search for the
 * casters.
 *
 * A shadow takes away only the key light's share of a surface's light: the
 * storybook light keeps the sky's and the ground's light in the shade, so a
 * shadow is the moment's own colour, never black. How much it takes away is
 * the shadow's intensity: full in clear sun, fading out over the light's last
 * degrees above the horizon (before a shadow could stretch across the land),
 * paler as cloud covers the sky (under a full overcast hardly a shadow at all,
 * only a soft darkening beneath things), and lighter by moonlight.
 *
 * This lives in the frame updates of the shadows' features, run before the
 * frame is drawn: the light is found by its name once, configured once, and
 * only its numbers change after. Turning a shadow feature on or off changes
 * whether the light casts, which three hears as a change of its lights and
 * builds the lit materials afresh for (a switch, never a frame's work); dawn,
 * dusk and the handover only fade the shadow's intensity, and stop drawing
 * its maps while it is nothing.
 */

/** Where the first slice ends, in metres: kept for the slice-breaks math. */
const FIRST_SLICE = 8;
/** How much lighter moonlight's shadows are than the sun's: its light is faint beside the night sky's glow. */
const MOON_SHADOW = 0.8;
/** How much of a shadow a full overcast leaves. */
const OVERCAST_SHADOW = 0.18;

function smooth(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * How dark the key light's shadows fall, 0 none to 1 the whole key light
 * taken away: faded near the horizon, paled by cloud, lighter by moonlight.
 */
export function shadowIntensity(body: "sun" | "moon", elevation: number, clouds: number): number {
  const horizon = smooth(0.02, body === "sun" ? 0.07 : 0.08, elevation);
  const cloud = 1 - (1 - OVERCAST_SHADOW) * smooth(0.35, 0.95, clouds);
  return horizon * cloud * (body === "moon" ? MOON_SHADOW : 1);
}

/** The shadow's softening, in texels of its map: 0 gives hard shadows. */
const BLUR = 0;
/** Where each slice ends, as shares of the reach: each the same many times longer than the one before, so a map's texels grow with distance as the view's own pixels do. */
export function sliceBreaks(count: number, reach: number, first = FIRST_SLICE): number[] {
  if (!(count >= 1 && reach > first && first > 0)) throw new Error(`Shadow slices need a count and 0 < first < reach, not ${String(count)}, ${String(first)}, ${String(reach)}`);
  return Array.from({ length: count }, (_, i) => (i === count - 1 ? 1 : (first * (reach / first) ** ((i + 1) / count)) / reach));
}

/** What the shadows have set up on a light and a renderer. */
interface Rig {
  light: DirectionalLight;
  renderer: WebGPURenderer;
}

/**
 * The key light's shadows: each frame (from the shadow features' frame
 * update) it finds the light, sets it up once, decides whether it casts and
 * how dark, and keeps the near map's box round the camera's ground.
 */
export class KeyShadows {
  private rig: Rig | null = null;
  /** The light last seen, so switching the shadows off stops it casting though no frame update of theirs runs then. */
  private light: DirectionalLight | null = null;
  /** The scene the light was found in. */
  private scene: FeatureFrame["scene"] | null = null;
  /** Whether the light must stop casting for a frame: three keeps a light's shadow once built, and drops it only when it draws with the light not casting. */
  private dropShadow = false;

  constructor(
    private readonly switches: FeatureSwitches,
    private readonly quality: Quality = QUALITY,
  ) {
    switches.subscribe(() => {
      if (!this.light) return;
      if (!switches.isOn("sunShadows")) this.light.castShadow = false;
    });
  }

  /** The light, set up for this renderer. */
  private setUp(light: DirectionalLight, renderer: WebGPURenderer): Rig {
    const rig = this.rig;
    if (rig && rig.light === light && rig.renderer === renderer) return rig;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;
    const shadow = light.shadow;
    shadow.mapSize.set(this.quality.shadowMap, this.quality.shadowMap);
    shadow.radius = BLUR;
    // Toward the light by a few centimetres of depth (three turns it for the reversed depth), and off the surface along its normal, so a surface never shadows itself.
    shadow.bias = -0.00005;
    shadow.normalBias = 0.03;
    const half = this.quality.shadowReachNear;
    Object.assign(shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 600 });
    shadow.camera.updateProjectionMatrix();
    shadow.needsUpdate = true;
    this.rig = { light, renderer };
    return this.rig;
  }

  /** The key light, kept once found: looked for again only once it has left the scene, or in another scene. */
  private find(scene: FeatureFrame["scene"]): DirectionalLight | null {
    const kept = this.light;
    if (kept && kept.parent !== null && this.scene === scene) return kept;
    this.scene = scene;
    this.light = (scene.getObjectByName(KEY_LIGHT_NAME) as DirectionalLight | undefined) ?? null;
    return this.light;
  }

  /** The frame's update: how dark the key light's shadows fall, and where its near map lies. */
  update({ scene, renderer, camera, day, weather }: FeatureFrame): void {
    const light = this.find(scene);
    if (!light) return;
    if (this.dropShadow) {
      this.dropShadow = false;
      light.castShadow = false;
      return;
    }
    // While the shadows are on the light always casts: a change of `castShadow` rebuilds every lit material and remakes the maps, so only a switch makes one.
    if (!light.castShadow) light.castShadow = true;
    this.setUp(light, renderer);
    const { key } = day.sky;
    const casting = key.body === "sun" || this.switches.isOn("moonShadows");
    const intensity = casting ? shadowIntensity(key.body, key.direction.y, weatherInput(weather.weather).clouds) : 0;
    // A shadow too faint to see is faded to nothing and its maps are no longer drawn (they cost their draws); the stale map is still read, at no strength.
    const drawn = intensity > 0.01;
    const strength = drawn ? intensity : 0;
    light.shadow.intensity = strength;
    light.shadow.autoUpdate = drawn;
    if (!drawn) return;
    // The single map: a box round the camera's ground, square to the light and moved in whole texels so its edges never crawl.
    snapNear(light, camera.position, this.quality.shadowReachNear, this.quality.shadowMap);
  }

  dispose(): void {
    this.rig = null;
  }
}

/**
 * Puts the single map's light (and its target) over `around`, with the
 * target moved across the map only in whole texels.
 */
function snapNear(light: DirectionalLight, around: { x: number; y: number; z: number }, half: number, size: number): void {
  const dir = { x: light.position.x - light.target.position.x, y: light.position.y - light.target.position.y, z: light.position.z - light.target.position.z };
  const length = Math.hypot(dir.x, dir.y, dir.z) || 1;
  const toLight = { x: dir.x / length, y: dir.y / length, z: dir.z / length };
  // Two directions across the light's map, steady as the light moves.
  const ref = Math.abs(toLight.y) > 0.99 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
  const right = normalise(cross(ref, toLight));
  const up = cross(toLight, right);
  const texel = (2 * half) / size;
  const along = (v: { x: number; y: number; z: number }) => around.x * v.x + around.y * v.y + around.z * v.z;
  const dr = Math.round(along(right) / texel) * texel - along(right);
  const du = Math.round(along(up) / texel) * texel - along(up);
  const tx = around.x + right.x * dr + up.x * du;
  const ty = around.y + right.y * dr + up.y * du;
  const tz = around.z + right.z * dr + up.z * du;
  light.target.position.set(tx, ty, tz);
  light.target.updateMatrixWorld();
  light.position.set(tx + toLight.x * 300, ty + toLight.y * 300, tz + toLight.z * 300);
  light.updateMatrixWorld();
}

type V = { x: number; y: number; z: number };

function cross(a: V, b: V): V {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function normalise(v: V): V {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}
