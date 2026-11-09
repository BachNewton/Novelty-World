import { BackSide, BufferAttribute, BufferGeometry, DoubleSide, MeshBasicNodeMaterial, Vector3, Vector4, type Color, type Node } from "three/webgpu";
import { attribute, cameraPosition, cos, float, floor, fract, frontFacing, mix, normalGeometry, normalize, normalWorld, positionGeometry, positionWorld, reflect, screenCoordinate, select, sin, smoothstep, varying, vec2, vec3 } from "three/tsl";
import { sharedUniform } from "../shared-uniform";
import { themeColor } from "@/shared/lib/three/theme-color";
import { seedOf, unitOf } from "../hash";
import { INDICATOR_OPTION } from "./indicators";
import { DEFAULT_STRIPE, type CarPaint, type PaintFinish } from "./paints";
import { SURFACES, type Soup, type Surface } from "./mesh";
import { towardsSun, type Sun } from "../sun";
import type { SeasonLook } from "../season";
import { snowfall, snowOnTop } from "../surfaces/snow";

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
const GLASS_CLEAR = 0.7;
const GLASS_MIRROR = 0.1;
/** From inside: how much a straight-on view is tinted, and how much more a glancing one mirrors. */
const GLASS_INSIDE = 0.1;
const GLASS_INSIDE_MIRROR = 0.35;
/** How much of the swap distance the two tiers take to dissolve across. */
const DISSOLVE_SHARE = 0.15;

const TAIL_RUNNING = 0.45;
const TAIL_BRAKE = 8;
const LAMP_REVERSE = 2.4;
const LAMP_HEAD = 2.2;

/** A real indicator's flash: about one and a half a second, lit for a little over half of each. */
const INDICATOR_HZ = 1.5;
const INDICATOR_LIT_SHARE = 0.55;
/** How bright a lit indicator is, over its glow colour: past one it clips towards yellow. */
const INDICATOR_GLOW = 1.25;

/** Seconds, for every world car's indicators: the game moves it on each frame and holds it while paused. */
export const indicatorClock = sharedUniform(0);

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
  lensIndicator: { token: "car-lens-indicator", mirror: 0.05, gloss: 0.5, metal: 0, lamp: 0 },
  caliper: { token: "car-caliper", mirror: 0.05, gloss: 0.6, metal: 0, lamp: 0 },
};

/**
 * How each paint's coat takes the light, on a drivable car's paint and stripes: how much it mirrors straight on, the gloss
 * at a glancing angle, how much its reflection takes the paint's colour (a metal's), the sun's highlight (how tight, how
 * bright), the flakes and how far a pearl turns to its flip colour. Solid is the deep coat every drivable car had before
 * paints were the player's, smooth enough to carry the horizon along its doors.
 */
interface CoatLook {
  mirror: number;
  gloss: number;
  metal: number;
  power: number;
  share: number;
  flake: number;
  flip: number;
}

export const COAT_LOOKS: Record<PaintFinish, CoatLook> = {
  solid: { mirror: 0.07, gloss: 0.8, metal: 0, power: SPECULAR_POWER, share: SPECULAR_SHARE, flake: 0, flip: 0 },
  metallic: { mirror: 0.06, gloss: 0.85, metal: 0.24, power: 1100, share: 1.7, flake: 1, flip: 0 },
  matte: { mirror: 0, gloss: 0.06, metal: 0, power: 3, share: 0.8, flake: 0, flip: 0 },
  pearl: { mirror: 0.07, gloss: 0.85, metal: 0.05, power: 520, share: 1.1, flake: 0.25, flip: 0.6 },
};

/** A metallic's flakes: cells this size in the car's own metres, a glint seen only while its cell is a few pixels across. */
const FLAKE_M = 0.012;
/** The roll past which a cell glints, how bright a glint is, and how bright the flakes' glow in the paint's colour. */
const FLAKE_GLINTING = 0.93;
const FLAKE_BRIGHT = 0.35;
const FLAKE_GLOW = 0.55;
const FLAKE_SALT = 7;

const carToken = (name: string): Color => themeColor(`--color-aland-drive-${name}`);

const tokenRgb = (name: string) => {
  const { r, g, b } = carToken(name);
  return new Vector3(r, g, b);
};

