import { cameraPosition, float, max, mix, normalize, positionWorld, pow, smoothstep, vec3 } from "three/tsl";
import type { Node, UniformNode, Vector3 } from "three/webgpu";
import type { RoadWeather } from "./weather";

/*
 * What the weather does to a road's surface: water darkens it and makes it a mirror of the sky at a low angle, fresh
 * snow lies over it but for the wheel tracks worn through each lane, and black ice is a glassier, colder sheen. The
 * shine is light of its own, not the surface's colour, so it goes in after the hour's light has tinted the road and
 * before the haze: `inLand` hands it back as a colour that comes out as itself once the hour's light has had it, as
 * the terrain's sea does.
 */

/** What water leaves of a road's colour: wet tarmac and gravel are about half as bright as dry. */
const WET_DARK = 0.55;
/** How much of the sky a fully wet road mirrors face on; it grows to all of it at a grazing angle (Schlick's Fresnel). */
const FACE_ON = 0.04;
const WET_SHINE = 0.42;
const ICE_SHINE = 0.85;
/** The sun's glint on water is a streak down the road towards it: tight across, long along, and this bright. */
const GLINT_ACROSS_POWER = 600;
const GLINT_ALONG = 0.22;
const GLINT = 1;

export interface RoadWeatherInputs {
  weather: RoadWeather;
  /** The sky along a direction with no clouds or disc: for a reflection that can't afford them. */
  skyAlong: (direction: Node<"vec3">) => Node<"vec3">;
  /** Towards the sun, as long as the sun is strong. */
  toSun: UniformNode<"vec3", Vector3>;
  /** A shine as a colour the hour's light will take back to itself. */
  inLand: (colour: Node<"vec3">) => Node<"vec3">;
  snow: Node<"vec3">;
  ice: Node<"vec3">;
  /** The season's snow lying beside the road, 0 to 1: the plough banks it over the shoulder, whatever falls now. */
  lying: Node<"float">;
}

/** Soft band of `value` between `low` and `high`, with soft edges of `soft`. */
const band = (value: Node<"float">, low: number, high: number, soft: number) => smoothstep(float(low - soft), float(low), value).mul(float(1).sub(smoothstep(float(high), float(high + soft), value)));

export function roadWeather({ weather, skyAlong, toSun, inLand, snow, ice, lying }: RoadWeatherInputs) {
  /** How much snow lies on a carriageway at `across` (0 at its middle, 1 at its edge), or on its shoulder: the wheels wear two tracks in each lane. */
  const snowCover = (across: Node<"float">, shoulder: Node<"float">) => {
    const tracks = band(across, 0.25, 0.31, 0.04).add(band(across, 0.69, 0.75, 0.04)).min(1);
    const onCarriageway = smoothstep(float(0.05), float(0.6), weather.snow).mul(float(1).sub(tracks.mul(mix(float(0.45), float(0.2), weather.snow))));
    return mix(onCarriageway, max(smoothstep(float(0), float(0.35), weather.snow), lying), shoulder);
  };

  /** A road's colour under the weather, before the hour's light: snow over it, and darker where wet. */
  const surface = (colour: Node<"vec3">, cover: Node<"float">) => mix(colour.mul(mix(float(1), float(WET_DARK), weather.wet)), snow, cover);

  /** The shine on a road's surface where it isn't under snow: the sky mirrored, the sun's glint, colder on ice. */
  const shine = (cover: Node<"float">, light: Node<"float">) => {
    const view = normalize(positionWorld.sub(cameraPosition));
    const mirrored = vec3(view.x, view.y.negate(), view.z);
    const grazing = float(1).sub(view.y.negate().max(0));
    const fresnel = float(FACE_ON).add(float(1 - FACE_ON).mul(pow(grazing, float(5))));
    const amount = max(weather.wet.mul(WET_SHINE), weather.ice.mul(ICE_SHINE)).mul(float(1).sub(cover));
    const sky = mix(skyAlong(mirrored), skyAlong(mirrored).mul(ice), weather.ice);
    const strength = toSun.length();
    const towardSun = toSun.div(max(strength, float(0.0001)));
    const across = pow(normalize(mirrored.xz).dot(normalize(towardSun.xz.add(0.00001))).max(0), float(GLINT_ACROSS_POWER));
    const along = float(1).sub(smoothstep(float(0), float(GLINT_ALONG), mirrored.y.sub(towardSun.y).abs()));
    const glint = across.mul(along).mul(strength).mul(GLINT);
    return inLand(sky.mul(fresnel).add(glint).mul(amount).mul(light.min(1)));
  };

  return { snowCover, surface, shine };
}
