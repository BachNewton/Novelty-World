import { DoubleSide, MeshBasicNodeMaterial, Vector3, type Node } from "three/webgpu";
import { abs, attribute, cameraPosition, cos, cross, dFdx, dFdy, dot, float, floor, Fn, fract, If, int, mix, normalize, positionGeometry, positionWorld, round, screenCoordinate, select, sin, smoothstep, step, uniform, uniformArray, varying, vec2, vec3 } from "three/tsl";
import type { RoadsideInputs, RoadsideMaterials } from "../roadside/index";
import { PAINT, PATTERNS, RURAL_PARTS, type Pattern } from "./mesh";

/*
 * The rural kit's two materials, read by `placeModel` as the roadside kit's are: the
 * same instance layout and the same swap at each place's own distance, drawn from
 * the same lighting, so the two kits sit together. What's added is that nothing here
 * switches on a line. Inside a band round its swap distance a place draws both
 * versions, each keeping the pixels the other drops, so one dissolves into the
 * other; and towards its reach it grows up from the ground.
 *
 * Both run on the GPU from the distance alone: nothing costs the CPU as the car moves.
 * The surface patterns are a branch in the near material's fragment shader, so a pixel
 * pays for its own pattern only, and each fades to its mean by a pixel's size so it
 * can't shimmer. The far material has none.
 */

// As the roadside kit lights its own, which doesn't export them.
const AMBIENT = 0.68;
const SUN_SHARE = 0.5;
const FOOT_SHADE = 0.72;
const FOOT_M = 1.1;
const SWAP_SPREAD = 0.2;

/** How much of the distance to the swap the two versions take to dissolve across. */
const DISSOLVE_SHARE = 0.18;
/** How much of its reach a place takes to grow to full size. */
const GROW_SHARE = 0.2;

/** Metres a pixel covers, per metre away, at the game's lens and size. */
const PIXEL_M_PER_M = (2 * Math.tan((60 * Math.PI) / 360)) / 1007;

const pattern = (name: Pattern) => PATTERNS.indexOf(name);

const rollOf = (place: Node<"vec2">) => fract(sin(dot(place, vec2(12.9898, 78.233))).mul(43758.5453));
const hash = (cell: Node<"vec3">) => fract(sin(dot(cell, vec3(127.1, 311.7, 74.7))).mul(43758.5453));
/** A smooth lump of noise from -1 to 1, cheap and with no lattice to see. */
const swell = (at: Node<"vec3">) => sin(at.x.add(sin(at.z.mul(1.7)).mul(1.3))).mul(sin(at.z.add(at.y.mul(0.8)).add(sin(at.x.mul(1.3)).mul(1.1))));

/** 0 where a feature this wide is clear, 1 once it's too small to draw. */
const gone = (widthM: number, away: Node<"float">) => smoothstep(float(0.5), float(1.6), away.mul(PIXEL_M_PER_M).div(widthM));

/** One layer of round crystals on a grid: x is 1 inside a crystal's core, y on its pale rim. */
function ovoids(at: Node<"vec3">, size: number): Node<"vec2"> {
  const grid = at.div(size);
  const roll = hash(floor(grid));
  const centre = vec3(fract(roll.mul(7.3)), fract(roll.mul(13.1)), fract(roll.mul(29.7))).sub(0.5).mul(0.3);
  const reach = fract(grid).sub(0.5).sub(centre).mul(vec3(1, 1.3, 1)).length().div(mix(float(0.2), float(0.42), fract(roll.mul(3.7))));
  const present = step(roll, float(0.8));
  const core = float(1).sub(smoothstep(float(0.66), float(0.74), reach)).mul(present);
  return vec2(core, float(1).sub(smoothstep(float(0.86), float(0.96), reach)).mul(present).sub(core));
}