/**
 * A soup as a geometry: colours and finishes on the vertices, so instances can share it. A finish's first number is the
 * mirror, raised by 1 on paint and by 2 on a stripe, which a drivable car's coat recolours and refinishes.
 */
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
    const raised = colour ? (SURFACES[surface] === "stripe" ? 2 : 0) : 1;
    finishes.set([finish.mirror + raised, finish.gloss, finish.metal, finish.lamp], vertex * 4);
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(soup.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(soup.normals, 3));
  geometry.setAttribute("carColour", new BufferAttribute(colours, 3));
  geometry.setAttribute("carFinish", new BufferAttribute(finishes, 4));
  return geometry;
}

export interface CarMaterialOptions {
  sun: Sun;
  paint: CarPaint;
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
  const toSun = towardsSun(sun);
  const sky = sharedUniform(tokenRgb("sky"));
  const zenith = sharedUniform(tokenRgb("water"));
  const road = sharedUniform(tokenRgb("car-reflect-ground"));
  const treeline = sharedUniform(tokenRgb("tree-spruce"));
  return {
    toSun,
    sunColour: sharedUniform(tokenRgb("sun")),
    reflectedBy: (ray) => {
      const up = ray.y;
      const skyward = mix(sky, zenith, smoothstep(float(0.05), float(0.7), up));
      const treeBand = smoothstep(float(-0.02), float(0.03), up).mul(float(1).sub(smoothstep(float(0.09), float(0.2), up)));
      return mix(road, mix(skyward, treeline, treeBand.mul(0.8)), smoothstep(float(-0.1), float(-0.01), up));
    },
  };
}

/** A drivable car's coat, as uniforms one car's material sets: its finish's numbers, its stripes' colour and a pearl's flip. */
interface Coat {
  /** Mirror, gloss, metal, flakes. */
  finish: Node<"vec4">;
  /** The highlight's power and share, and how far a pearl turns to its flip. */
  highlight: Node<"vec4">;
  stripe: Node<"vec3">;
  flip: Node<"vec3">;
}

/**
 * A surface under the world's light, from the attributes a car's geometry carries. Every tier of car goes through this
 * one sum. A world car's paint and stripes are as its geometry says; a drivable car's are its coat's.
 */
function carSurface(sky: Sky, paint: Node<"vec3">, normal: Node<"vec3">, heightShare: Node<"float">, coat?: Coat) {
  const finish = attribute<"vec4">("carFinish", "vec4");
  // Paint and stripes both lie under the coat: the mirror is raised by 1 on paint, 2 on a stripe.
  const isCoated = finish.x.greaterThan(0.999);
  const isStripe = finish.x.greaterThan(1.999);
  const isPaint = isCoated.and(isStripe.not());
  const ownMirror = finish.x.sub(select(isStripe, float(2), select(isCoated, float(1), float(0))));
  const coated = (own: Node<"float">, ofCoat: (coat: Coat) => Node<"float">) => (coat ? select(isCoated, ofCoat(coat), own) : own);
  const mirror = coated(ownMirror, (c) => c.finish.x);
  const gloss = coated(finish.y, (c) => c.finish.y);
  const metal = coated(finish.z, (c) => c.finish.z);
  const power = coated(float(SPECULAR_POWER), (c) => c.highlight.x);
  const share = coated(float(SPECULAR_SHARE), (c) => c.highlight.y);
  const own = attribute<"vec3">("carColour", "vec3");
  const painted = mix(coat ? mix(own, coat.stripe, select(isStripe, float(1), float(0))) : own, paint, select(isPaint, float(1), float(0)));

  const toCamera = cameraPosition.sub(positionWorld).normalize();
  const facing = normal.dot(toCamera).max(0);
  const grazing = float(1).sub(facing);
  const ray = reflect(toCamera.negate(), normal);
  const reflected = sky.reflectedBy(ray);
  // A pearl's colour turns to its flip at a glancing angle.
  const base = coat ? mix(painted, coat.flip, select(isPaint, coat.highlight.z, float(0)).mul(grazing.mul(grazing))) : painted;

  const lowShade = mix(float(LOW_SHADE), float(1), heightShare);
  const lit = float(AMBIENT).mul(lowShade).add(normal.dot(sky.toSun).max(0).mul(SUN_SHARE));
  const fresnel = mirror.add(float(1).sub(mirror).mul(grazing.pow(5)).mul(gloss));
  const diffuse = base.mul(lit);
  const dielectric = mix(diffuse, reflected.mul(lowShade), fresnel);
  const surface = mix(dielectric, base.mul(reflected).mul(1.5), metal);
  const towardsSun = ray.dot(sky.toSun).max(0);
  const specular = sky.sunColour.mul(towardsSun.pow(power)).mul(gloss.mul(share));
  if (!coat) return { colour: surface.add(specular), lamp: finish.w };
  const sparkle = flakes(sky, coat, base, towardsSun).mul(select(isCoated, float(1), float(0)));
  return { colour: surface.add(specular).add(sparkle), lamp: finish.w };
}

