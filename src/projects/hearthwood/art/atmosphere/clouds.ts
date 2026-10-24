import { cameraPosition, dot, float, max, mix, normalize, positionWorld, pow, smoothstep, vec2 } from "three/tsl";
import type { Node } from "three/webgpu";
import type { AtmosphereUniforms } from "../atmosphere";
import type { FeatureArt } from "../feature-art";
import { colourUniform } from "../tsl";
import { weatherColours } from "./colours";
import { CLOUD_FIELD, cloudCoverage, cloudNoiseAt, updateCloudField } from "./cloud-field";

/*
 * The clouds, painted on the sky (`clouds`): two layers on the dome from the
 * shared cloud field (`cloud-field.ts`), so a cloud overhead is the one whose
 * shadow lies on the land. Each pixel of the sky looks up its ray to the
 * heaped layer's base and reads the field there: the cover where it stands,
 * puffed into heaps by the billows and frayed at its edges. A cloud is lit
 * by the sun or the moon from the side it stands towards, its edges towards
 * the light shining silver where the cloud thins (the field read a step
 * nearer the light against here), its body shaded below towards the
 * weather's grey, and glowing with forward light round the sun. Above, a
 * thin high veil streams along the wind. The weather sets the cover, how
 * heaped and how low; the wind carries them; a flash of lightning lights
 * them from inside. Towards the horizon they thin into the haze.
 */

/** The high veil's height, in metres. */
const VEIL = 6500;
/** How far a cloud is looked along towards the light, for its lit edge, in metres. */
const TOWARDS_LIGHT = 500;

const light = {
  key: colourUniform(),
  sky: colourUniform(),
  cloud: colourUniform(),
  shade: colourUniform(),
  flash: colourUniform(),
};

function painted(colour: Node<"vec3">, air: AtmosphereUniforms): Node<"vec3"> {
  const dir = normalize(positionWorld.sub(cameraPosition));
  const up = max(dir.y, 0.015);
  const shape = CLOUD_FIELD.shape;
  // Where the ray crosses the heaped layer's base: the clouds are painted there.
  const reach = shape.z.sub(cameraPosition.y).max(100).div(up);
  const at = cameraPosition.xz.add(dir.xz.mul(reach));
  const sun = air.uHwSunDir;
  const towards = normalize(vec2(sun.x, sun.z).add(vec2(1e-4, 0))).mul(TOWARDS_LIGHT);
  const drifted = at.add(CLOUD_FIELD.drift.mul(1.15));
  const puffs = cloudNoiseAt(drifted, 2300, 0.21).g;
  const fray = cloudNoiseAt(drifted, 700).b;
  const lumpy = puffs.sub(0.5).mul(shape.y.mul(0.5).add(0.15)).add(fray.sub(0.5).mul(0.25));
  const cover = cloudCoverage(at).add(lumpy).clamp();
  const nearLight = cloudCoverage(at.add(towards)).add(lumpy).clamp();
  // Thinner towards the light: the cloud's edge on that side catches it.
  const edge = cover.sub(nearLight).max(0).mul(2.5).add(float(1).sub(cover).mul(0.6)).clamp();
  const cosine = dot(dir, sun);
  const forward = pow(max(cosine, 0), 8).mul(1.6).add(0.35);
  const sunUp = smoothstep(-0.12, 0.08, sun.y);
  const body = mix(light.shade, light.cloud, edge.mul(0.5).add(shape.y.mul(0.25)).add(0.2));
  const lit = body.mul(light.sky.mul(0.9)).add(light.cloud.mul(light.key).mul(edge.mul(forward).add(0.25)).mul(sunUp)).add(light.flash);
  // Towards the horizon the clouds thin into the haze, as far ones do.
  const near = smoothstep(0.02, 0.16, dir.y);
  const opacity = smoothstep(0.05, 0.6, cover).mul(near).mul(0.92);
  // The high veil: thin streaks along the wind, lit from the sun's side.
  const veilAt = cameraPosition.xz.add(dir.xz.mul(float(VEIL).sub(cameraPosition.y).div(up))).add(CLOUD_FIELD.drift.mul(1.6));
  const streaks = cloudNoiseAt(veilAt, 21000).a.mul(cloudNoiseAt(veilAt, 4100, 0.5).r);
  const veil = smoothstep(0.18, 0.5, streaks).mul(shape.x.mul(0.7).add(0.15)).mul(near).mul(0.45);
  const veilLight = light.cloud.mul(light.sky.add(light.key.mul(pow(max(cosine, 0), 4).mul(0.6).add(0.2))));
  const withVeil = mix(colour, veilLight, veil);
  return mix(withVeil, lit, opacity);
}

export const CLOUDS_ART: FeatureArt = {
  feature: "clouds",
  stages: [{ kinds: ["sky"], colour: (colour, { air }) => painted(colour, air) }],
  frame: (frame) => {
    updateCloudField(frame);
    const { atmosphere, weather, sky } = frame;
    const colours = weatherColours();
    light.key.value.copy(atmosphere.uHwKeyLight.value).multiplyScalar(0.5);
    // The sky's own light overhead, so a cloud is never darker than the sky behind it by day nor brighter by night.
    light.sky.value.copy(sky.uSky.value).lerp(atmosphere.uHwHaze.value, 0.5).multiplyScalar(1.15);
    light.cloud.value.copy(colours.cloud);
    // The fuller and flatter the sky, the greyer its clouds.
    const grey = weather.weather.cloudCover * (1 - 0.5 * weather.weather.heaped);
    light.shade.value.copy(colours.cloudShade).lerp(colours.cloud, 0.5 - 0.4 * grey);
    light.flash.value.copy(colours.lightning).multiplyScalar(weather.flash * 1.1);
  },
};
