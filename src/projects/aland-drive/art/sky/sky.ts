import { BackSide, DataTexture, LinearFilter, LinearMipmapLinearFilter, Mesh, MeshBasicNodeMaterial, NoColorSpace, RepeatWrapping, RGBAFormat, SphereGeometry, Vector2, Vector3, type Node } from "three/webgpu";
import { dot, float, fract, max, mix, normalize, positionLocal, screenCoordinate, smoothstep, sqrt, texture, uniform, vec2, vec3 } from "three/tsl";
import { themeColor } from "@/shared/lib/three/theme-color";
import { cloudPixels } from "./cloud-noise";

/*
 * The sky: one coarse dome round the eye, drawn after everything opaque so the ground and the trees spare it every pixel
 * they cover. The gradient and the sun are plain sums. The clouds are five reads of one tiling texture, on a plane that
 * curves down to the horizon, so there is no noise to work out per pixel and no ray to march.
 *
 * Everything a look says is a uniform, so changing the hour rebuilds nothing. Colours are mixes of the game's tokens.
 *
 * Below the horizon the dome is the horizon, and `hazeAlong` is that same colour for whatever the haze hides, so land and
 * sea melt into the sky at any hour.
 */

const CLOUD_PIXELS = 512;
const DOME_WIDTH_SEGMENTS = 16;
const DOME_HEIGHT_SEGMENTS = 8;
/** After every opaque thing, so the depth test spares whatever they cover. */
const DRAWN_LAST = 1000;

/** How the cloud plane curves down: the larger, the less the clouds crowd towards the horizon. */
const PLANE_CURVE = 0.14;
const SHAPE_SCALE = 0.17;
const DETAIL_SCALE = 0.53;
const SLOW_SCALE = 0.041;
const CIRRUS_SCALE = 0.1;
/** The cirrus is one slow field pulled long along its wind, and bent, or it would run in straight rays to a vanishing point. */
const CIRRUS_STRETCH = 3;
const CIRRUS_BEND = 0.3;
const BEND = 0.045;
/** How deep the fine billows eat into a cloud. */
const ERODE = 0.3;
/** How far cloud gathers in one part of the sky and clears from another, in shares of the threshold. */
const GATHER = 0.34;
/** The soft width of a cloud's edge, in the texture's values. */
const EDGE = 0.17;
/** How far, along the sun's way, the read that lights a cloud looks. */
const LIGHT_STEP = 0.022;
const LIGHT_GAIN = 3.4;
/** Over this rise the sky leaves the haze's colour exactly. */
const FOOT_Y = 0.02;
const CLOUDS_FROM_Y = 0.012;
const CLOUDS_FULL_Y = 0.13;
const AIR_OVER_CLOUDS_TO_Y = 0.26;
const CIRRUS_SHARE = 0.16;
/** Over this drop below the horizon, flat water melts into the sky's foot: a low eye sees 20 km of sea in a pixel, far past what haze by distance can reach. */
const SEA_MELT_Y = 0.04;
/** A direction never quite lies flat, or one straight down would have no length. */
const LEVEL_Y = 0.0001;
/** A wind's speed turned into the texture's scale: a cloud 1.5 km up, in shares of a tile a second per m/s. */
const WIND_TO_UV = (1 / 1500) * SHAPE_SCALE;
/** The layers drift a little apart, so the shapes change as they go. */
const DETAIL_DRIFT = 1.25;
const SLOW_DRIFT = 0.8;
const CIRRUS_DRIFT = 0.35;
const SUN_DISC_COS = 0.99996;
const SUN_RIM_COS = 0.9998;
const SUN_DISC_BRIGHT = 3;
const DITHER_LEVELS = 255;

/** Where something is in the sky, as the manifest's sun: clockwise from grid north, and up from the horizon. */
export interface SkyPlace {
  azimuthDeg: number;
  elevationDeg: number;
}

export interface SkyLook {
  sun: SkyPlace;
  /** The share of the sky under cloud, 0 to 1. */
  cloudCover: number;
  /** The wind at cloud height: the way it blows towards, and its speed in m/s. */
  wind: { towardDeg: number; speedMS: number };
  zenith: Vector3;
  /** The horizon itself, which is the haze's colour, away from the sun and towards it. */
  horizon: Vector3;
  horizonSun: Vector3;
  /** The pale band over the horizon, likewise. */
  band: Vector3;
  bandSun: Vector3;
  /** How high the band reaches, as a direction's height. */
  bandTop: number;
  glow: Vector3;
  sunDisc: Vector3;
  cloudLit: Vector3;
  cloudShade: Vector3;
  /** Added to a cloud's bright edges near the sun. */
  cloudRim: Vector3;
  /** What the sunlight does to the land's colours at this look, for when the land follows it. */
  landLight: Vector3;
}

