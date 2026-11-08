import { BufferAttribute, BufferGeometry, MeshBasicNodeMaterial, Vector3, Vector4, type Node, type Texture } from "three/webgpu";
import { abs, attribute, cameraPosition, clamp, cos, dFdx, dFdy, exp, float, floor, fract, fwidth, max, min, mix, modelNormalMatrix, modelWorldMatrixInverse, normalGeometry, positionGeometry, positionWorld, pow, reflect, select, sin, smoothstep, texture, uniformArray, varying, vec2, vec3, vec4 } from "three/tsl";
import { themeColor } from "@/shared/lib/three/theme-color";
import { sharedUniform } from "../../shared-uniform";
import { towardsSun, type Sun } from "../../sun";
import { GLYPH, GLYPH_ASPECT, GLYPH_GRID, SLOT, cellUv } from "./atlas";
import { KIND, type CockpitSoup } from "./builder";
import type { CabinShade } from "./frame";
import type { DialSpec } from "./interior";
import "./tokens.css";

/*
 * The cockpit's one material. Inside a car the light comes in through the glass,
 * so each surface is lit by how much sky its corner sees (baked by the builder)
 * and by the sun only where no roof, door, bulkhead or dash stands between: the
 * same few planes the bake used, tested per pixel, softened at their edges. The
 * wheel's faces turn about the column in the vertex stage, the needles are drawn
 * over the dial faces from the readings, and the readouts pick their glyphs from
 * the sheet, so everything moving costs no draw of its own. After dark the dials,
 * figures and switches glow in the car's own light colour.
 *
 * One cockpit is drawn at a time, so the readings, the wheel and the cabin's
 * planes are uniforms every cockpit material shares, made once: two cars'
 * cockpits are the same shader and compile one pipeline.
 */

const AMBIENT = 0.62;
/** What the sunlit dash and floor throw round the cabin, at a full sun. */
const BOUNCE = 0.1;
const SUN_SHARE = 0.66;
const SPECULAR_POWER = 180;
/** How much a dial's face is lit from behind by day, so it reads in the shade of its hood. */
const DIAL_DAY_LIGHT = 0.4;
/** How bright the figures and lamps are, over their colour. */
const FIGURES = 1.5;
const LAMP_LIT = 2.4;

const linear = (name: string) => {
  const { r, g, b } = themeColor(`--color-aland-drive-${name}`);
  return new Vector3(r, g, b);
};

/** What the instruments read, set each frame from the car: speed in the units shown, revs in thousands, the rest as shares. */
export const readings = {
  speed: sharedUniform(0),
  revs: sharedUniform(0),
  fuel: sharedUniform(0.72),
  water: sharedUniform(0.5),
  oil: sharedUniform(0.4),
  power: sharedUniform(0),
  gear: sharedUniform(1),
  clock: sharedUniform(1200),
  outside: sharedUniform(12),
  /** What the lamps and segments light by: the revs' or the power's share of full. */
  lamps: sharedUniform(0),
};
/** The wheel's turn, and what it turns about, in the car's frame. */
export const wheelTurn = { angle: sharedUniform(0), pivot: sharedUniform(new Vector3()), axis: sharedUniform(new Vector3(0, 0, 1)) };
/** Each dial cell's needle: where it starts and how far it sweeps (radians), what it reads and its full scale. */
const dialSpecs = uniformArray<"vec4">(Array.from({ length: 8 }, () => new Vector4(0, 0, 15, 1)));
const shadePlanes = { roof: sharedUniform(new Vector4()), sides: sharedUniform(new Vector4()), ends: sharedUniform(new Vector4()), dash: sharedUniform(new Vector4()) };
const makeColours = () => ({
  paint: sharedUniform(new Vector3(0.5, 0.5, 0.5)),
  glow: sharedUniform(new Vector3(1, 1, 1)),
  needle: sharedUniform(linear("car-cabin-needle")),
  sky: sharedUniform(linear("sky")),
  sunColour: sharedUniform(linear("sun")),
  cabin: sharedUniform(linear("car-cabin-panel")),
});
let colours: ReturnType<typeof makeColours> | null = null;
/** Made on first use, once the page's colours can be read. */
const coloursOf = () => (colours ??= makeColours());
const spill = sharedUniform(new Vector3());

