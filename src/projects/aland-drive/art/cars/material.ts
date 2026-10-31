import { BufferAttribute, BufferGeometry, DoubleSide, MeshBasicNodeMaterial, Vector3, type Color, type Node } from "three/webgpu";
import { attribute, cameraPosition, cos, float, fract, frontFacing, mix, normalGeometry, normalize, normalWorld, positionGeometry, positionWorld, reflect, screenCoordinate, select, sin, smoothstep, uniform, vec2, vec3 } from "three/tsl";
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

/** How much of a straight-on view a hero's glass lets through, and mirrors. */
const GLASS_CLEAR = 0.62;
const GLASS_MIRROR = 0.1;
/** How much of the swap distance the two tiers take to dissolve across. */
const DISSOLVE_SHARE = 0.15;

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
  seat: { token: "car-seat", mirror: 0.01, gloss: 0.1, metal: 0, lamp: 0 },
  seatTan: { token: "car-seat-tan", mirror: 0.01, gloss: 0.1, metal: 0, lamp: 0 },
  interior: { token: "car-interior", mirror: 0.01, gloss: 0.1, metal: 0, lamp: 0 },
  disc: { token: "car-disc", mirror: 0.2, gloss: 0.5, metal: 0.5, lamp: 0 },
  stripe: { token: "car-stripe-blue", mirror: 0.04, gloss: 0.5, metal: 0, lamp: 0 },
  rack: { token: "car-trim", mirror: 0.03, gloss: 0.3, metal: 0, lamp: 0 },
  plateBand: { token: "car-plate-band", mirror: 0.03, gloss: 0.2, metal: 0, lamp: 0 },
};

const carToken = (name: string): Color => themeColor(`--color-aland-drive-${name}`);

const tokenRgb = (name: string) => {
  const { r, g, b } = carToken(name);
  return new Vector3(r, g, b);
};

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
  /** A hero: the shell shows its inside through its glass. */
  hero?: boolean;
}

interface Sky {
  toSun: Node<"vec3">;
  reflectedBy: (ray: Node<"vec3">) => Node<"vec3">;
  sunColour: Node<"vec3">;
}

function skyOf(sun: CarMaterialOptions["sun"]): Sky {
  const azimuth = (sun.azimuthDeg * Math.PI) / 180;
  const elevation = (sun.elevationDeg * Math.PI) / 180;
  const toSun = uniform(new Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), -Math.cos(azimuth) * Math.cos(elevation)));
  const sky = uniform(tokenRgb("sky"));
  const zenith = uniform(tokenRgb("water"));
  const road = uniform(tokenRgb("car-reflect-ground"));
  const treeline = uniform(tokenRgb("tree-spruce"));
  return {
    toSun,
    sunColour: uniform(tokenRgb("sun")),
    reflectedBy: (ray) => {
      const up = ray.y;
      const skyward = mix(sky, zenith, smoothstep(float(0.05), float(0.7), up));
      const treeBand = smoothstep(float(-0.02), float(0.03), up).mul(float(1).sub(smoothstep(float(0.09), float(0.2), up)));
      return mix(road, mix(skyward, treeline, treeBand.mul(0.8)), smoothstep(float(-0.1), float(-0.01), up));
    },
  };
}

/** A surface under the world's light, from the attributes a car's geometry carries. Every tier of car goes through this one sum. */
function carSurface(sky: Sky, paint: Node<"vec3">, normal: Node<"vec3">, heightShare: Node<"float">) {
  const finish = attribute<"vec4">("carFinish", "vec4");
  const isPaint = finish.x.greaterThan(0.999);
  const mirror = select(isPaint, finish.x.sub(1), finish.x);
  const gloss = finish.y;
  const metal = finish.z;
  const base = mix(attribute<"vec3">("carColour", "vec3"), paint, select(isPaint, float(1), float(0)));

  const toCamera = cameraPosition.sub(positionWorld).normalize();
  const facing = normal.dot(toCamera).max(0);
  const ray = reflect(toCamera.negate(), normal);
  const reflected = sky.reflectedBy(ray);

  const lowShade = mix(float(LOW_SHADE), float(1), heightShare);
  const lit = float(AMBIENT).mul(lowShade).add(normal.dot(sky.toSun).max(0).mul(SUN_SHARE));
  const fresnel = mirror.add(float(1).sub(mirror).mul(float(1).sub(facing).pow(5)).mul(gloss));
  const diffuse = base.mul(lit);
  const dielectric = mix(diffuse, reflected.mul(lowShade), fresnel);
  const surface = mix(dielectric, base.mul(reflected).mul(1.5), metal);
  const specular = sky.sunColour.mul(ray.dot(sky.toSun).max(0).pow(SPECULAR_POWER)).mul(gloss.mul(SPECULAR_SHARE));
  return { colour: surface.add(specular), lamp: finish.w };
}