const linear = (name: string) => {
  const { r, g, b } = themeColor(`--color-aland-drive-${name}`);
  return new Vector3(r, g, b);
};
const blend = (from: Vector3, to: Vector3, share: number) => from.clone().lerp(to, share);
/** A colour seen through more of itself: deeper and more saturated, as the sky is straight up. */
const deepened = ({ x, y, z }: Vector3, by: number) => new Vector3(x ** by, y ** by, z ** by);

/** The two looks, from the live tokens: a clear Nordic summer's day, the game's own, and a golden hour to compare. */
export function skyLooks(): { summer: SkyLook; goldenHour: SkyLook } {
  const sky = linear("sky");
  const sun = linear("sun");
  const water = linear("water");
  const shade = linear("ui-shade");
  const trim = linear("wall-trim");
  const ember = linear("edge");
  const gold = linear("ui-accent");
  return {
    summer: {
      sun: { azimuthDeg: 215, elevationDeg: 30 },
      cloudCover: 0.42,
      wind: { towardDeg: 70, speedMS: 14 },
      zenith: deepened(sky, 2),
      horizon: sky,
      horizonSun: sky,
      band: blend(sky, sun, 0.42),
      bandSun: blend(sky, sun, 0.5),
      bandTop: 0.34,
      glow: blend(sun, sky, 0.1).multiplyScalar(0.6),
      sunDisc: sun.clone().multiplyScalar(SUN_DISC_BRIGHT),
      cloudLit: trim,
      cloudShade: blend(blend(sky, shade, 0.34), water, 0.22),
      cloudRim: sun.clone().multiplyScalar(0.35),
      landLight: new Vector3(1, 1, 1),
    },
    goldenHour: {
      sun: { azimuthDeg: 300, elevationDeg: 6 },
      cloudCover: 0.46,
      wind: { towardDeg: 70, speedMS: 14 },
      zenith: blend(deepened(sky, 2.4), shade, 0.2),
      horizon: blend(blend(sky, sun, 0.55), ember, 0.08),
      horizonSun: blend(gold, ember, 0.35),
      band: blend(sky, sun, 0.5),
      bandSun: blend(gold, sun, 0.45),
      bandTop: 0.3,
      glow: blend(gold, ember, 0.25).multiplyScalar(0.8),
      sunDisc: blend(sun, gold, 0.3).multiplyScalar(SUN_DISC_BRIGHT),
      cloudLit: blend(blend(sun, gold, 0.4), ember, 0.25),
      cloudShade: blend(blend(shade, water, 0.45), ember, 0.16),
      cloudRim: blend(gold, ember, 0.2).multiplyScalar(0.8),
      landLight: blend(new Vector3(1, 1, 1), gold, 0.45).multiplyScalar(0.85),
    },
  };
}

function toSunOf({ azimuthDeg, elevationDeg }: SkyPlace, into: Vector3) {
  const azimuth = (azimuthDeg * Math.PI) / 180;
  const elevation = (elevationDeg * Math.PI) / 180;
  return into.set(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), -Math.cos(azimuth) * Math.cos(elevation));
}

function cloudTexture() {
  const map = new DataTexture(cloudPixels(CLOUD_PIXELS), CLOUD_PIXELS, CLOUD_PIXELS, RGBAFormat);
  map.colorSpace = NoColorSpace;
  map.wrapS = map.wrapT = RepeatWrapping;
  map.magFilter = LinearFilter;
  map.minFilter = LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.needsUpdate = true;
  return map;
}

/** Hides the steps of an 8-bit gradient: a screen-fixed pattern of about one level, in linear light, where a level's size follows the root of the value. */
function dithered(colour: Node<"vec3">) {
  const pattern = fract(fract(dot(screenCoordinate.xy, vec2(0.06711056, 0.00583715))).mul(52.9829189));
  return colour.add(sqrt(max(colour, vec3(0.0004))).mul(pattern.sub(0.5).mul(2.2 / DITHER_LEVELS)));
}

/** A value to the eighth power. */
function sharpened(value: Node<"float">) {
  const fourth = value.mul(value).mul(value.mul(value));
  return fourth.mul(fourth);
}

export interface Sky {
  /** Add this to the scene. */
  mesh: Mesh;
  /** The sky along a direction, clouds and all: five texture reads. For a reflection worth them. */
  colourAlong: (direction: Node<"vec3">) => Node<"vec3">;
  /** The sky along a direction with no clouds or sun disc: no texture reads. For a reflection that can't afford them. */
  clearAlong: (direction: Node<"vec3">) => Node<"vec3">;
  /** The colour at the foot of the sky under a direction: what the haze fades to, so the ground meets the sky with no line. */
  hazeAlong: (direction: Node<"vec3">) => Node<"vec3">;
  /** A flat water colour along a direction from the eye, melted into the sky's foot at the horizon. For open water only: it would swallow land. */
  seaToSky: (colour: Node<"vec3">, direction: Node<"vec3">) => Node<"vec3">;
  /** Each frame, before drawing: keeps the dome round the eye and moves the clouds on. */
  update: (eye: Vector3, seconds: number) => void;
  /** Takes on a look at once. Cheap: a few uniforms. */
  setLook: (look: SkyLook) => void;
  /** The current look's light on the land. */
  landLight: Vector3;
  dispose: () => void;
}