/** Rapakivi: pale-rimmed ovoids of pink feldspar crowded in a darker ground, rounded joints, a little lichen on what faces up, moss at the foot. */
function rapakivi({ colour }: Pick<RoadsideInputs, "colour">, base: Node<"vec3">, at: Node<"vec3">, away: Node<"float">, upward: Node<"float">, foot: Node<"float">) {
  const size = 0.1;
  const warped = at.add(vec3(swell(at.mul(3.1)), swell(at.zxy.mul(3.7)), swell(at.yzx.mul(2.9))).mul(0.05));
  const first = ovoids(warped, size);
  const second = ovoids(warped.add(vec3(0.5 * size, 0.31 * size, 0.27 * size)), size * 1.3);
  const thinning = smoothstep(float(-0.5), float(0.5), swell(at.mul(1.7)));
  const core = first.x.max(second.x).mul(mix(float(0.35), float(1), thinning));
  const rim = first.y.max(second.y).mul(float(1).sub(core)).mul(thinning);
  const near = float(1).sub(gone(size * 0.4, away)).mul(0.8);
  const feldspar = mix(colour("wall-red"), colour("wall-cream"), 0.3).mul(1.22);
  const mantle = mix(colour("wall-cream"), colour("wall-pale"), 0.4);
  const ground = base.mul(0.68);
  const crystals = mix(base, mix(mix(ground, feldspar, core), mantle, rim.mul(0.42)), near);

  const sheet = abs(sin(at.y.mul(2.3).add(at.x.mul(0.25)).add(swell(at.mul(0.55)).mul(1.8))));
  const joint = abs(sin(at.x.mul(0.9).add(at.z.mul(1.2)).add(sin(at.y.mul(1.9).add(swell(at.mul(0.9)).mul(1.5))).mul(0.5))));
  const crack = float(1).sub(smoothstep(float(0.012), float(0.04), sheet.min(joint))).mul(float(1).sub(gone(0.05, away)));
  const blotch = swell(at.mul(1.1)).add(swell(at.mul(2.9)).mul(0.5));
  const worn = crystals.mul(mix(float(0.88), float(1.08), blotch.mul(0.35).add(0.5).clamp()));
  const lichen = smoothstep(float(0.72), float(1.05), blotch.add(upward.sub(0.7).mul(0.8)));
  const pale = mix(worn, mix(colour("wall-pale"), colour("tree-birch"), 0.2), lichen.mul(0.5));
  const footing = float(1).sub(smoothstep(float(0.02), float(0.4), foot.add(blotch.mul(0.1))));
  const mossed = mix(pale, mix(colour("tree-pine"), colour("tree-birch"), 0.4), footing.mul(0.7));
  return mossed.mul(float(1).sub(crack.mul(0.62)));
}

/** Boards running up a wall that lies square to the model's axes, each its own tone. */
function boards(base: Node<"vec3">, at: Node<"vec3">, away: Node<"float">) {
  const size = 0.19;
  const along = at.x.add(at.z).div(size);
  const seam = float(1).sub(smoothstep(float(0.02), float(0.09), abs(fract(along).sub(0.5)).sub(0.5).abs()));
  const tone = hash(vec3(floor(along), 3, 9));
  const lit = mix(float(0.9), float(1.08), tone.mul(float(1).sub(gone(size, away))).add(gone(size, away).mul(0.5)));
  return base.mul(lit).mul(float(1).sub(seam.mul(0.5).mul(float(1).sub(gone(0.035, away)))));
}

/** Birch: dark lenses across the white, thick low down, on a black, fissured foot. */
function birch({ colour }: Pick<RoadsideInputs, "colour">, base: Node<"vec3">, at: Node<"vec3">, away: Node<"float">) {
  const grid = vec2(at.x.add(at.z).mul(15), at.y.mul(4.2));
  const cell = floor(grid);
  const roll = hash(vec3(cell, 5));
  const inCell = fract(grid).sub(0.5).abs();
  const lens = step(float(0.5), roll).mul(step(inCell.x, float(0.36))).mul(step(inCell.y, mix(float(0.05), float(0.17), fract(roll.mul(9.1)))));
  const low = float(1).sub(smoothstep(float(0.15), float(1.1), at.y.add(sin(grid.x.mul(2.3)).mul(0.35))));
  const dark = colour("wall-plinth").mul(0.45);
  return mix(mix(base, dark, lens.mul(float(1).sub(gone(0.04, away)))), dark, low);
}

/** Tufts: two layers of soft spots of light, on leaves or wool. */
function tufted(base: Node<"vec3">, at: Node<"vec3">, away: Node<"float">, sizeM: number, depth: number) {
  const spots = ovoids(at, sizeM).x.add(ovoids(at.add(vec3(0.4, 0.17, 0.29).mul(sizeM)), sizeM * 0.62).x.mul(0.7));
  return base.mul(float(1).add(spots.mul(depth).sub(depth * 0.45).mul(float(1).sub(gone(sizeM * 0.35, away)))));
}

/** Stalks laid round a bale: fine streaks. */
function straw(base: Node<"vec3">, at: Node<"vec3">, away: Node<"float">) {
  const streak = sin(at.y.mul(70).add(at.z.mul(54)).add(swell(at.mul(6)).mul(2.5)));
  return base.mul(float(1).add(streak.mul(0.12).mul(float(1).sub(gone(0.03, away))))).mul(float(1).add(swell(at.mul(3)).mul(0.1)));
}