/**
 * A metallic's flakes: a broad glow in the paint's own colour round the sun's highlight, where the flakes all catch
 * the sun, and inside it a few cells in the car's own metres that glint. A cell's roll is the integer hash of whole
 * cells, never a world place, and the glints fade out before a cell is smaller than a few pixels, so far off and at
 * night only the glow is left, and it goes with the sun.
 */
function flakes(sky: Sky, coat: Coat, base: Node<"vec3">, towardsSun: Node<"float">): Node<"vec3"> {
  const cell = floor(positionGeometry.div(FLAKE_M));
  const roll = unitOf(seedOf(cell.x, cell.y, cell.z), FLAKE_SALT);
  // A cell's size on screen from its distance, for the game's view of about 60 degrees over 1440 rows.
  const away = cameraPosition.sub(positionWorld).length();
  const cellPixels = float(FLAKE_M * 1250).div(away);
  const seen = smoothstep(float(2.5), float(5), cellPixels);
  const near = towardsSun.pow(6);
  const glow = base.mul(sky.sunColour).mul(near.mul(FLAKE_GLOW));
  const glint = smoothstep(float(FLAKE_GLINTING), float(1), roll).mul(near.mul(near)).mul(seen);
  return glow.add(mix(base, sky.sunColour, float(0.6)).mul(glint.mul(FLAKE_BRIGHT))).mul(coat.finish.w);
}

/** A coat's uniforms, set from a paint. */
function coatOf(paint: CarPaint) {
  const finish = sharedUniform(new Vector4());
  const highlight = sharedUniform(new Vector4());
  const stripe = sharedUniform(new Vector3());
  const flip = sharedUniform(new Vector3());
  const colour = sharedUniform(new Vector3());
  const set = (next: CarPaint) => {
    const look = COAT_LOOKS[next.finish];
    finish.value.set(look.mirror, look.gloss, look.metal, look.flake);
    highlight.value.set(look.power, look.share, look.flip, 0);
    colour.value.copy(tokenRgb(next.colour));
    stripe.value.copy(tokenRgb(next.stripe ?? DEFAULT_STRIPE));
    flip.value.copy(tokenRgb(next.flip ?? next.colour));
  };
  set(paint);
  const coat: Coat = { finish, highlight, stripe, flip };
  return { coat, colour, set };
}

export function carMaterial({ sun, paint, groundY, hazed, hero }: CarMaterialOptions) {
  const sky = skyOf(sun);
  const tail = sharedUniform(0);
  const reverse = sharedUniform(0);
  const head = sharedUniform(0);
  const { coat, colour: paintColour, set: setCoat } = coatOf(paint);
  const tailGlow = sharedUniform(tokenRgb("car-glow-tail"));
  const headGlow = sharedUniform(tokenRgb("car-glow-head"));

  const heightShare = smoothstep(float(groundY + 0.25), float(groundY + 0.85), positionGeometry.y);
  const normal = normalWorld.normalize();
  const { colour, lamp } = carSurface(sky, paintColour, normal, heightShare, coat);
  const isLamp = (kind: number) => select(lamp.sub(kind).abs().lessThan(0.5), float(1), float(0));
  const glow = tailGlow
    .mul(isLamp(1).mul(tail))
    .add(headGlow.mul(isLamp(2).mul(reverse.mul(LAMP_REVERSE))))
    .add(headGlow.mul(isLamp(3).mul(head.mul(LAMP_HEAD))));

  // A lamp's own light goes on after the world's haze and hour, which would dim it at night.
  const lit = (surface: Node<"vec3">) => (hazed ? hazed(surface) : surface);
  const material = new MeshBasicNodeMaterial();
  material.name = hero ? "car-hero" : "car";
  if (hero) {
    // Seen through the glass the shell's inside is the cabin's lining, for no extra faces.
    material.side = DoubleSide;
    const lining = sharedUniform(tokenRgb("car-interior"));
    material.colorNode = select(frontFacing, lit(colour).add(glow), lit(lining.mul(heightShare.mul(0.5).add(0.7))));
  } else {
    material.colorNode = lit(colour).add(glow);
  }

  return {
    material,
    setLights({ brake, reversing, headlights }: CarLights) {
      tail.value = (headlights ? TAIL_RUNNING : 0) + (brake ? TAIL_BRAKE : 0);
      reverse.value = reversing ? 1 : 0;
      head.value = headlights ? 1 : 0;
    },
    /** The car's colour and finish: uniforms, so one shader draws every paint. */
    setPaint: setCoat,
  };
}

