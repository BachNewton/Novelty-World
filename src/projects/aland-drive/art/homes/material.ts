import { DoubleSide, MeshBasicNodeMaterial, type Node } from "three/webgpu";
import { abs, attribute, dot, float, floor, Fn, fract, If, int, mix, positionGeometry, round, sin, smoothstep, step, uniform, uniformArray, vec2 } from "three/tsl";
import type { RoadsideInputs } from "../roadside/index";
import { INTERIOR_PARTS, paintOf, SURFACES, type Surface } from "./paint";
import "./tokens.css";

/*
 * The one material of every room: a part's paint, the surface drawn on it, and the
 * light baked in `room-mesh.ts` coloured by the three light tokens. Exteriors are
 * rural-kit models and take `ruralMaterials`, so a home needs nothing new out of doors.
 */

type Inputs = Pick<RoadsideInputs, "linear" | "colour">;

const AMBIENT_FLOOR = 0.14;
const AMBIENT_SHARE = 0.62;
const ROLL_OFF = 0.28;

const surfaceIs = (kind: Node<"float">, name: Surface) => kind.equal(SURFACES.indexOf(name));
const hash = (at: Node<"vec2">) => fract(sin(dot(at, vec2(12.9898, 78.233))).mul(43758.5453));
const lump = (at: Node<"vec2">) => sin(at.x.add(sin(at.y.mul(1.7)).mul(1.3))).mul(sin(at.y.add(sin(at.x.mul(1.3)).mul(1.1))));
/** 1 on a joint between units of `along`, fading to 0 within `width` of a unit. */
const joint = (along: Node<"float">, width: number) => float(1).sub(smoothstep(float(0), float(width), float(0.5).sub(abs(fract(along).sub(0.5)))));

function planks(base: Node<"vec3">, at: Node<"vec3">) {
  const row = at.x.div(0.15);
  const rowId = floor(row);
  const along = at.z.div(2.1).add(hash(vec2(rowId, 3)));
  const tone = mix(float(0.84), float(1.1), hash(vec2(rowId, floor(along))));
  const grain = float(1).add(sin(at.x.mul(90).add(lump(at.xz.mul(vec2(3, 0.6))).mul(5))).mul(0.035));
  return base.mul(tone).mul(grain).mul(float(1).sub(joint(row, 0.05).mul(0.5))).mul(float(1).sub(joint(along, 0.008).mul(0.5)));
}

function panel(base: Node<"vec3">, at: Node<"vec3">) {
  const along = at.x.add(at.z).div(0.115);
  const tone = mix(float(0.93), float(1.05), hash(vec2(floor(along), 7)));
  return base.mul(tone).mul(float(1).sub(joint(along, 0.07).mul(0.42)));
}

function logs(base: Node<"vec3">, at: Node<"vec3">) {
  const course = at.y.div(0.21);
  const curve = abs(fract(course).sub(0.5)).mul(2);
  const tone = mix(float(0.9), float(1.06), hash(vec2(floor(course), 11)));
  return base.mul(tone).mul(mix(float(1.08), float(0.48), curve.pow(5)));
}

function stripes(base: Node<"vec3">, at: Node<"vec3">) {
  return base.mul(mix(float(0.93), float(1.04), step(float(0.5), fract(at.x.add(at.z).div(0.28)))));
}

function weave(base: Node<"vec3">, at: Node<"vec3">) {
  const threads = sin(at.x.add(at.y).mul(170)).mul(sin(at.z.sub(at.y).mul(170)));
  return base.mul(float(1).add(threads.mul(0.07)));
}

function tiled(base: Node<"vec3">, at: Node<"vec3">) {
  const [across, up] = [at.x.add(at.z).div(0.15), at.y.div(0.15)];
  const tone = mix(float(0.95), float(1.04), hash(vec2(floor(across), floor(up))));
  return base.mul(tone).mul(float(1).sub(joint(across, 0.05).max(joint(up, 0.05)).mul(0.3)));
}

