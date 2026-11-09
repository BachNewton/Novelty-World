import { BufferAttribute, BufferGeometry, DoubleSide, MeshBasicNodeMaterial, type Node } from "three/webgpu";
import { abs, attribute, cameraPosition, float, floor, fract, Fn, If, mix, normalWorld, positionLocal, positionWorld, reflect, round, select, sin, smoothstep, varying, vec3 } from "three/tsl";
import { seedOf, unitOf } from "../hash";
import { themeColor } from "@/shared/lib/three/theme-color";
import { PAINTS, PATTERNS, SURFACE_STRIDE, type Paint, type Pattern, type Soup } from "./shell";
import "./tokens.css";
import "../night/tokens.css";
import { towardsSun, type Sun } from "../sun";
import type { Lamp, RoomLight } from "../../dealership/interior";
import type { SeasonLook } from "../season";
import { snowfall, snowOnTop } from "../surfaces/snow";

/*
 * One material for a dealership, outside or in. A building's colours sit on its vertices, so a dealership is one mesh
 * and one draw call. Outside it is the world's light, the same sum as the cars', the season's snow on what faces up,
 * and once the lamps are lit its signs and the rooms seen through its glass shine through the night. Inside there is no sun: a handful of
 * point lights, fixed when the room is built and summed in the fragment shader, and what a glossy floor or a window
 * mirrors is worked out from the reflected ray, with no environment map and no second pass.
 */

const SUN_AMBIENT = 0.66;
const SUN_SHARE = 0.5;
/** Where a spot's edge starts to soften, as a share of its half-angle. */
const SPOT_SOFT_EDGE = 0.7;
const ROOM_SKY_SHARE = 0.1;
const HIGHLIGHT_POWER = 180;
const HIGHLIGHT_SHARE = 1.4;

/** Where a dealership's roofs and yards whiten as the land round them does (`art/surfaces/snow.ts`). */
const SNOW_THRESHOLD = 0.3;
/** How bright a lit room reads through glass at night, against its light's own colour. */
const NIGHT_ROOM = 0.85;

/** Metres a pixel covers, per metre away, at the game's lens and size. */
const PIXEL_M_PER_M = (2 * Math.tan((60 * Math.PI) / 360)) / 1007;

/** What the world gives a dealership outside: the hour's lamps, and the season's snow. A gallery may give neither. */
export interface Outdoors {
  /** 0 by day, 1 once the lamps are lit. */
  lampsOn?: Node<"float">;
  /** A colour that comes out as itself once `hazed` has given it the hour's light, for what shines by itself. */
  inLand?: (colour: Node<"vec3">) => Node<"vec3">;
  season?: SeasonLook;
}

export type Lighting =
  | ({ kind: "sun"; sun: Sun } & Outdoors)
  | { kind: "room"; light: RoomLight };

const tokenOf = (paint: Paint) => themeColor(`--color-aland-drive-${paint}`);
const linearToken = (name: string): Node<"vec3"> => {
  const { r, g, b } = themeColor(`--color-aland-drive-${name}`);
  return vec3(r, g, b);
};

