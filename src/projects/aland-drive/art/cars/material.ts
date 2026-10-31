import { BufferAttribute, BufferGeometry, MeshBasicNodeMaterial, Vector3, type Color, type Node } from "three/webgpu";
import { attribute, cameraPosition, float, mix, normalWorld, positionGeometry, positionWorld, reflect, select, smoothstep, uniform, vec3 } from "three/tsl";
import { themeColor } from "@/shared/lib/three/theme-color";
import { SURFACES, type Soup, type Surface } from "./mesh";

/*
 * One material for a whole car. The world's own light, the same sum as the
 * buildings', plus what makes it read as a car: the sky and the dark line of the
 * forest reflected at a glancing angle, worked out from the reflected ray with
 * no environment map. The lamps are in the same material, so a lit brake light
 * is a number changing and not another draw call.
 */

const AMBIENT = 0.6;
const SUN_SHARE = 0.62;
const SPECULAR_POWER = 320;
const SPECULAR_SHARE = 0.9;
/** Darkens low on the body, as the road and the car itself shade it. */
const LOW_SHADE = 0.62;

const TAIL_RUNNING = 0.45;
const TAIL_BRAKE = 8;
const LAMP_REVERSE = 2.4;
const LAMP_HEAD = 2.2;

interface Finish {
  /** A token name, or null for the car's own paint. */
  token: string | null;
  /** How much the surface mirrors straight on. */
  mirror: number;
  /** The gloss added at a glancing angle: 0 for rubber, 1 for lacquer and glass. */
  gloss: number;
  metal: number;
  lamp: 0 | 1 | 2 | 3;
}

const FINISHES: Record<Surface, Finish> = {
  paint: { token: null, mirror: 0.04, gloss: 0.5, metal: 0, lamp: 0 },
  glass: { token: "car-glass", mirror: 0.16, gloss: 1, metal: 0, lamp: 0 },
  trim: { token: "car-trim", mirror: 0.03, gloss: 0.35, metal: 0, lamp: 0 },
  cladding: { token: "car-cladding", mirror: 0.015, gloss: 0.12, metal: 0, lamp: 0 },
  gap: { token: "car-gap", mirror: 0, gloss: 0, metal: 0, lamp: 0 },
  under: { token: "car-under", mirror: 0, gloss: 0, metal: 0, lamp: 0 },
  tyre: { token: "car-tyre", mirror: 0.01, gloss: 0.08, metal: 0, lamp: 0 },
  rim: { token: "car-rim", mirror: 0.5, gloss: 0.8, metal: 0.65, lamp: 0 },
  rimDark: { token: "car-rim-dark", mirror: 0.02, gloss: 0.1, metal: 0, lamp: 0 },
  grille: { token: "car-grille", mirror: 0.02, gloss: 0.2, metal: 0, lamp: 0 },
  plate: { token: "car-plate", mirror: 0.03, gloss: 0.2, metal: 0, lamp: 0 },
  lensTail: { token: "car-lens-tail", mirror: 0.03, gloss: 0.2, metal: 0, lamp: 1 },
  lensReverse: { token: "car-lens-reverse", mirror: 0.05, gloss: 0.5, metal: 0, lamp: 2 },
  lensAmber: { token: "car-lens-amber", mirror: 0.05, gloss: 0.5, metal: 0, lamp: 0 },
  lensHead: { token: "car-lens-head", mirror: 0.14, gloss: 1, metal: 0, lamp: 3 },
};

const carToken = (name: string): Color => themeColor(`--color-aland-drive-${name}`);