/** A hero's see-through glass: a tint over what's behind it, turning to a mirror at a glancing angle. */
export function glassMaterial({ sun, hazed }: Pick<CarMaterialOptions, "sun" | "hazed">) {
  const sky = skyOf(sun);
  const tint = sharedUniform(tokenRgb("car-glass"));
  const toCamera = cameraPosition.sub(positionWorld).normalize();
  const normal = normalWorld.normalize();
  const fresnel = float(GLASS_MIRROR).add(float(1 - GLASS_MIRROR).mul(float(1).sub(normal.dot(toCamera).abs()).pow(4)));
  const ray = reflect(toCamera.negate(), normal);
  const specular = sky.sunColour.mul(ray.dot(sky.toSun).max(0).pow(SPECULAR_POWER)).mul(SPECULAR_SHARE);
  const finished: Node<"vec3"> = vec3(mix(tint, sky.reflectedBy(ray), fresnel).add(specular));
  const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  material.name = "car-glass";
  material.colorNode = hazed ? hazed(finished) : finished;
  material.opacityNode = fresnel.mul(1 - GLASS_CLEAR).add(GLASS_CLEAR);
  return material;
}

/**
 * The same glass seen from inside, for the cockpit: its back faces, a faint tint with the dark cabin and the sky's
 * glint in it, much clearer than the glass seen from out. A material of its own, on a mesh only the cockpit shows, so
 * the chase view draws the glass as it always has.
 */
export function insideGlassMaterial({ sun, hazed }: Pick<CarMaterialOptions, "sun" | "hazed">) {
  const sky = skyOf(sun);
  const tint = sharedUniform(tokenRgb("car-glass"));
  const toCamera = cameraPosition.sub(positionWorld).normalize();
  const normal = normalWorld.normalize().negate();
  const fresnel = float(1).sub(normal.dot(toCamera).abs()).pow(4);
  const ray = reflect(toCamera.negate(), normal);
  const specular = sky.sunColour.mul(ray.dot(sky.toSun).max(0).pow(SPECULAR_POWER)).mul(SPECULAR_SHARE * 0.5);
  const finished: Node<"vec3"> = vec3(mix(tint.mul(0.5), sky.reflectedBy(ray).mul(0.5), fresnel).add(specular));
  const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: BackSide });
  material.name = "car-glass-inside";
  material.colorNode = hazed ? hazed(finished) : finished;
  material.opacityNode = fresnel.mul(GLASS_INSIDE_MIRROR).add(GLASS_INSIDE);
  return material;
}

export interface WorldTierOptions extends Pick<CarMaterialOptions, "sun" | "hazed"> {
  tier: "world" | "distant";
  swapM: number;
  reachM: number;
  /** The season the snow on the cars' tops follows; none if not given. */
  season?: SeasonLook;
  /** How much of the snow cars keep: all of it standing parked, a little being driven, cleared but for some roofs. */
  snowKept?: number;
}

/**
 * Every world car of a spec, one draw call, however many: `place` (x, y, z, yaw),
 * `paint`, and `look` (height, whether it has the rack, whether the plate's band)
 * are per instance. Nothing is on the CPU: the world tier folds away past the
 * swap, the distant one before it and past the reach, and they meet in a dither
 * where each keeps the pixels the other drops, so a car never pops. The distant
 * one dissolves the same way over the last of its reach.
 */
/** The cover at which a parked car's top goes white, rolled per car between these. */
const SNOW_FROM = [0.1, 0.85] as const;
const SNOW_SALT = 2;