function placedMaterial(inputs: RoadsideInputs, isNear: boolean): MeshBasicNodeMaterial {
  const { linear, colour, hazed, sun } = inputs;
  const place = attribute<"vec4">("place", "vec4");
  const fit = attribute<"vec4">("fit", "vec4");
  const reach = attribute<"vec2">("reach", "vec2");
  const tint = attribute<"vec4">("tint", "vec4");

  const distance = place.xz.sub(cameraPosition.xz).length();
  const roll = rollOf(place.xz);
  const swap = reach.x.mul(float(1).sub(roll.mul(SWAP_SPREAD)));
  const dissolveFrom = swap.mul(1 - DISSOLVE_SHARE);
  const shown = isNear ? distance.lessThan(swap) : distance.greaterThanEqual(dissolveFrom).and(distance.lessThan(reach.y));
  // A place's own edge of the reach, so a whole field doesn't rise on one line.
  const reachEnd = reach.y.mul(float(1).sub(roll.mul(GROW_SHARE * 0.5)));
  const grown = float(1).sub(smoothstep(reachEnd.mul(1 - GROW_SHARE), reachEnd, distance));
  const scale = select(shown, fit.x.mul(grown), float(0));

  const local = positionGeometry;
  const x = local.x.mul(fit.y);
  const up = local.y.add(x.mul(fit.z));
  const yawCos = cos(place.w);
  const yawSin = sin(place.w);

  const material = new MeshBasicNodeMaterial();
  material.positionNode = vec3(place.x.add(x.mul(yawCos).add(local.z.mul(yawSin)).mul(scale)), place.y.add(up.mul(scale)), place.z.add(local.z.mul(yawCos).sub(x.mul(yawSin)).mul(scale)));

  const blend = varying(smoothstep(dissolveFrom, swap, distance));
  const dither = fract(float(52.9829189).mul(fract(dot(screenCoordinate.xy, vec2(0.06711056, 0.00583715)))));
  material.maskNode = isNear ? dither.greaterThanEqual(blend) : dither.lessThan(blend);

  const azimuth = (sun.azimuthDeg * Math.PI) / 180;
  const elevation = (sun.elevationDeg * Math.PI) / 180;
  const toSun = uniform(new Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), -Math.cos(azimuth) * Math.cos(elevation)));
  const palette = uniformArray(RURAL_PARTS.map((part) => {
    const paint: { from: string; to?: string; share?: number; gain?: number } = PAINT[part];
    const { from, to = from, share = 0, gain = 1 } = paint;
    return linear(from).lerp(linear(to), share).multiplyScalar(gain);
  }));
  const base = (palette.element(int(round(tint.r.mul(255)))) as unknown as Node<"vec3">).mul(tint.g.mul(255 / 128));

  const facing = normalize(cross(dFdx(positionWorld), dFdy(positionWorld)));
  const normal = select(facing.dot(cameraPosition.sub(positionWorld)).lessThan(0), facing.negate(), facing);
  const lit = float(AMBIENT).add(normal.dot(toSun).max(0).mul(SUN_SHARE));
  const foot = up.mul(fit.x);
  const grounded = mix(mix(float(FOOT_SHADE), float(1), smoothstep(float(0), float(FOOT_M), foot)), float(1), tint.a);

  const surfaced = isNear
    ? Fn(() => {
        const painted = base.toVar();
        const kind = round(tint.b.mul(255));
        // In metres on the model, offset per place, so no two rocks wear one pattern.
        const at = vec3(x, local.y, local.z).mul(fit.x).add(roll.mul(37));
        const metres = vec3(x, local.y, local.z).mul(fit.x);
        const away = positionWorld.sub(cameraPosition).length();
        If(kind.equal(pattern("rapakivi")), () => {
          painted.assign(rapakivi(inputs, base, at, away, abs(facing.y), foot));
        })
          .ElseIf(kind.equal(pattern("boards")), () => {
            painted.assign(boards(base, metres, away));
          })
          .ElseIf(kind.equal(pattern("birch")), () => {
            painted.assign(birch({ colour }, base, at.sub(vec3(0, roll.mul(37), 0)), away));
          })
          .ElseIf(kind.equal(pattern("fleece")), () => {
            painted.assign(tufted(base, at, away, 0.1, 0.16));
          })
          .ElseIf(kind.equal(pattern("leaf")), () => {
            painted.assign(tufted(base, at, away, 0.36, 0.17));
          })
          .ElseIf(kind.equal(pattern("straw")), () => {
            painted.assign(straw(base, at, away));
          });
        return painted;
      })()
    : base;

  material.colorNode = hazed(surfaced.mul(lit).mul(grounded));
  material.side = DoubleSide;
  return material;
}

/** The kit's materials, made once for the game; all its models share them, and `placeModel` takes them as they are. */
export function ruralMaterials(inputs: RoadsideInputs): RoadsideMaterials {
  return { near: placedMaterial(inputs, true), far: placedMaterial(inputs, false) };
}
