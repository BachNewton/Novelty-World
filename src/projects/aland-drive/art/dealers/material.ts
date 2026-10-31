import { BufferAttribute, BufferGeometry, DoubleSide, MeshBasicNodeMaterial, Vector3, type Node } from "three/webgpu";
import { abs, attribute, cameraPosition, float, floor, fract, Fn, If, mix, normalWorld, positionLocal, positionWorld, reflect, round, select, sin, smoothstep, uniform, varying, vec3 } from "three/tsl";
import { themeColor } from "@/shared/lib/three/theme-color";
import { PAINTS, PATTERNS, SURFACE_STRIDE, type Paint, type Pattern, type Soup } from "./shell";
import "./tokens.css";

/*
 * One material for a dealership, outside or in. A building's colours sit on its vertices, so a dealership is one mesh
 * and one draw call. Outside it is the world's light, the same sum as the cars'. Inside there is no sun: a handful of
 * point lights, fixed when the room is built and summed in the fragment shader, and what a glossy floor or a window
 * mirrors is worked out from the reflected ray, with no environment map and no second pass.
 */

const SUN_AMBIENT = 0.66;
const SUN_SHARE = 0.5;
const ROOM_AMBIENT = 0.5;
const ROOM_SKY_SHARE = 0.1;
const HIGHLIGHT_POWER = 180;
const HIGHLIGHT_SHARE = 1.4;

/** Metres a pixel covers, per metre away, at the game's lens and size. */
const PIXEL_M_PER_M = (2 * Math.tan((60 * Math.PI) / 360)) / 1007;

export interface RoomLight {
  at: readonly [number, number, number];
  paint: Paint;
  /** Brightness at the light. */
  power: number;
  /** Where its brightness has halved. */
  reachM: number;
}

export type Lighting =
  | { kind: "sun"; sun: { azimuthDeg: number; elevationDeg: number } }
  | { kind: "room"; lights: readonly RoomLight[]; /** What the floor mirrors: low then high. */ mirrors: readonly [Paint, Paint] };

const tokenOf = (paint: Paint) => themeColor(`--color-aland-drive-${paint}`);

/** A soup as a geometry: browser only, since the colours come from the stylesheet. */
export function geometryOf(soup: Soup): BufferGeometry {
  const vertices = soup.triangles * 3;
  const colours = new Float32Array(vertices * 3);
  const finishes = new Float32Array(vertices * 3);
  const palette = PAINTS.map(tokenOf);
  for (let vertex = 0; vertex < vertices; vertex++) {
    const at = vertex * SURFACE_STRIDE;
    const { r, g, b } = palette[soup.surface[at]];
    const shade = soup.surface[at + 1];
    colours.set([r * shade, g * shade, b * shade], vertex * 3);
    finishes.set([soup.surface[at + 2], soup.surface[at + 3], soup.surface[at + 4]], vertex * 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(soup.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(soup.normals, 3));
  geometry.setAttribute("dealerColour", new BufferAttribute(colours, 3));
  geometry.setAttribute("dealerFinish", new BufferAttribute(finishes, 3));
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

export function dealerMaterial(lighting: Lighting, hazed: (color: Node<"vec3">) => Node<"vec3"> = (color) => color): MeshBasicNodeMaterial {
  const finish = attribute<"vec3">("dealerFinish", "vec3");
  const glow = finish.x;
  const gloss = finish.y;
  const base = attribute<"vec3">("dealerColour", "vec3");
  const local = varying(positionLocal);

  const material = new MeshBasicNodeMaterial();
  material.colorNode = Fn(() => {
    const toCamera = cameraPosition.sub(positionWorld).normalize();
    const raw = normalWorld.normalize();
    const normal = select(raw.dot(toCamera).lessThan(0), raw.negate(), raw);
    const away = positionWorld.sub(cameraPosition).length();
    const painted = base.toVar();
    const kind = round(finish.z);
    If(kind.equal(patternIs("boards")), () => {
      const along = local.x.add(local.z).div(0.19);
      const tone = fract(sin(floor(along).mul(12.9898)).mul(43758.5453));
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
        const tone = fract(sin(floor(cell.x).mul(12.9898).add(floor(cell.y).mul(78.233))).mul(43758.5453));
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
      const azimuth = (lighting.sun.azimuthDeg * Math.PI) / 180;
      const elevation = (lighting.sun.elevationDeg * Math.PI) / 180;
      const toSun = uniform(new Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), -Math.cos(azimuth) * Math.cos(elevation)));
      const lit = painted.mul(float(SUN_AMBIENT).add(normal.dot(toSun).max(0).mul(SUN_SHARE)));
      const world = mix(linear("tree-spruce"), mix(linear("sky"), linear("water"), smoothstep(float(0.2), float(0.8), mirrored.y)), smoothstep(float(-0.02), float(0.06), mirrored.y));
      return hazed(mix(mix(lit, world, shine), painted, glow));
    }

    let sum: Node<"vec3"> = vec3(0, 0, 0);
    let highlight: Node<"vec3"> = vec3(0, 0, 0);
    for (const { at, paint, power, reachM } of lighting.lights) {
      const offset = vec3(...at).sub(positionWorld);
      const distance = offset.length();
      const direction = offset.div(distance);
      const falloff = float(1).div(float(1).add(distance.div(reachM).pow(2)));
      const colour = linear(paint).mul(power).mul(falloff);
      sum = sum.add(colour.mul(normal.dot(direction).max(0)));
      highlight = highlight.add(colour.mul(mirrored.dot(direction).max(0).pow(HIGHLIGHT_POWER)));
    }
    const lit = painted.mul(vec3(ROOM_AMBIENT, ROOM_AMBIENT, ROOM_AMBIENT).add(normal.y.max(0).mul(ROOM_SKY_SHARE)).add(sum));
    const room = mix(linear(lighting.mirrors[0]), linear(lighting.mirrors[1]), smoothstep(float(0.05), float(0.5), mirrored.y));
    return mix(mix(lit, room, shine).add(highlight.mul(gloss).mul(HIGHLIGHT_SHARE)), painted, glow);
  })();
  material.side = DoubleSide;
  return material;
}