/** Sets what one car's cockpit shares with the material: its cabin's planes, its dials, its wheel, its paint and light colour. */
export function fitCockpit(shade: CabinShade, dials: readonly (DialSpec & { max: number })[], wheel: { pivot: readonly number[]; axis: readonly number[] }, look: { paint: string; glow: string; clusterAt: readonly number[] }) {
  shadePlanes.roof.value.set(...shade.roof);
  shadePlanes.sides.value.set(...shade.sides);
  shadePlanes.ends.value.set(...shade.ends);
  shadePlanes.dash.value.set(...shade.dash);
  for (const spec of dialSpecs.array as Vector4[]) spec.set(0, 0, 15, 1);
  for (const { slot, startDeg, sweepDeg, source, max: full } of dials) (dialSpecs.array as Vector4[])[slot].set((startDeg * Math.PI) / 180, (sweepDeg * Math.PI) / 180, source, full);
  wheelTurn.pivot.value.set(wheel.pivot[0], wheel.pivot[1], wheel.pivot[2]);
  wheelTurn.axis.value.set(wheel.axis[0], wheel.axis[1], wheel.axis[2]);
  const shared = coloursOf();
  shared.paint.value.copy(linear(look.paint));
  shared.glow.value.copy(linear(look.glow));
  spill.value.set(look.clusterAt[0], look.clusterAt[1], look.clusterAt[2]);
}

export function setCockpitPaint(token: string) {
  coloursOf().paint.value.copy(linear(token));
}