/** A soup as a geometry: browser only, since the colours come from the stylesheet. */
export function geometryOf(soup: Soup): BufferGeometry {
  const vertices = soup.triangles * 3;
  const colours = new Float32Array(vertices * 3);
  const finishes = new Float32Array(vertices * 4);
  const palette = PAINTS.map(tokenOf);
  for (let vertex = 0; vertex < vertices; vertex++) {
    const at = vertex * SURFACE_STRIDE;
    const { r, g, b } = palette[soup.surface[at]];
    const shade = soup.surface[at + 1];
    colours.set([r * shade, g * shade, b * shade], vertex * 3);
    finishes.set([soup.surface[at + 2], soup.surface[at + 3], soup.surface[at + 4], soup.surface[at + 5]], vertex * 4);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(soup.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(soup.normals, 3));
  geometry.setAttribute("dealerColour", new BufferAttribute(colours, 3));
  geometry.setAttribute("dealerFinish", new BufferAttribute(finishes, 4));
  return geometry;
}

const patternIs = (name: Pattern) => PATTERNS.indexOf(name);
const linear = (paint: Paint) => {
  const { r, g, b } = tokenOf(paint);
  return vec3(r, g, b);
};

/** A smooth lump of noise from -1 to 1. */
const swell = (at: Node<"vec3">) => sin(at.x.add(sin(at.z.mul(1.7)).mul(1.3))).mul(sin(at.z.add(at.y.mul(0.8)).add(sin(at.x.mul(1.3)).mul(1.1))));
/** 1 while lines this wide are clear, 0 once they'd shimmer. */
const clear = (widthM: number, away: Node<"float">) => float(1).sub(smoothstep(float(0.5), float(1.6), away.mul(PIXEL_M_PER_M).div(widthM)));
/** A dark line at each whole number of `along`, as wide as a share of a step. */
const lineAt = (along: Node<"float">, share: number) => float(1).sub(smoothstep(float(share * 0.5), float(share), abs(fract(along).sub(0.5)).sub(0.5).abs()));

/** Where a lamp's light comes from for this pixel: its point, or a strip's nearest point to it. */
function lampSource(lamp: Lamp): Node<"vec3"> {
  if (lamp.kind !== "strip") return vec3(...lamp.at);
  const [from, to] = [vec3(...lamp.from), vec3(...lamp.to)];
  const along = to.sub(from);
  const share = positionWorld.sub(from).dot(along).div(along.dot(along)).clamp(0, 1);
  return from.add(along.mul(share));
}

/** A spot's light falls off across the edge of its cone; a point's and a strip's shine all round. */
function lampCone(lamp: Lamp, towardsLamp: Node<"vec3">): Node<"float"> {
  if (lamp.kind !== "spot") return float(1);
  const aim = vec3(lamp.aim[0] - lamp.at[0], lamp.aim[1] - lamp.at[1], lamp.aim[2] - lamp.at[2]).normalize();
  const half = (lamp.coneDeg * Math.PI) / 360;
  return smoothstep(float(Math.cos(half)), float(Math.cos(half * SPOT_SOFT_EDGE)), towardsLamp.negate().dot(aim));
}

export function dealerMaterial(lighting: Lighting, hazed: (color: Node<"vec3">) => Node<"vec3"> = (color) => color): MeshBasicNodeMaterial {
  const finish = attribute<"vec4">("dealerFinish", "vec4");
  const glow = finish.x;
  const gloss = finish.y;
  const base = attribute<"vec3">("dealerColour", "vec3");
  const local = varying(positionLocal);

  const material = new MeshBasicNodeMaterial();
  material.name = "dealer";
  material.colorNode = Fn(() => {
    const toCamera = cameraPosition.sub(positionWorld).normalize();
    const raw = normalWorld.normalize();
    const normal = select(raw.dot(toCamera).lessThan(0), raw.negate(), raw);
    const away = positionWorld.sub(cameraPosition).length();
    const painted = base.toVar();
    const kind = round(finish.z);
    If(kind.equal(patternIs("boards")), () => {
      const along = local.x.add(local.z).div(0.19);
      const tone = unitOf(seedOf(floor(along)), 1);
      painted.assign(base.mul(mix(float(1), mix(float(0.9), float(1.08), tone), clear(0.19, away))).mul(float(1).sub(lineAt(along, 0.09).mul(0.5).mul(clear(0.03, away)))));
    })
      .ElseIf(kind.equal(patternIs("ribs")), () => {
        painted.assign(base.mul(float(1).sub(lineAt(local.y.div(0.28), 0.12).mul(0.4).mul(clear(0.04, away)))));
      })
      .ElseIf(kind.equal(patternIs("seams")), () => {
        painted.assign(base.mul(float(1).sub(lineAt(local.x.div(0.42), 0.08).mul(0.34).mul(clear(0.04, away)))));
      })
      .ElseIf(kind.equal(patternIs("tiles")), () => {
        const cell = local.xz.div(1.2);
        const grout = lineAt(cell.x, 0.018).max(lineAt(cell.y, 0.018)).mul(clear(0.02, away));
        const tone = unitOf(seedOf(floor(cell.x), floor(cell.y)), 2);
        painted.assign(base.mul(mix(float(1), mix(float(0.96), float(1.03), tone), clear(1.2, away))).mul(float(1).sub(grout.mul(0.3))));
      })
      .ElseIf(kind.equal(patternIs("speckle")), () => {
        const fine = swell(local.mul(9)).add(swell(local.zxy.mul(23)).mul(0.6)).mul(clear(0.06, away));
        painted.assign(base.mul(float(1).add(swell(local.mul(0.9)).mul(0.06)).add(fine.mul(0.05))));
      });

    const mirrored = reflect(toCamera.negate(), normal);
    const grazing = float(1).sub(normal.dot(toCamera).max(0)).pow(3);
    const shine = gloss.mul(mix(float(0.22), float(1), grazing));

    if (lighting.kind === "sun") {
      const toSun = towardsSun(lighting.sun);
      const { lampsOn = float(0), inLand = (colour: Node<"vec3">) => colour, season } = lighting;
      const snowed = snowOnTop(painted, snowfall(season, (name) => linearToken(name)), normal.y.mul(float(1).sub(glow)), float(SNOW_THRESHOLD));
      const lit = snowed.mul(float(SUN_AMBIENT).add(normal.dot(toSun).max(0).mul(SUN_SHARE)));
      const world = mix(linear("tree-spruce"), mix(linear("sky"), linear("water"), smoothstep(float(0.2), float(0.8), mirrored.y)), smoothstep(float(-0.02), float(0.06), mirrored.y));
      const byDay = mix(mix(lit, world, shine), inLand(painted), glow);
      // The tone's index rounded from a value a little blended on some GPUs, each tone two apart and its strength at most 1 over.
      const tone = round(finish.w.div(2).sub(0.25));
      const strength = finish.w.sub(tone.mul(2));
      const toneIs = (index: number) => select(tone.equal(index), float(1), float(0));
      const lamplit = linear("dealer-light-warm").mul(toneIs(0)).add(linear("dealer-light-cool").mul(toneIs(1))).add(linearToken("night-window-warm").mul(toneIs(2))).mul(NIGHT_ROOM);
      return hazed(mix(byDay, inLand(lamplit), strength.mul(lampsOn)));
    }

    let sum: Node<"vec3"> = vec3(0, 0, 0);
    let highlight: Node<"vec3"> = vec3(0, 0, 0);
    const { ambient, ambientPaint, lamps, mirrors } = lighting.light;
    for (const lamp of lamps) {
      const source = lampSource(lamp);
      const offset = source.sub(positionWorld);
      const distance = offset.length();
      const direction = offset.div(distance);
      const falloff = float(1).div(float(1).add(distance.div(lamp.reachM).pow(2)));
      const colour = linear(lamp.paint).mul(lamp.power).mul(falloff).mul(lampCone(lamp, direction));
      sum = sum.add(colour.mul(normal.dot(direction).max(0)));
      highlight = highlight.add(colour.mul(mirrored.dot(direction).max(0).pow(HIGHLIGHT_POWER)));
    }
    const lit = painted.mul(linear(ambientPaint).mul(ambient).add(normal.y.max(0).mul(ROOM_SKY_SHARE)).add(sum));
    const room = mix(linear(mirrors[0]), linear(mirrors[1]), smoothstep(float(0.05), float(0.5), mirrored.y));
    return mix(mix(lit, room, shine).add(highlight.mul(gloss).mul(HIGHLIGHT_SHARE)), painted, glow);
  })();
  material.side = DoubleSide;
  return material;
}
