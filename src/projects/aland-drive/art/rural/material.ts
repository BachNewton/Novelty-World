import { DoubleSide, MeshBasicNodeMaterial, Vector3, Vector4, type Node } from "three/webgpu";
import { abs, attribute, cameraPosition, cos, dot, float, floor, Fn, fract, fwidth, If, int, max, mix, positionGeometry, positionWorld, round, select, sin, smoothstep, step, uniformArray, varying, vec2, vec3 } from "three/tsl";
import { facetLight, footShade, rollOf, screenPattern, SWAP_SPREAD, type RoadsideInputs, type RoadsideMaterials } from "../roadside/index";
import { band } from "../surfaces";
import { BRACES, GABLE_PAINTS, TRIM_WIDTHS } from "./buildings";
import { PAINT, PAINTED_FROM, PATTERNS, RURAL_PARTS, type Pattern, type RuralPart } from "./mesh";

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
 * can't shimmer. The far material has none of those: what it draws instead is a
 * building's door, windows and trim on its plain walls, each as its share of the
 * pixel, where the near version has them as faces, so the two match at the swap.
 */


/** How much of the distance to the swap the two versions take to dissolve across. */
const DISSOLVE_SHARE = 0.18;
/** How much of its reach a place takes to grow to full size. */
const GROW_SHARE = 0.2;

/** Metres a pixel covers, per metre away, at the game's lens and size. */
const PIXEL_M_PER_M = (2 * Math.tan((60 * Math.PI) / 360)) / 1007;

const pattern = (name: Pattern) => PATTERNS.indexOf(name);

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

/** The share of a wall the gaps between boards darken: the seam's profile averaged across a board. */
const SEAM_SHARE = (0.02 + 0.07 / 2) / 0.5;
const SEAM_DARK = 0.5;
/** What boards come to far off, where each board's tone is the middle of its range and the seams are their share: the far version's walls wear this. */
const BOARDS_MEAN = ((0.9 + 1.08) / 2) * (1 - SEAM_DARK * SEAM_SHARE);

