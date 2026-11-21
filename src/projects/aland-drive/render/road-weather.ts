import { cameraPosition, float, max, mix, normalize, positionWorld, pow, smoothstep, vec3 } from "three/tsl";
import type { Node, UniformNode, Vector3 } from "three/webgpu";
import { changeOf } from "../art/season";
import { BANKED_SNOW, snowDrifts, snowPatches } from "../art/surfaces/snow";
import type { RoadWeather } from "./weather";

/*
 * What the weather does to a road's surface: water darkens it and makes it a mirror of the sky at a low angle, snow
 * lies over it, fresh or packed, but for the wheel tracks worn through each lane, and ice is a glassier, colder sheen,
 * on the bare road or on packed snow polished by a frost. The
 * shine is light of its own, not the surface's colour, so it goes in after the hour's light has tinted the road and
 * before the haze: `inLand` hands it back as a colour that comes out as itself once the hour's light has had it, as
 * the terrain's sea does.
 *
 * A road's snow is the land's snow, lying on a road. Thin, it lies where no wheel runs: along the edges where the
 * plough leaves it, down the middle and between the tracks, with the tracks bare to the road, each on its own ragged
 * threshold as the land's patches are. Packed, it covers the tracks too, which show only as a little of the road
 * through it. It carries the land's own drifts, which run on from the field across the road's edge, at all but the
 * land's own brightness, and on the shoulder it is the ploughed bank's, as the land beside it is. So in a white
 * winter a road is two pairs of faint tracks through the snow, not a band of another colour laid over it.
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

/** Packed snow in a lane, as a share of the snow's brightness: driven on, and a shade under the heaped snow beside it. */
const PACKED_SNOW = 0.95;
/** How much snow on a road counts as none, and as all of it lying: a winter road's packed snow is all. */
const LIES = [0.05, 0.6] as const;
/** A fall this heavy lies fresh over the packed snow, as bright as the bank's. */
const FRESH = [0.6, 1] as const;
/** Each place on a road has its own threshold for snow to lie: this between the tracks, ragged by two sizes of patch, metres, spread this far. */
const PATCH_M = [9, 2.3] as const;
const PATCH_SHARES = [0.35, 0.65] as const;
const PATCH_SPREAD = 0.3;
const PATCH_BASE = 0.5;
const PATCH_SOFTNESS = 0.18;
const SALT = 4409;
/** It lies first along a carriageway's edges, from this far across to the edge, then down its middle, out to this far across, and last in the wheel tracks. */
const EDGE_FROM = 0.7;
const EDGE_LEAN = -0.35;
const MIDDLE_TO = [0.06, 0.2] as const;
const MIDDLE_LEAN = -0.25;
const TRACK_LEAN = 0.4;
/** What a wheel track shows of the road through the snow, thin and packed, and how soft its edges are, as a share of the lane. */
const TRACK_THROUGH = [0.5, 0.12] as const;
const TRACK_SOFT = 0.09;
/** The tracks wander by this share of a lane's half-width, over this many metres, and are worn this unevenly along the road. */
const TRACK_WANDER = 0.04;
const TRACK_WANDER_M = 17;
const TRACK_UNEVEN = 0.45;
const TRACK_UNEVEN_M = 6;
/** Thin spots in a lane's snow let this much of the road through. */
const MOTTLED = 0.04;
/** Thin snow is see-through, as it is on the land: the share of it drawn when little lies, reaching all of it as it packs. */
const THIN_SHOWN = 0.72;
/** Far off the patches settle on the share they cover, and the tracks are lost in the snow. */
const PATCHES_SETTLE_M = [120, 350] as const;
const TRACKS_GONE_M = [220, 600] as const;

/** The snow lying at a place on a road: how much of the road it covers, and how bright it lies. */
export interface RoadSnow {
  cover: Node<"float">;
  brightness: Node<"float">;
}

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

const closeUp = (toCamera: Node<"float">, gone: readonly [number, number]) => float(1).sub(smoothstep(float(gone[0]), float(gone[1]), toCamera));