/** A soup as a geometry: colours and finishes on the vertices, so instances can share it. */
export function geometryOf(soup: Soup): BufferGeometry {
  const colours = new Float32Array(soup.triangles * 9);
  const finishes = new Float32Array(soup.triangles * 12);
  const colourOf = new Map<number, Color | null>();
  SURFACES.forEach((name, index) => {
    const { token } = FINISHES[name];
    colourOf.set(index, token === null ? null : carToken(token));
  });
  soup.surfaces.forEach((surface, vertex) => {
    const finish = FINISHES[SURFACES[surface]];
    const colour = colourOf.get(surface);
    if (colour) colours.set([colour.r, colour.g, colour.b], vertex * 3);
    finishes.set([colour ? finish.mirror : finish.mirror + 1, finish.gloss, finish.metal, finish.lamp], vertex * 4);
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(soup.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(soup.normals, 3));
  geometry.setAttribute("carColour", new BufferAttribute(colours, 3));
  geometry.setAttribute("carFinish", new BufferAttribute(finishes, 4));
  return geometry;
}

export interface CarMaterialOptions {
  sun: { azimuthDeg: number; elevationDeg: number };
  paint: string;
  /** The car's origin above its lowest shaded point. */
  groundY: number;
  /** The world's haze, for a car seen far off. */
  hazed?: (color: Node<"vec3">) => Node<"vec3">;
}

export function carMaterial({ sun, paint, groundY, hazed }: CarMaterialOptions) {
  const azimuth = (sun.azimuthDeg * Math.PI) / 180;
  const elevation = (sun.elevationDeg * Math.PI) / 180;
  const toSun = uniform(new Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), -Math.cos(azimuth) * Math.cos(elevation)));

  const tail = uniform(0);
  const reverse = uniform(0);
  const head = uniform(0);
  const paintRgb = (token: string) => {
    const { r, g, b } = carToken(token);
    return new Vector3(r, g, b);
  };
  const paintColour = uniform(paintRgb(paint));

  const sky = uniform(carToken("sky"));
  const zenith = uniform(carToken("water"));
  const road = uniform(carToken("car-reflect-ground"));
  const treeline = uniform(carToken("tree-spruce"));
  const sunColour = uniform(carToken("sun"));
  const tailGlow = uniform(carToken("car-glow-tail"));
  const headGlow = uniform(carToken("car-glow-head"));

  const finish = attribute<"vec4">("carFinish", "vec4");
  const isPaint = finish.x.greaterThan(0.999);
  const mirror = select(isPaint, finish.x.sub(1), finish.x);
  const gloss = finish.y;
  const metal = finish.z;
  const lamp = finish.w;
  const base = mix(attribute<"vec3">("carColour", "vec3"), paintColour, select(isPaint, float(1), float(0)));

  const toCamera = cameraPosition.sub(positionWorld).normalize();
  const normal = normalWorld.normalize();
  const facing = normal.dot(toCamera).max(0);
  const ray = reflect(toCamera.negate(), normal);
  const up = ray.y;
  const skyward = mix(sky, zenith, smoothstep(float(0.05), float(0.7), up));
  const treeBand = smoothstep(float(-0.02), float(0.03), up).mul(float(1).sub(smoothstep(float(0.09), float(0.2), up)));
  const above = mix(skyward, treeline, treeBand.mul(0.8));
  const reflected = mix(road, above, smoothstep(float(-0.1), float(-0.01), up));

  const lowShade = mix(float(LOW_SHADE), float(1), smoothstep(float(groundY + 0.25), float(groundY + 0.85), positionGeometry.y));
  const lit = float(AMBIENT).mul(lowShade).add(normal.dot(toSun).max(0).mul(SUN_SHARE));
  const fresnel = mirror.add(float(1).sub(mirror).mul(float(1).sub(facing).pow(5)).mul(gloss));
  const diffuse = base.mul(lit);
  const dielectric = mix(diffuse, reflected.mul(lowShade), fresnel);
  const surface = mix(dielectric, base.mul(reflected).mul(1.5), metal);
  const specular = sunColour.mul(ray.dot(toSun).max(0).pow(SPECULAR_POWER)).mul(gloss.mul(SPECULAR_SHARE));

  const isLamp = (kind: number) => select(lamp.sub(kind).abs().lessThan(0.5), float(1), float(0));
  const glow = tailGlow
    .mul(isLamp(1).mul(tail))
    .add(headGlow.mul(isLamp(2).mul(reverse.mul(LAMP_REVERSE))))
    .add(headGlow.mul(isLamp(3).mul(head.mul(LAMP_HEAD))));

  const finished: Node<"vec3"> = vec3(surface.add(specular).add(glow));
  const material = new MeshBasicNodeMaterial();
  material.colorNode = hazed ? hazed(finished) : finished;

  return {
    material,
    setLights({ brake, reversing, headlights }: CarLights) {
      tail.value = (headlights ? TAIL_RUNNING : 0) + (brake ? TAIL_BRAKE : 0);
      reverse.value = reversing ? 1 : 0;
      head.value = headlights ? 1 : 0;
    },
    setPaint(token: string) {
      paintColour.value.copy(paintRgb(token));
    },
  };
}

export interface CarLights {
  brake: boolean;
  reversing: boolean;
  headlights: boolean;
}