/** Boards running up a wall that lies square to the model's axes, each its own tone. Seams too fine to draw settle on their share, not on nothing. */
function boards(base: Node<"vec3">, at: Node<"vec3">, away: Node<"float">) {
  const size = 0.19;
  const along = at.x.add(at.z).div(size);
  const seam = float(1).sub(smoothstep(float(0.02), float(0.09), abs(fract(along).sub(0.5)).sub(0.5).abs()));
  const tone = hash(vec3(floor(along), 3, 9));
  const lit = mix(float(0.9), float(1.08), tone.mul(float(1).sub(gone(size, away))).add(gone(size, away).mul(0.5)));
  return base.mul(lit).mul(float(1).sub(mix(seam, float(SEAM_SHARE), gone(0.035, away)).mul(SEAM_DARK)));
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

/** Every part's paint in linear light, by its place in `RURAL_PARTS`. */
export function ruralColours(linear: RoadsideInputs["linear"]): Vector3[] {
  return RURAL_PARTS.map((part) => {
    const paint: { from: string; to?: string; share?: number; gain?: number } = PAINT[part];
    const { from, to = from, share = 0, gain = 1 } = paint;
    return linear(from).lerp(linear(to), share).multiplyScalar(gain);
  });
}

/** A vertex's paint from the kit's palette, before any light. */
export function ruralPaint(palette: ReturnType<typeof uniformArray>): Node<"vec3"> {
  const tint = attribute<"vec4">("tint", "vec4");
  return (palette.element(int(round(tint.r.mul(255)))) as unknown as Node<"vec3">).mul(tint.g.mul(255 / 128));
}

const RECORD_VEC4S = 5;

/** `GABLE_PAINTS` as vec4s, `RECORD_VEC4S` to a building, in the order `gablePainted` reads them. */
function paintRecords(): Vector4[] {
  return GABLE_PAINTS.flatMap(({ gable, door, window, hatch, braces }) => [
    new Vector4(gable.x, gable.z, gable.floor, gable.eaves),
    new Vector4(gable.ridge, door.centre, door.wide / 2, door.bottom),
    new Vector4(door.bottom + door.tall, door.leaves, window.y, window.z),
    new Vector4(window.size / 2, window.bothSides ? 1 : 0, hatch?.half ?? 0, hatch?.bottom ?? 0),
    new Vector4(hatch?.top ?? 0, braces ? 1 : 0, 0, 0),
  ]);
}

/**
 * A far wall with its building's paint: the near version's corner boards, barge boards
 * and fascia, door and windows, at their places in the model's own metres, each as its
 * share of the pixel (`art/surfaces/coverage.ts`), so it blurs into the wall's average
 * with distance as the near version's faces do.
 */
function gablePainted(base: Node<"vec3">, paint: (part: RuralPart) => Node<"vec3">, read: (index: number) => Node<"vec4">): Node<"vec3"> {
  const [shape, doorAt, doorTo, windowAt, hatchTo] = [read(0), read(1), read(2), read(3), read(4)];
  const [halfX, halfZ, floorY, eaves] = [shape.x, shape.y, shape.z, shape.w];
  const ridge = doorAt.x;
  const at = positionGeometry;
  const [wideX, tall, wideZ] = [fwidth(at.x), fwidth(at.y), fwidth(at.z)];
  const y = at.y;
  const yes = (on: Node<"bool">) => select(on, float(1), float(0));
  const { corner, barge, fascia, doorFrame, windowFrame, mullion, bar } = TRIM_WIDTHS;

  const onEnd = abs(at.z).div(halfZ).greaterThan(abs(at.x).div(halfX));
  const along = select(onEnd, at.x, at.z);
  const corners = band(abs(along), select(onEnd, halfX, halfZ).sub(corner), float(100), select(onEnd, wideX, wideZ)).mul(band(y, floorY, eaves, tall));
  const roofLine = ridge.sub(ridge.sub(eaves).mul(abs(at.x)).div(halfX));
  const edge = select(onEnd, band(y, roofLine.sub(barge), roofLine.add(1), tall), band(y, eaves.sub(fascia), eaves.add(1), tall));

  const front = yes(onEnd.and(at.z.greaterThan(0)));
  const fromDoor = at.x.sub(doorAt.y);
  const [doorHalf, doorFoot, doorTop] = [doorAt.z, doorAt.w, doorTo.x];
  const framed = band(fromDoor, doorHalf.add(doorFrame).negate(), doorHalf.add(doorFrame), wideX).mul(band(y, doorFoot, doorTop.add(doorFrame), tall)).mul(front);
  const door = band(fromDoor, doorHalf.negate(), doorHalf, wideX).mul(band(y, doorFoot, doorTop, tall)).mul(front);
  const middle = band(fromDoor, -mullion / 2, mullion / 2, wideX).mul(door).mul(yes(doorTo.y.greaterThan(1.5)));
  const rail = (low: number) => band(y, doorFoot.add(low), doorFoot.add(low + BRACES.tall), tall);
  const braced = band(abs(fromDoor), BRACES.from, BRACES.to, wideX).mul(rail(BRACES.low).add(rail(BRACES.high))).mul(door).mul(hatchTo.y);
  const hatch = band(at.x, windowAt.z.negate(), windowAt.z, wideX).mul(band(y, windowAt.w, hatchTo.x, tall)).mul(front);

  const onSide = yes(onEnd.not().and(at.x.greaterThan(0).or(windowAt.y.greaterThan(0.5))));
  const [acrossPane, upPane, paneHalf] = [at.z.sub(doorTo.w), y.sub(doorTo.z), windowAt.x];
  const pane = (grow: number) => band(acrossPane, paneHalf.add(grow).negate(), paneHalf.add(grow), wideZ).mul(band(upPane, paneHalf.add(grow).negate(), paneHalf.add(grow), tall)).mul(onSide);
  const glass = pane(0);
  const glazingBar = band(upPane, -bar / 2, bar / 2, tall).mul(glass);

  const trim = paint("trim");
  const trimmed = mix(base, trim, max(corners, edge).max(framed).max(pane(windowFrame)));
  const doored = mix(mix(trimmed, paint("door"), door.max(hatch)), trim, max(middle, braced.mul(0.9)));
  return mix(mix(doored, paint("glass"), glass), trim, glazingBar);
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
  const z = local.z.mul(fit.w);
  const up = local.y.add(x.mul(fit.z));
  const yawCos = cos(place.w);
  const yawSin = sin(place.w);

  const material = new MeshBasicNodeMaterial();
  material.positionNode = vec3(place.x.add(x.mul(yawCos).add(z.mul(yawSin)).mul(scale)), place.y.add(up.mul(scale)), place.z.add(z.mul(yawCos).sub(x.mul(yawSin)).mul(scale)));

  const blend = varying(smoothstep(dissolveFrom, swap, distance));
  const dither = screenPattern();
  material.maskNode = isNear ? dither.greaterThanEqual(blend) : dither.lessThan(blend);

  const palette = uniformArray(ruralColours(linear));
  const paintOf = (part: Node<"int">) => palette.element(part) as unknown as Node<"vec3">;
  const base = paintOf(int(round(tint.r.mul(255)))).mul(tint.g.mul(255 / 128));
  const kind = round(tint.b.mul(255));

  const { facing, lit } = facetLight(sun);
  const foot = up.mul(fit.x);
  const grounded = mix(footShade(foot), float(1), tint.a);

  const surfaced = isNear
    ? Fn(() => {
        const painted = base.toVar();
        // In metres on the model, offset per place, so no two rocks wear one pattern.
        const metres = vec3(x, local.y, z).mul(fit.x);
        const at = metres.add(roll.mul(37));
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
    : Fn(() => {
        const painted = select(kind.equal(pattern("boards")).or(kind.greaterThanEqual(PAINTED_FROM)), base.mul(BOARDS_MEAN), base).toVar();
        const records = uniformArray(paintRecords());
        If(kind.greaterThanEqual(PAINTED_FROM), () => {
          const record = int(kind.sub(PAINTED_FROM)).mul(RECORD_VEC4S);
          const read = (index: number) => records.element(record.add(index)) as unknown as Node<"vec4">;
          const boarded = (part: RuralPart) => paintOf(int(RURAL_PARTS.indexOf(part))).mul(part === "door" ? BOARDS_MEAN : 1);
          painted.assign(gablePainted(painted, boarded, read));
        });
        return painted;
      })();

  material.colorNode = hazed(surfaced.mul(lit).mul(grounded));
  material.side = DoubleSide;
  return material;
}

/** The kit's materials, made once for the game; all its models share them, and `placeModel` takes them as they are. */
export function ruralMaterials(inputs: RoadsideInputs): RoadsideMaterials {
  return { near: placedMaterial(inputs, true), far: placedMaterial(inputs, false) };
}