/** A picture of what's outside, in the plane of a view: `along` runs across it, and y is height, with the horizon near the eye. */
function outside({ colour }: Inputs, kind: Node<"float">, at: Node<"vec3">) {
  const along = at.x.add(at.z);
  const high = at.y.sub(1.45);
  const cloud = smoothstep(float(0.45), float(0.95), lump(vec2(along.mul(0.11), high.mul(0.42))).add(lump(vec2(along.mul(0.27), high.mul(0.9))).mul(0.4)));
  const skyUp = mix(mix(colour("sky"), colour("home-plaster"), 0.55), colour("sky"), smoothstep(float(0), float(5), high));
  const sky = mix(skyUp, colour("home-plaster"), cloud.mul(0.8)).mul(1.15);

  const seaLight = mix(colour("water"), colour("sky"), 0.35);
  const glint = smoothstep(float(0.75), float(1), sin(high.mul(44).add(lump(vec2(along.mul(0.8), high.mul(9))).mul(2.4)))).mul(0.14);
  const sea = mix(colour("water"), seaLight, smoothstep(float(-3), float(0), high)).add(glint);
  const tree = (scale: number) => sin(along.mul(scale)).mul(0.1).add(sin(along.mul(scale * 2.7)).mul(0.07)).add(abs(sin(along.mul(scale * 7.3))).mul(0.14));

  return Fn(() => {
    const picture = sky.toVar();
    If(surfaceIs(kind, "view-sea"), () => {
      picture.assign(mix(sky, sea, step(high, float(0))));
      const skerry = smoothstep(float(0.2), float(0.6), lump(vec2(along.mul(0.09), float(2)))).mul(0.65).add(tree(1.4)).sub(0.25);
      const far = step(high, skerry).mul(step(float(0.02), skerry)).mul(step(float(-0.03), high));
      picture.assign(mix(picture, mix(colour("tree-spruce"), colour("sky"), 0.45), far));
    })
      .ElseIf(surfaceIs(kind, "view-shore"), () => {
        picture.assign(mix(sky, sea, step(high, float(0))));
        const line = high.add(float(1.2)).add(sin(along.mul(0.33)).mul(0.5)).add(lump(vec2(along.mul(0.7), high)).mul(0.1));
        const rock = mix(colour("wall-grey"), colour("home-rust"), 0.22).mul(mix(float(0.8), float(1.1), hash(vec2(floor(along.mul(3)), floor(high.mul(5))))));
        picture.assign(mix(picture, rock, step(line, float(0))));
        const pine = high.sub(sin(along.mul(0.21)).mul(1.1)).sub(1).sub(tree(2.1).mul(2));
        const side = smoothstep(float(0.2), float(0.5), sin(along.mul(0.13).add(1)));
        picture.assign(mix(picture, colour("tree-pine"), step(pine, float(0)).mul(side)));
      })
      .ElseIf(surfaceIs(kind, "view-field"), () => {
        const trees = high.sub(0.42).sub(tree(0.9).mul(1.6));
        picture.assign(mix(sky, mix(colour("tree-spruce"), colour("sky"), 0.2), step(trees, float(0))));
        const strips = mix(float(0.92), float(1.1), step(float(0.5), fract(high.mul(1.4).add(along.mul(0.08)))));
        picture.assign(mix(picture, colour("ground").mul(1.25).mul(strips), step(high, float(0.05))));
      })
      .ElseIf(surfaceIs(kind, "view-town"), () => {
        const house = floor(along.div(3.6));
        const roll = hash(vec2(house, 5));
        const top = mix(float(1.3), float(3.1), roll);
        const inHouse = abs(fract(along.div(3.6)).sub(0.5)).mul(3.6);
        const roof = top.add(float(0.9).sub(inHouse.mul(0.5)));
        const body = mix(mix(colour("wall-trim"), colour("wall-yellow"), step(roll, float(0.7))), colour("wall-red"), step(roll, float(0.4)));
        const panes = step(float(0.65), fract(along.mul(1.1))).mul(step(float(0.55), fract(high.mul(0.9)))).mul(step(high, top));
        picture.assign(mix(sky, mix(body, colour("wall-glass"), panes), step(high, top)));
        picture.assign(mix(picture, colour("wall-plinth"), step(top, high).mul(step(high, roof))));
        const lindens = high.sub(1.2).sub(tree(1.1).mul(2.6)).sub(sin(along.mul(0.5)).mul(0.5));
        picture.assign(mix(picture, colour("tree-birch"), step(lindens, float(0))));
        picture.assign(mix(picture, colour("wall-grey"), step(high, float(-0.2))));
      });
    return picture;
  })();
}

export interface RoomLights {
  /** How much of each light the room has: 1 for the day it was built for. */
  ambient: number;
  window: number;
  lamp: number;
}

/** The material of every room, shared by all of them. */
export function interiorMaterial(inputs: Inputs) {
  const { linear, colour } = inputs;
  const tint = attribute<"vec4">("tint", "vec4");
  const light = attribute<"vec3">("light", "vec3");
  const palette = uniformArray(INTERIOR_PARTS.map((part) => {
    const { from, to = from, share = 0, gain = 1 } = paintOf(part);
    return linear(from).lerp(linear(to), share).multiplyScalar(gain);
  }));
  const [ambient, windowLight, lamp] = [uniform(1), uniform(1), uniform(1)];
  const base = (palette.element(int(round(tint.r.mul(255)))) as unknown as Node<"vec3">).mul(tint.g.mul(255 / 128));
  const kind = round(tint.b.mul(255));
  const at = positionGeometry;

  const surfaced = Fn(() => {
    const painted = base.toVar();
    If(surfaceIs(kind, "planks"), () => {
      painted.assign(planks(base, at));
    })
      .ElseIf(surfaceIs(kind, "panel"), () => {
        painted.assign(panel(base, at));
      })
      .ElseIf(surfaceIs(kind, "logs"), () => {
        painted.assign(logs(base, at));
      })
      .ElseIf(surfaceIs(kind, "stripes"), () => {
        painted.assign(stripes(base, at));
      })
      .ElseIf(surfaceIs(kind, "weave"), () => {
        painted.assign(weave(base, at));
      })
      .ElseIf(surfaceIs(kind, "tile"), () => {
        painted.assign(tiled(base, at));
      })
      .ElseIf(kind.greaterThanEqual(SURFACES.indexOf("view-sea")), () => {
        painted.assign(outside(inputs, kind, at));
      });
    return painted;
  })();

  const baked = colour("home-light-ambient").mul(light.x.mul(AMBIENT_SHARE).add(AMBIENT_FLOOR).mul(ambient)).add(colour("home-light-window").mul(light.y.mul(windowLight))).add(colour("home-light-lamp").mul(light.z.mul(lamp)));
  // Bright surfaces roll off rather than clip.
  const lit = surfaced.mul(baked);
  const material = new MeshBasicNodeMaterial();
  material.colorNode = mix(lit.div(lit.mul(ROLL_OFF).add(1)).mul(1 + ROLL_OFF * 0.7), surfaced, step(float(0.5), tint.a));
  material.side = DoubleSide;
  return {
    material,
    setLights(lights: RoomLights) {
      ambient.value = lights.ambient;
      windowLight.value = lights.window;
      lamp.value = lights.lamp;
    },
  };
}

export type InteriorMaterial = ReturnType<typeof interiorMaterial>;