export function roadWeather({ weather, skyAlong, toSun, inLand, snow, ice, lying }: RoadWeatherInputs) {
  const lies = smoothstep(float(LIES[0]), float(LIES[1]), weather.snow);
  const packed = mix(float(PACKED_SNOW), float(BANKED_SNOW), smoothstep(float(FRESH[0]), float(FRESH[1]), weather.snow));

  /**
   * The snow on a carriageway at `across` (0 at its middle, 1 at its edge), or on its shoulder: the wheels wear two
   * tracks in each lane, and the shoulder lies under the ploughed bank.
   */
  const snowCover = (across: Node<"float">, shoulder: Node<"float">): RoadSnow => {
    const place = positionWorld.xz;
    const toCamera = positionWorld.sub(cameraPosition).length();
    const fine = snowPatches(place.div(PATCH_M[1]), SALT + 1);
    const wandering = across.add(snowPatches(place.div(TRACK_WANDER_M), SALT + 2).sub(0.5).mul(TRACK_WANDER));
    const worn = mix(float(1 - TRACK_UNEVEN), float(1), snowPatches(place.div(TRACK_UNEVEN_M), SALT + 3));
    const tracks = band(wandering, 0.25, 0.31, TRACK_SOFT).add(band(wandering, 0.69, 0.75, TRACK_SOFT)).min(1).mul(worn).mul(closeUp(toCamera, TRACKS_GONE_M));
    const middle = float(1).sub(smoothstep(float(MIDDLE_TO[0]), float(MIDDLE_TO[1]), across));
    const lean = float(PATCH_BASE).add(tracks.mul(TRACK_LEAN)).add(smoothstep(float(EDGE_FROM), float(1), across).mul(EDGE_LEAN)).add(middle.mul(MIDDLE_LEAN));
    const patch = snowPatches(place.div(PATCH_M[0]), SALT).mul(PATCH_SHARES[0]).add(fine.mul(PATCH_SHARES[1]));
    // What the patches average to, which they settle on as they get too small to draw.
    const settled = lies.mul(1 + PATCH_SOFTNESS).sub(lean).div(PATCH_SPREAD).add(0.5).clamp(0, 1);
    const patchy = mix(settled, changeOf(lies, lean.add(patch.sub(0.5).mul(PATCH_SPREAD)).clamp(0.02, 1), PATCH_SOFTNESS), closeUp(toCamera, PATCHES_SETTLE_M));
    const inLane = patchy.mul(float(1).sub(tracks.mul(mix(float(TRACK_THROUGH[0]), float(TRACK_THROUGH[1]), lies)))).mul(mix(float(1 - MOTTLED), float(1), fine)).mul(mix(float(THIN_SHOWN), float(1), lies));
    return {
      cover: mix(inLane, max(smoothstep(float(0), float(0.35), weather.snow), lying), shoulder),
      brightness: mix(packed, float(BANKED_SNOW), shoulder).mul(snowDrifts(place, toCamera)),
    };
  };

  /** What lies on a road as the snow at a place on it, or a share of plain packed snow, for a road too far off to have its own. */
  const lyingAs = (lying: RoadSnow | Node<"float">): RoadSnow => ("brightness" in lying ? lying : { cover: lying, brightness: packed });

  /** A road's colour under the weather, before the hour's light: darker where wet, and under the snow that lies on it. */
  const surface = (colour: Node<"vec3">, lying: RoadSnow | Node<"float">) => {
    const { cover, brightness } = lyingAs(lying);
    return mix(colour.mul(mix(float(1), float(WET_DARK), weather.wet)), snow.mul(brightness), cover);
  };

  /** The shine on a road's surface: the sky mirrored and the sun's glint in water where no snow lies, and colder in ice. */
  const shine = (lying: RoadSnow | Node<"float">, light: Node<"float">) => {
    const { cover } = lyingAs(lying);
    const view = normalize(positionWorld.sub(cameraPosition));
    const mirrored = vec3(view.x, view.y.negate(), view.z);
    const grazing = float(1).sub(view.y.negate().max(0));
    const fresnel = float(FACE_ON).add(float(1 - FACE_ON).mul(pow(grazing, float(5))));
    // Water shines only where no snow lies. Ice shines wherever the weather has it: on a winter road it is the snow itself, polished.
    const amount = max(weather.wet.mul(WET_SHINE).mul(float(1).sub(cover)), weather.ice.mul(ICE_SHINE));
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