export function worldCarMaterial({ sun, hazed, tier, swapM, reachM, season, snowKept = 1 }: WorldTierOptions) {
  const sky = skyOf(sun);
  const place = attribute<"vec4">("place", "vec4");
  const paint = attribute<"vec3">("paint", "vec3");
  const look = attribute<"vec3">("look", "vec3");
  const option = attribute<"float">("carOption", "float");
  const [yawCos, yawSin] = [cos(place.w), sin(place.w)];
  const distance = place.xz.sub(cameraPosition.xz).length();
  // A uniform rather than a constant, so every model's materials, each at its own swap, are one shader program.
  const swap = sharedUniform(swapM);
  const dissolveFrom = swap.mul(1 - DISSOLVE_SHARE);
  const fade = smoothstep(dissolveFrom, swap, distance);
  const gone = smoothstep(float(reachM * (1 - DISSOLVE_SHARE)), float(reachM), distance);
  const noise = fract(fract(screenCoordinate.xy.dot(vec2(0.06711056, 0.00583715))).mul(52.9829189));

  const isWorld = tier === "world";
  const shown = isWorld ? distance.lessThan(swap) : distance.greaterThanEqual(dissolveFrom).and(distance.lessThan(reachM));
  const rackOff = option.equal(1).and(look.y.lessThan(0.5));
  const bandOff = option.equal(2).and(look.z.lessThan(0.5));
  const scale = select(shown.and(rackOff.or(bandOff).not()), float(1), float(0));

  const { x, y, z } = positionGeometry;
  const normal = normalize(vec3(normalGeometry.x.mul(yawCos).add(normalGeometry.z.mul(yawSin)), normalGeometry.y, normalGeometry.z.mul(yawCos).sub(normalGeometry.x.mul(yawSin))));
  const { colour } = carSurface(sky, paint, normal, smoothstep(float(0.25), float(0.85), y));
  // Each car keeps its own snow: a threshold rolled in the vertex stage, where its paint and height are exact.
  const snowFrom = varying(mix(float(SNOW_FROM[0]), float(SNOW_FROM[1]), unitOf(seedOf(look.x.mul(1e6), paint.x.mul(1023), paint.y.mul(1023), paint.z.mul(1023)), SNOW_SALT)).div(snowKept));
  const snowed = season === undefined ? colour : snowOnTop(colour, snowfall(season, (name) => sharedUniform(tokenRgb(name))), normal.y, snowFrom);
  const finished: Node<"vec3"> = vec3(mix(snowed, sharedUniform(tokenRgb("car-glow-indicator")).mul(INDICATOR_GLOW), indicatorLit(option, look, paint)));

  const material = new MeshBasicNodeMaterial();
  material.name = `cars-${tier}`;
  material.positionNode = vec3(place.x.add(x.mul(yawCos).add(z.mul(yawSin)).mul(scale)), place.y.add(y.mul(look.x).mul(scale)), place.z.add(z.mul(yawCos).sub(x.mul(yawSin)).mul(scale)));
  material.colorNode = hazed ? hazed(finished) : finished;
  material.opacityNode = select(isWorld ? fade.lessThanEqual(noise) : fade.greaterThan(noise).and(gone.lessThanEqual(noise)), float(1), float(0));
  material.alphaTestNode = float(0.5);
  return material;
}

/**
 * 1 where a face is an indicator lit at this moment, else 0. `signal` is per instance: 0 off, 1 the left, 2 the right,
 * 3 both. Every car flashes at its own phase, from a seed of its paint and height, worked out in the vertex stage where
 * those are exact, so all of one car's lamps agree and flash together.
 */
function indicatorLit(option: Node<"float">, look: Node<"vec3">, paint: Node<"vec3">): Node<"float"> {
  const signal = attribute<"float">("signal", "float");
  const is = (value: Node<"float">, wanted: number) => value.sub(wanted).abs().lessThan(0.5);
  const leftOn = is(option, INDICATOR_OPTION.left).and(is(signal, 1).or(is(signal, 3)));
  const rightOn = is(option, INDICATOR_OPTION.right).and(is(signal, 2).or(is(signal, 3)));
  const phase = unitOf(seedOf(look.x.mul(1e6), paint.x.mul(1023), paint.y.mul(1023), paint.z.mul(1023)), 1);
  const flashing = fract(indicatorClock.mul(INDICATOR_HZ).add(phase)).lessThan(INDICATOR_LIT_SHARE);
  const lit = varying(select(leftOn.or(rightOn).and(flashing), float(1), float(0)));
  return select(lit.greaterThan(0.5), float(1), float(0));
}

export interface CarLights {
  brake: boolean;
  reversing: boolean;
  headlights: boolean;
}
