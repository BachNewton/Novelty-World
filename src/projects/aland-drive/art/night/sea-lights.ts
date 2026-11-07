import { AdditiveBlending, InstancedBufferAttribute, Mesh, MeshBasicNodeMaterial } from "three/webgpu";
import { attribute, cameraPosition, cos, cross, float, max, normalize, positionGeometry, sin, smoothstep, varying, vec3 } from "three/tsl";
import { rhythm, type Rhythm } from "./characteristic";
import { quadGeometry, type GlowInstance } from "./glows";
import data from "./lights.json";
import { nightColour, nightRgb, type Night } from "./night";

/*
 * The sea's lights, from OSM's real tags (`lights.py`): every light on the map, with its own rhythm, in its own colour
 * in its own sectors, so a lighthouse shows white, red or green by where the eye is, as a chart says it will. Leading
 * lights are lights like any other, whose sectors happen to be narrow.
 *
 * No light on Åland really turns: they are fixed lenses that flash. The owner wants a beam, so a great light's flash is
 * read as a turning one: its beam goes round once a period, the flash reaches an eye as the beam crosses it, and the
 * characteristic seen from any one place is the true one, only shifted by bearing.
 */

interface LightSector {
  character: string;
  colour: string;
  periodS: number;
  group?: string;
  sequence?: string;
  fromDeg?: number;
  toDeg?: number;
}

export interface SeaLight {
  x: number;
  z: number;
  kind: string;
  name?: string;
  heightM: number | null;
  rangeNm: number | null;
  sectors: LightSector[];
}

export const SEA_LIGHTS = data.lights as SeaLight[];

const METRES_A_NAUTICAL_MILE = 1852;
const FALLBACK_RANGE_NM = 3;
/** A light carries further in the game than its size in the haze would, or the sea would be empty at the scale it's seen. */
const RANGE_GAIN = 1.6;
const SIZE_M: Record<string, number> = { lighthouse: 14, leading: 10, beacon: 7, buoy: 4 };
const MIN_PIXELS: Record<string, number> = { lighthouse: 16, leading: 12, beacon: 10, buoy: 8 };
const COLOURS: Record<string, string> = { white: "sea-white", red: "sea-red", green: "sea-green", yellow: "sea-yellow" };
/** The longest a great light's beam: it needn't reach as far as the flash. */
const BEAM_LONG_M = 1600;
const BEAM_FOOT_M = 1.2;
const BEAM_END_M = 70;
const BEAM_LIGHT = 0.28;
const MIN_TURNING_PERIOD_S = 5;
const WATER_Y = 0.1;

const colourOf = (name: string) => nightRgb(COLOURS[name] ?? "sea-white");

/** Rolled from where a light is, so each keeps its own moment. */
export const shareOf = (x: number, z: number) => {
  const value = Math.sin(x * 0.0173 + z * 0.0311) * 9973.1;
  return value - Math.floor(value);
};

export const turns = (light: SeaLight) => light.kind === "lighthouse" && light.sectors.every(({ character, periodS }) => (character === "Fl" || character === "LFl") && periodS >= MIN_TURNING_PERIOD_S);

/** Where a light's lamp is above the scene's level: the lamp of the mark drawn under it. */
export type LampHeight<L extends SeaLight> = (light: L) => number;