export interface SkyOptions {
  /** The dome's radius, in metres: within the camera's far plane. */
  reach: number;
  look: SkyLook;
}

export function createSky({ reach, look }: SkyOptions): Sky {
  const uniforms = {
    toSun: uniform(new Vector3()),
    sunFlat: uniform(new Vector3()),
    cover: uniform(0),
    bandTop: uniform(0),
    zenith: uniform(new Vector3()),
    horizon: uniform(new Vector3()),
    horizonSun: uniform(new Vector3()),
    band: uniform(new Vector3()),
    bandSun: uniform(new Vector3()),
    glow: uniform(new Vector3()),
    sunDisc: uniform(new Vector3()),
    cloudLit: uniform(new Vector3()),
    cloudShade: uniform(new Vector3()),
    cloudRim: uniform(new Vector3()),
    shapeShift: uniform(new Vector2()),
    detailShift: uniform(new Vector2()),
    slowShift: uniform(new Vector2()),
    cirrusShift: uniform(new Vector2()),
    cirrusAlong: uniform(new Vector2(1, 0)),
  };
  const landLight = new Vector3(1, 1, 1);
  const wind = new Vector2();

  const setLook = (next: SkyLook) => {
    toSunOf(next.sun, uniforms.toSun.value);
    uniforms.sunFlat.value.set(uniforms.toSun.value.x, 0, uniforms.toSun.value.z).normalize();
    uniforms.cover.value = next.cloudCover;
    uniforms.bandTop.value = next.bandTop;
    uniforms.zenith.value.copy(next.zenith);
    uniforms.horizon.value.copy(next.horizon);
    uniforms.horizonSun.value.copy(next.horizonSun);
    uniforms.band.value.copy(next.band);
    uniforms.bandSun.value.copy(next.bandSun);
    uniforms.glow.value.copy(next.glow);
    uniforms.sunDisc.value.copy(next.sunDisc);
    uniforms.cloudLit.value.copy(next.cloudLit);
    uniforms.cloudShade.value.copy(next.cloudShade);
    uniforms.cloudRim.value.copy(next.cloudRim);
    const toward = (next.wind.towardDeg * Math.PI) / 180;
    uniforms.cirrusAlong.value.set(Math.sin(toward), -Math.cos(toward));
    wind.copy(uniforms.cirrusAlong.value).multiplyScalar(next.wind.speedMS * WIND_TO_UV);
    landLight.copy(next.landLight);
  };
  setLook(look);

  const clouds = cloudTexture();

  /** Above the horizon, or lying on it. */
  const skyward = (direction: Node<"vec3">) => {
    return normalize(vec3(direction.x, max(direction.y, LEVEL_Y), direction.z));
  };

  /** The clear sky along a direction already skyward. */
  const clearSky = (way: Node<"vec3">) => {
    const facing = dot(way, uniforms.sunFlat).mul(0.5).add(0.5);
    const warmth = facing.mul(facing).mul(facing);
    const band = mix(uniforms.band, uniforms.bandSun, warmth);
    const high = mix(band, uniforms.zenith, sqrt(way.y));
    const foot = mix(uniforms.horizon, uniforms.horizonSun, warmth);
    const rising = smoothstep(float(0), float(FOOT_Y), way.y).mul(smoothstep(float(0), uniforms.bandTop, way.y).mul(0.75).add(0.25));
    const toward = max(dot(way, uniforms.toSun), 0);
    // Powers by squaring: this runs for every pixel of sky, and in any reflection.
    const squared = toward.mul(toward);
    const broad = squared.mul(squared).mul(squared);
    const tight = sharpened(broad);
    const close = sharpened(tight);
    const glow = broad.mul(0.16).add(tight.mul(0.3)).add(close.mul(0.45));
    return mix(foot, high, rising).add(uniforms.glow.mul(glow));
  };

  const cloudySky = (way: Node<"vec3">) => {
    const place = way.xz.div(way.y.add(PLANE_CURVE));
    const slow = texture(clouds, place.mul(SLOW_SCALE).add(uniforms.slowShift));
    const shapeUv = place.mul(SHAPE_SCALE).add(uniforms.shapeShift).add(vec2(slow.b, slow.a).sub(0.5).mul(BEND));
    const shape = texture(clouds, shapeUv).r;
    const fine = texture(clouds, place.mul(DETAIL_SCALE).add(uniforms.detailShift)).g;
    const threshold = float(1).sub(uniforms.cover).add(slow.b.sub(0.5).mul(GATHER));
    // The fine billows only eat at the edges: deep inside a cloud they have nothing to take.
    const mass = shape.sub(float(1).sub(fine).mul(ERODE).mul(float(1).sub(smoothstep(threshold, threshold.add(0.3), shape))));
    const horizonFade = smoothstep(float(CLOUDS_FROM_Y), float(CLOUDS_FULL_Y), way.y);
    const cover = smoothstep(threshold, threshold.add(EDGE), mass).mul(horizonFade);
    const towardSun = texture(clouds, shapeUv.add(uniforms.sunFlat.xz.mul(LIGHT_STEP))).r;
    const lit = shape.sub(towardSun).mul(LIGHT_GAIN).add(0.56).clamp(0, 1);
    const deep = smoothstep(threshold.add(0.08), threshold.add(0.42), mass);
    const light = lit.mul(float(1).sub(deep.mul(0.45))).add(float(1).sub(deep).mul(0.25)).clamp(0, 1);
    const toward = max(dot(way, uniforms.toSun), 0);
    const near = toward.mul(toward).mul(toward);
    const rim = uniforms.cloudRim.mul(near.mul(near).mul(near).mul(near)).mul(float(1).sub(deep));
    const sky = clearSky(way);
    const airOver = float(1).sub(smoothstep(float(CLOUDS_FROM_Y), float(AIR_OVER_CLOUDS_TO_Y), way.y)).mul(0.72);
    const cloud = mix(mix(uniforms.cloudShade, uniforms.cloudLit, light).add(rim), sky, airOver);

    const cirrusAcross = vec2(uniforms.cirrusAlong.y.negate(), uniforms.cirrusAlong.x);
    const cirrusUv = vec2(dot(place, uniforms.cirrusAlong), dot(place, cirrusAcross).mul(CIRRUS_STRETCH)).mul(CIRRUS_SCALE).add(uniforms.cirrusShift).add(vec2(slow.a, slow.b).sub(0.5).mul(CIRRUS_BEND));
    const cirrus = smoothstep(float(0.66), float(1), texture(clouds, cirrusUv).a).mul(horizonFade).mul(CIRRUS_SHARE);

    const withCirrus = mix(sky, uniforms.cloudLit, cirrus);
    const disc = smoothstep(float(SUN_RIM_COS), float(SUN_DISC_COS), dot(way, uniforms.toSun));
    const seen = mix(withCirrus, uniforms.sunDisc, disc.mul(float(1).sub(cirrus)));
    return mix(seen, cloud, cover);
  };

  const colourAlong = (direction: Node<"vec3">) => cloudySky(skyward(direction));
  const clearAlong = (direction: Node<"vec3">) => clearSky(skyward(direction));
  const hazeAlong = (direction: Node<"vec3">) => clearSky(normalize(vec3(direction.x, float(LEVEL_Y), direction.z)));

  const seaToSky = (colour: Node<"vec3">, direction: Node<"vec3">) => {
    const clear = smoothstep(float(0), float(SEA_MELT_Y), normalize(direction).y.negate());
    return mix(hazeAlong(direction), colour, clear.mul(clear));
  };

  const geometry = new SphereGeometry(reach, DOME_WIDTH_SEGMENTS, DOME_HEIGHT_SEGMENTS);
  const material = new MeshBasicNodeMaterial({ side: BackSide, depthWrite: false });
  material.colorNode = dithered(colourAlong(positionLocal));
  material.fog = false;
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = DRAWN_LAST;

  const advance = (shift: { value: Vector2 }, by: number) => {
    shift.value.addScaledVector(wind, -by);
    shift.value.set(shift.value.x - Math.floor(shift.value.x), shift.value.y - Math.floor(shift.value.y));
  };

  return {
    mesh,
    colourAlong,
    clearAlong,
    hazeAlong,
    seaToSky,
    update(eye, seconds) {
      mesh.position.copy(eye);
      advance(uniforms.shapeShift, seconds);
      advance(uniforms.detailShift, seconds * DETAIL_DRIFT * (DETAIL_SCALE / SHAPE_SCALE));
      advance(uniforms.slowShift, seconds * SLOW_DRIFT * (SLOW_SCALE / SHAPE_SCALE));
      advance(uniforms.cirrusShift, seconds * CIRRUS_DRIFT * (CIRRUS_SCALE / SHAPE_SCALE));
    },
    setLook,
    landLight,
    dispose() {
      geometry.dispose();
      material.dispose();
      clouds.dispose();
    },
  };
}