/** A cockpit's soup as a geometry: colours, finishes and what each face does on its vertices. */
export function cockpitGeometry(soup: CockpitSoup, openness: Float32Array): BufferGeometry {
  const count = soup.triangles * 3;
  const tint = new Float32Array(count * 4);
  const finishes = new Float32Array(count * 4);
  const faces = new Float32Array(count * 4);
  const rgb = soup.paints.map(({ token, shade = 1 }) => (token === null ? null : linear(token).multiplyScalar(shade)));
  for (let vertex = 0; vertex < count; vertex++) {
    const paint = soup.paints[soup.paintOf[vertex]];
    const colour = rgb[soup.paintOf[vertex]];
    tint.set([colour?.x ?? 0, colour?.y ?? 0, colour?.z ?? 0, openness[vertex]], vertex * 4);
    finishes.set([paint.mirror + (colour === null ? 1 : 0), paint.gloss, paint.metal, paint.glow], vertex * 4);
    faces.set([soup.uvs[vertex * 2], soup.uvs[vertex * 2 + 1], soup.kinds[vertex], soup.params[vertex]], vertex * 4);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(soup.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(soup.normals, 3));
  geometry.setAttribute("cockpitTint", new BufferAttribute(tint, 4));
  geometry.setAttribute("cockpitFinish", new BufferAttribute(finishes, 4));
  geometry.setAttribute("cockpitFace", new BufferAttribute(faces, 4));
  return geometry;
}

type F = Node<"float">;
type V3 = Node<"vec3">;

const is = (value: F, wanted: number): F => select(value.sub(wanted).abs().lessThan(0.5), float(1), float(0));

/** How much sun reaches a point in the cabin along `d`, past its planes, with soft edges. */
function sunReaching(p: V3, d: V3): F {
  const { roof, sides, ends, dash } = shadePlanes;
  const soft = 0.025;
  const safe = (value: F) => select(value.abs().lessThan(1e-4), float(1e-4), value);
  const roofAlong = roof.x.sub(p.y).div(safe(d.y));
  const roofHit = p.xz.add(d.xz.mul(roofAlong));
  const roofInside = min(roof.w.sub(roofHit.x.abs()), min(roofHit.y.sub(roof.y), roof.z.sub(roofHit.y)));
  const underRoof = smoothstep(float(-soft), float(soft), roofInside).mul(select(d.y.greaterThan(0).and(p.y.lessThan(roof.x)).and(roof.w.greaterThan(0)), float(1), float(0)));
  const sideAlong = sides.x.mul(d.x.sign()).sub(p.x).div(safe(d.x));
  const sideHeight = p.y.add(d.y.mul(sideAlong));
  const door = float(1).sub(smoothstep(sides.y.sub(soft), sides.y.add(soft), sideHeight)).add(smoothstep(sides.z.sub(soft), sides.z.add(soft), sideHeight)).min(1);
  const bySide = door.mul(select(sideAlong.greaterThan(0).and(d.x.abs().greaterThan(1e-3)), float(1), float(0)));
  const frontHeight = p.y.add(d.y.mul(ends.x.sub(p.z)).div(safe(d.z)));
  const byFront = float(1).sub(smoothstep(ends.y.sub(soft), ends.y.add(soft), frontHeight)).mul(select(d.z.lessThan(0).and(p.z.greaterThan(ends.x)), float(1), float(0)));
  const rearHeight = p.y.add(d.y.mul(ends.z.sub(p.z)).div(safe(d.z)));
  const byRear = float(1).sub(smoothstep(ends.w.sub(soft), ends.w.add(soft), rearHeight)).mul(select(d.z.greaterThan(0).and(p.z.lessThan(ends.z)), float(1), float(0)));
  const dashZ = p.z.add(d.z.mul(dash.x.sub(p.y)).div(safe(d.y)));
  const byDash = float(1).sub(smoothstep(dash.y.sub(soft), dash.y.add(soft), dashZ)).mul(select(d.y.greaterThan(0).and(p.y.lessThan(dash.x.sub(0.005))).and(p.z.lessThan(dash.y)), float(1), float(0)));
  return float(1).sub(underRoof).mul(float(1).sub(bySide)).mul(float(1).sub(byFront)).mul(float(1).sub(byRear)).mul(float(1).sub(byDash));
}

/** The value a needle or readout reads, by its source's number. */
function readingOf(source: F): F {
  return readings.speed
    .mul(is(source, 0))
    .add(readings.revs.mul(is(source, 1)))
    .add(readings.fuel.mul(is(source, 2)))
    .add(readings.water.mul(is(source, 3)))
    .add(readings.oil.mul(is(source, 4)))
    .add(readings.power.mul(is(source, 5)))
    .add(readings.gear.mul(is(source, 6)))
    .add(readings.clock.mul(is(source, 7)))
    .add(readings.outside.mul(is(source, 8)));
}

export interface CockpitMaterialOptions {
  sun: Sun;
  sheet: Texture;
  hazed?: (colour: V3) => V3;
  /** How far after dark it is, 0 by day to 1 when the instruments are fully lit. */
  glowing: F;
}

export function cockpitMaterial({ sun, sheet, hazed, glowing }: CockpitMaterialOptions) {
  const shared = coloursOf();
  const tint = attribute<"vec4">("cockpitTint", "vec4");
  const finish = attribute<"vec4">("cockpitFinish", "vec4");
  const face = attribute<"vec4">("cockpitFace", "vec4");
  const kind = face.z;

  // The wheel's faces turn about its column; everything else stands still.
  const turn = wheelTurn.angle.mul(is(kind, KIND.wheel));
  const axis = wheelTurn.axis;
  const [c, s] = [cos(turn), sin(turn)];
  const rotate = (v: V3): V3 => v.mul(c).add(axis.cross(v).mul(s)).add(axis.mul(axis.dot(v)).mul(float(1).sub(c)));
  const turned = wheelTurn.pivot.add(rotate(positionGeometry.sub(wheelTurn.pivot)));
  const local = varying(turned);
  const normal = varying(modelNormalMatrix.mul(rotate(normalGeometry))).normalize();

  const isPaint = finish.x.greaterThan(0.999);
  const mirror = select(isPaint, finish.x.sub(1), finish.x);
  const gloss = finish.y;
  const metal = finish.z;
  const base = mix(tint.xyz, shared.paint, select(isPaint, float(1), float(0)));
  const openness = tint.w;

  const toSun = towardsSun(sun);
  const strength = toSun.length();
  const sunDirection = toSun.div(max(strength, 1e-4));
  const sunLocal = modelWorldMatrixInverse.mul(vec4(sunDirection, 0)).xyz;
  const sunIn = sunReaching(local, sunLocal);
  const toCamera = cameraPosition.sub(positionWorld).normalize();
  const facing = normal.dot(toCamera).max(0);
  const ray = reflect(toCamera.negate(), normal);
  const open = openness.sqrt();
  // Under a roof the light that reaches a surface is mostly what the cabin bounces about: a floor of it, more where the sky is seen, more when the sun is out.
  const ambient = float(AMBIENT).mul(float(0.34).add(open.mul(0.66))).add(strength.mul(BOUNCE));
  const light = ambient.add(normal.dot(sunDirection).max(0).mul(strength).mul(SUN_SHARE).mul(sunIn));
  const surround = mix(shared.cabin.mul(0.6), shared.sky, smoothstep(float(-0.05), float(0.5), ray.y).mul(open.mul(0.8).add(0.2)));
  const fresnel = mirror.add(float(1).sub(mirror).mul(float(1).sub(facing).pow(5)).mul(gloss));
  const specular = shared.sunColour.mul(ray.dot(sunDirection).max(0).pow(SPECULAR_POWER)).mul(gloss.mul(0.7).mul(sunIn).mul(strength));
  const shaded = (colour: V3): V3 => {
    const dielectric = mix(colour.mul(light), surround, fresnel);
    return mix(dielectric, colour.mul(surround).mul(1.4), metal).add(specular);
  };

  // A dial: its face from the sheet, its needle drawn from its reading over it.
  const uv = face.xy;
  const slot = floor(face.w.add(0.5));
  const cellColumn = slot.mod(4);
  const cellRow = floor(slot.div(4));
  const cellOrigin = vec2(cellColumn.mul(0.25), float(1).sub(cellRow.add(1).mul(0.5)));
  const dialPoint = uv.sub(cellOrigin).div(vec2(0.25, 0.5)).mul(2).sub(1);
  const dial = dialSpecs.element(slot.toInt());
  const share = clamp(readingOf(dial.z).div(dial.w), -0.02, 1.04);
  const angle = dial.x.add(dial.y.mul(share));
  const pointing = vec2(cos(angle), sin(angle));
  const along = clamp(dialPoint.dot(pointing), -0.16, 0.8);
  const offAxis = dialPoint.sub(pointing.mul(along)).length();
  const width = mix(float(0.034), float(0.012), along.add(0.16).div(0.96));
  const edge = fwidth(offAxis).max(1e-4);
  const needle = float(1).sub(smoothstep(width.sub(edge), width.add(edge), offAxis)).mul(select(dial.z.lessThan(14.5), float(1), float(0)));
  const hub = float(1).sub(smoothstep(float(0.075).sub(edge), float(0.075).add(edge), dialPoint.length())).mul(select(dial.z.lessThan(14.5), float(1), float(0)));
  const sheetNode = texture(sheet, uv);
  const sheetAt = sheetNode;
  const dialFace = mix(mix(sheetAt.xyz, shared.needle, needle), shared.cabin, hub);
  const dialColour = shaded(dialFace).add(dialFace.mul(DIAL_DAY_LIGHT));
  const dialGlow = shared.glow.mul(sheetAt.w.mul(1.3)).add(shared.needle.mul(needle.mul(1.1))).mul(glowing);

  // A readout: which glyph each of its places shows, from what it reads.
  const source = floor(face.w.div(16));
  const places = face.w.sub(source.mul(16));
  const place = min(floor(uv.x.mul(places)), places.sub(1));
  const inPlace = fract(uv.x.mul(places));
  const value = readingOf(source);
  const whole = floor(value.abs().add(0.5));
  const power = places.sub(1).sub(place);
  const scale = pow(float(10), power);
  const digit = floor(whole.div(scale)).mod(10);
  const isGear = is(source, 6);
  const isClock = is(source, 7);
  const isOutside = is(source, 8);
  const leadingBlank = select(power.greaterThan(0.5).and(whole.lessThan(scale)), float(1), float(0)).mul(float(1).sub(isClock));
  const gearGlyph = select(value.lessThan(-0.5), float(GLYPH.reverse), select(value.lessThan(0.5), float(GLYPH.neutral), select(value.greaterThan(9.5), whole, digit)));
  const signPlace = isOutside.mul(is(place, 0));
  const signGlyph = select(value.lessThan(-0.5), float(GLYPH.minus), float(GLYPH.blank));
  const plainGlyph = mix(digit, float(GLYPH.blank), leadingBlank);
  const glyph = mix(mix(plainGlyph, gearGlyph, isGear), signGlyph, signPlace);
  const figures = cellUv(SLOT.figures);
  const glyphSize = vec2(figures.width / GLYPH_GRID, figures.height / GLYPH_GRID);
  const glyphOrigin = vec2(figures.u, figures.v).add(vec2(glyph.mod(GLYPH_GRID), float(GLYPH_GRID - 1).sub(floor(glyph.div(GLYPH_GRID)))).mul(glyphSize));
  const inGlyph = vec2(float(0.5).add(inPlace.sub(0.5).mul(GLYPH_ASPECT)), uv.y);
  const glyphUv = glyphOrigin.add(inGlyph.mul(glyphSize));
  const gradientScale = vec2(places.mul(GLYPH_ASPECT), float(1)).mul(glyphSize);
  const glyphNode = texture(sheet, glyphUv);
  const ink = glyphNode.grad(dFdx(uv).mul(gradientScale), dFdy(uv).mul(gradientScale)).w;
  // The clock's colon, between its second and third places.
  const colon = isClock.mul(float(1).sub(smoothstep(float(0.035), float(0.05), vec2(uv.x.sub(0.5).mul(places.mul(GLYPH_ASPECT)), abs(uv.y.sub(0.5)).sub(0.2)).length())));
  const figureInk = max(ink, colon);
  const readoutColour = base.mul(0.6).add(shared.glow.mul(figureInk.mul(FIGURES)));

  // A screen: a deep ground with a faint lift at its top, lit from within.
  const screenColour = base.add(vec3(0.004, 0.008, 0.016).mul(smoothstep(float(0.1), float(1), uv.y))).add(shared.glow.mul(0.006));

  // A lamp or a segment of an arc: lit once the revs or the power reach its threshold.
  const lit = select(readings.lamps.greaterThanEqual(face.w), float(1), float(0));
  const lampColour = mix(base.mul(0.1), base.mul(LAMP_LIT), lit);

  // A vent: slats across it.
  const slat = smoothstep(float(0.55), float(0.75), fract(uv.y.mul(6)));
  const ventColour = shaded(mix(base.mul(0.35), base.mul(2.2), slat));

  // Instruments throw a little of their light on what's near them after dark.
  const nearCluster = exp(local.sub(spill).dot(local.sub(spill)).mul(-14));
  const plainColour = shaded(base).add(shared.glow.mul(nearCluster.mul(0.05).mul(glowing)).mul(base.add(0.15)));

  const weights = { dial: is(kind, KIND.dial), readout: is(kind, KIND.readout), screen: is(kind, KIND.screen), lamp: is(kind, KIND.lamp), vent: is(kind, KIND.vent) };
  const other = float(1).sub(weights.dial).sub(weights.readout).sub(weights.screen).sub(weights.lamp).sub(weights.vent);
  const reflected = plainColour
    .mul(other)
    .add(dialColour.mul(weights.dial))
    .add(ventColour.mul(weights.vent))
    .add(shaded(base.mul(0.2)).mul(weights.lamp));
  const hour: V3 = hazed ? hazed(reflected) : reflected;
  const ownLight = readoutColour
    .mul(weights.readout)
    .add(screenColour.mul(weights.screen))
    .add(lampColour.mul(weights.lamp))
    .add(dialGlow.mul(weights.dial))
    .add(shared.glow.mul(finish.w.mul(glowing)).mul(other));

  const material = new MeshBasicNodeMaterial();
  material.name = "car-cockpit";
  material.positionNode = turned;
  material.colorNode = vec3(hour.add(ownLight));
  return {
    material,
    /** Draws from another sheet: the texture nodes take it in place, with no new pipeline. */
    setSheet(next: Texture) {
      sheetNode.value = next;
      glyphNode.value = next;
    },
  };
}