/** Every sea light as glows, a reflection under each, and the rhythms they read: each distinct rhythm once. */
export function seaLightGlows<L extends SeaLight>(lights: readonly L[], lampY: LampHeight<L>): { glows: GlowInstance[]; rhythms: Rhythm[] } {
  const rhythms: Rhythm[] = [];
  const rows = new Map<string, number>();
  const glows: GlowInstance[] = [];
  for (const light of lights) {
    const y = lampY(light);
    const reachM = (light.rangeNm ?? FALLBACK_RANGE_NM) * METRES_A_NAUTICAL_MILE * RANGE_GAIN;
    const phase = shareOf(light.x, light.z);
    const turning = turns(light);
    for (const sector of light.sectors) {
      const found = rhythm(sector);
      const key = JSON.stringify(found);
      if (!rows.has(key)) {
        rows.set(key, rhythms.length);
        rhythms.push(found);
      }
      const glow: GlowInstance = {
        x: light.x,
        y,
        z: light.z,
        sizeM: SIZE_M[light.kind],
        minPixels: MIN_PIXELS[light.kind],
        colour: colourOf(sector.colour),
        brightness: 1,
        reachM,
        rhythm: rows.get(key) ?? -1,
        periodS: found.periodS,
        phase,
        fromDeg: sector.fromDeg,
        toDeg: sector.toDeg,
        turning,
      };
      glows.push(glow, { ...glow, y: WATER_Y, brightness: 0.6, streak: true, reachM: reachM * 0.5 });
    }
  }
  return { glows, rhythms };
}

const ATTRIBUTE_FLOATS = 4;

/** The sweeping beams of the great lights: a soft quad per flash in a period, turning round its lighthouse, one draw. `stand` moves them to their lamps again, as the ground under them sharpens. */
export function createSeaBeams<L extends SeaLight>(night: Night, lights: readonly L[], lampY: LampHeight<L>) {
  const beams = lights.filter(turns).flatMap((light) => {
    const found = rhythm(light.sectors[0]);
    return found.flashes.map(({ fromS, toS }) => ({ light, periodS: found.periodS, angle: 0.5 - (fromS + toS) / 2 / found.periodS, phase: shareOf(light.x, light.z) }));
  });
  const geometry = quadGeometry();
  geometry.instanceCount = beams.length;
  const places = new Float32Array(beams.length * ATTRIBUTE_FLOATS);
  const turning = new Float32Array(beams.length * ATTRIBUTE_FLOATS);
  const placeAttribute = new InstancedBufferAttribute(places, ATTRIBUTE_FLOATS);
  const stand = (heightOf: LampHeight<L>) => {
    beams.forEach(({ light }, at) => {
      places.set([light.x, heightOf(light), light.z, 0], at * ATTRIBUTE_FLOATS);
    });
    placeAttribute.needsUpdate = true;
  };
  stand(lampY);
  beams.forEach(({ periodS, angle, phase }, at) => {
    turning.set([periodS, phase + angle, 0, 0], at * ATTRIBUTE_FLOATS);
  });
  geometry.setAttribute("beamPlace", placeAttribute);
  geometry.setAttribute("beamTurn", new InstancedBufferAttribute(turning, ATTRIBUTE_FLOATS));

  const place = attribute<"vec4">("beamPlace", "vec4");
  const turn = attribute<"vec4">("beamTurn", "vec4");
  const angle = night.seconds.div(turn.x).add(turn.y).mul(Math.PI * 2);
  const way = vec3(sin(angle), 0, cos(angle).negate());
  const along = positionGeometry.x.mul(0.5).add(0.5);
  const toEye = normalize(cameraPosition.sub(place.xyz));
  const sideways = cross(way, toEye);
  const side = normalize(sideways);
  const half = float(BEAM_FOOT_M).add(along.mul(BEAM_END_M - BEAM_FOOT_M));
  const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, side: 2 });
  material.positionNode = place.xyz.add(way.mul(along.mul(BEAM_LONG_M))).add(side.mul(positionGeometry.y.mul(half)));

  const out = varying(along);
  const across = varying(positionGeometry.y);
  const fromSide = varying(smoothstep(float(0.08), float(0.6), max(sideways.length(), float(0))));
  const fade = float(1).sub(out);
  const soft = float(1).sub(across.mul(across)).max(0);
  material.colorNode = nightColour("sea-white").mul(fade.mul(fade).mul(soft).mul(soft).mul(fromSide).mul(BEAM_LIGHT).mul(night.lampsOn));

  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1012;
  mesh.count = beams.length;
  return {
    mesh,
    beams: beams.length,
    stand,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