export function carMaterial({ sun, paint, groundY, hazed, hero }: CarMaterialOptions) {
  const sky = skyOf(sun);
  const tail = uniform(0);
  const reverse = uniform(0);
  const head = uniform(0);
  const paintColour = uniform(tokenRgb(paint));
  const tailGlow = uniform(tokenRgb("car-glow-tail"));
  const headGlow = uniform(tokenRgb("car-glow-head"));

  const heightShare = smoothstep(float(groundY + 0.25), float(groundY + 0.85), positionGeometry.y);
  const normal = normalWorld.normalize();
  const { colour, lamp } = carSurface(sky, paintColour, normal, heightShare);
  const isLamp = (kind: number) => select(lamp.sub(kind).abs().lessThan(0.5), float(1), float(0));
  const glow = tailGlow
    .mul(isLamp(1).mul(tail))
    .add(headGlow.mul(isLamp(2).mul(reverse.mul(LAMP_REVERSE))))
    .add(headGlow.mul(isLamp(3).mul(head.mul(LAMP_HEAD))));

  const finished: Node<"vec3"> = vec3(colour.add(glow));
  const material = new MeshBasicNodeMaterial();
  if (hero) {
    // Seen through the glass the shell's inside is the cabin's lining, for no extra faces.
    material.side = DoubleSide;
    const lining = uniform(tokenRgb("car-interior"));
    const shown: Node<"vec3"> = select(frontFacing, finished, lining.mul(heightShare.mul(0.5).add(0.7)));
    material.colorNode = hazed ? hazed(shown) : shown;
  } else {
    material.colorNode = hazed ? hazed(finished) : finished;
  }

  return {
    material,
    setLights({ brake, reversing, headlights }: CarLights) {
      tail.value = (headlights ? TAIL_RUNNING : 0) + (brake ? TAIL_BRAKE : 0);
      reverse.value = reversing ? 1 : 0;
      head.value = headlights ? 1 : 0;
    },
    setPaint(token: string) {
      paintColour.value.copy(tokenRgb(token));
    },
  };
}

/** A hero's see-through glass: a tint over what's behind it, turning to a mirror at a glancing angle. */
export function glassMaterial({ sun, hazed }: Pick<CarMaterialOptions, "sun" | "hazed">) {
  const sky = skyOf(sun);
  const tint = uniform(tokenRgb("car-glass"));
  const toCamera = cameraPosition.sub(positionWorld).normalize();
  const normal = normalWorld.normalize();
  const fresnel = float(GLASS_MIRROR).add(float(1 - GLASS_MIRROR).mul(float(1).sub(normal.dot(toCamera).abs()).pow(4)));
  const ray = reflect(toCamera.negate(), normal);
  const specular = sky.sunColour.mul(ray.dot(sky.toSun).max(0).pow(SPECULAR_POWER)).mul(SPECULAR_SHARE);
  const finished: Node<"vec3"> = vec3(mix(tint, sky.reflectedBy(ray), fresnel).add(specular));
  const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  material.colorNode = hazed ? hazed(finished) : finished;
  material.opacityNode = fresnel.mul(1 - GLASS_CLEAR).add(GLASS_CLEAR);
  return material;
}

export interface WorldTierOptions extends Pick<CarMaterialOptions, "sun" | "hazed"> {
  tier: "world" | "distant";
  swapM: number;
  reachM: number;
}

/**
 * Every world car of a spec, one draw call, however many: `place` (x, y, z, yaw),
 * `paint`, and `look` (height, whether it has the rack, whether the plate's band)
 * are per instance. Nothing is on the CPU: the world tier folds away past the
 * swap, the distant one before it and past the reach, and they meet in a dither
 * where each keeps the pixels the other drops, so a car never pops.
 */
export function worldCarMaterial({ sun, hazed, tier, swapM, reachM }: WorldTierOptions) {
  const sky = skyOf(sun);
  const place = attribute<"vec4">("place", "vec4");
  const paint = attribute<"vec3">("paint", "vec3");
  const look = attribute<"vec3">("look", "vec3");
  const option = attribute<"float">("carOption", "float");
  const [yawCos, yawSin] = [cos(place.w), sin(place.w)];
  const distance = place.xz.sub(cameraPosition.xz).length();
  const dissolveFrom = swapM * (1 - DISSOLVE_SHARE);
  const fade = smoothstep(float(dissolveFrom), float(swapM), distance);
  const noise = fract(fract(screenCoordinate.xy.dot(vec2(0.06711056, 0.00583715))).mul(52.9829189));

  const isWorld = tier === "world";
  const shown = isWorld ? distance.lessThan(swapM) : distance.greaterThanEqual(dissolveFrom).and(distance.lessThan(reachM));
  const rackOff = option.equal(1).and(look.y.lessThan(0.5));
  const bandOff = option.equal(2).and(look.z.lessThan(0.5));
  const scale = select(shown.and(rackOff.or(bandOff).not()), float(1), float(0));

  const { x, y, z } = positionGeometry;
  const normal = normalize(vec3(normalGeometry.x.mul(yawCos).add(normalGeometry.z.mul(yawSin)), normalGeometry.y, normalGeometry.z.mul(yawCos).sub(normalGeometry.x.mul(yawSin))));
  const { colour } = carSurface(sky, paint, normal, smoothstep(float(0.25), float(0.85), y));
  const finished: Node<"vec3"> = vec3(colour);

  const material = new MeshBasicNodeMaterial();
  material.positionNode = vec3(place.x.add(x.mul(yawCos).add(z.mul(yawSin)).mul(scale)), place.y.add(y.mul(look.x).mul(scale)), place.z.add(z.mul(yawCos).sub(x.mul(yawSin)).mul(scale)));
  material.colorNode = hazed ? hazed(finished) : finished;
  material.opacityNode = select(isWorld ? fade.lessThanEqual(noise) : fade.greaterThan(noise), float(1), float(0));
  material.alphaTestNode = float(0.5);
  return material;
}

export interface CarLights {
  brake: boolean;
  reversing: boolean;
  headlights: boolean;
}
