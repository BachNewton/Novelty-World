import type { V3 } from "../roadside/mesh";
import type { RoadsideModel } from "../roadside/models";
import { Painted, runMotion, streetModel } from "./paint";

/*
 * What stands along a road outside town. As in the roadside kit, runs go along +x,
 * the side a driver sees faces +z, and everything goes this far under its origin.
 */
const SINK_M = 0.5;

/** A guard rail's section: a 4 m beam on posts 2 m apart, the Finnish standard run. Stretch it to fit. */
export const GUARD_RAIL_M = 4;
const POST_BAY_M = GUARD_RAIL_M / 2;
const RAIL_TOP_M = 0.75;
/** How far the beam stands off its posts, towards the road. */
const SPACER_M = 0.15;
const END_M = 4;
const END_STEPS = 4;
const END_FLARE_M = 0.7;

/** A W-beam in section: 310 mm tall and 83 mm deep, as (height under the top, depth towards the road). */
const W_PROFILE: readonly (readonly [down: number, out: number])[] = [[0, 0], [0.04, 0.075], [0.095, 0.083], [0.155, 0.018], [0.215, 0.083], [0.27, 0.075], [0.31, 0]];
/** Each strip of the profile catches the light by which way it faces, so the fold reads with no texture. */
const STRIP_SHADE = [1.2, 0.98, 0.72, 1.08, 0.86, 0.62];

/** The beam swept from one cross-section to the next, where each section is given by its height, and how far it lies off the post line. */
function sweep(into: Painted, sections: readonly (readonly [x: number, top: number, off: number])[]): Painted {
  for (let section = 0; section + 1 < sections.length; section++) {
    const [fromX, fromTop, fromOff] = sections[section];
    const [toX, toTop, toOff] = sections[section + 1];
    const point = (x: number, top: number, off: number, strip: number): V3 => [x, top - W_PROFILE[strip][0], SPACER_M + off + W_PROFILE[strip][1]];
    for (let strip = 0; strip + 1 < W_PROFILE.length; strip++) {
      into.face([point(fromX, fromTop, fromOff, strip), point(toX, toTop, toOff, strip), point(toX, toTop, toOff, strip + 1), point(fromX, fromTop, fromOff, strip + 1)], "rail", STRIP_SHADE[strip]);
    }
  }
  return into;
}

/** A sigma post, seen as an open channel, with the spacer that holds the beam off it. */
function railPost(into: Painted, x: number, top = RAIL_TOP_M, off = 0): Painted {
  const [wide, front, back] = [0.05, 0.06 + off, -0.06 + off];
  const bottom = -SINK_M;
  return into
    .face([[x - wide, bottom, back], [x - wide, top, back], [x + wide, top, back], [x + wide, bottom, back]], "rail-post", 0.8)
    .face([[x - wide, bottom, back], [x - wide, top, back], [x - wide, top, front], [x - wide, bottom, front]], "rail-post", 0.95)
    .face([[x + wide, bottom, back], [x + wide, top, back], [x + wide, top, front], [x + wide, bottom, front]], "rail-post", 0.95)
    .box([x - 0.04, top - 0.25, front], [x + 0.04, top - 0.05, SPACER_M + off + 0.02], "rail-spacer", { open: true, shade: 0.7 });
}

function farRail(x0: number, x1: number): Painted {
  const [high, low] = [RAIL_TOP_M, RAIL_TOP_M - 0.31];
  return new Painted()
    .face([[x0, high, SPACER_M + 0.05], [x1, high, SPACER_M + 0.05], [x1, low, SPACER_M + 0.05], [x0, low, SPACER_M + 0.05]], "rail", 0.95)
    .face([[x0 + POST_BAY_M - 0.05, -SINK_M, 0], [x0 + POST_BAY_M + 0.05, -SINK_M, 0], [x0 + POST_BAY_M + 0.05, low, 0], [x0 + POST_BAY_M - 0.05, low, 0]], "rail-post", 0.7);
}

const RAIL_SWAP_M = 70;
const RAIL_REACH_M = 420;

/** One section of W-beam from its origin along +x, with a post at each end's first and at its middle. Its road side is +z. */
export function buildGuardRail(): RoadsideModel {
  const near = sweep(new Painted(), [[0, RAIL_TOP_M, 0], [GUARD_RAIL_M, RAIL_TOP_M, 0]]);
  railPost(near, POST_BAY_M / 2);
  railPost(near, POST_BAY_M * 1.5);
  return streetModel(near, farRail(0, GUARD_RAIL_M), RAIL_SWAP_M, RAIL_REACH_M, runMotion);
}

/** The usual end: over 4 m the beam bends away from the road and runs down into the ground. It joins a section at its origin and runs on along +x. At a run's start, give it a `stretch` of -1: that mirrors it along the run and leaves its road side to the road, which turning it round wouldn't. */
export function buildGuardRailEnd(): RoadsideModel {
  const onRamp = (share: number) => [share * END_M, RAIL_TOP_M - (RAIL_TOP_M + 0.02) * share * share, -END_FLARE_M * share * share] as const;
  const near = sweep(new Painted(), Array.from({ length: END_STEPS + 1 }, (_, step) => onRamp(step / END_STEPS)));
  for (const share of [0.25, 0.6]) {
    const [x, top, off] = onRamp(share);
    railPost(near, x, top, off);
  }
  const far = new Painted().face([[0, RAIL_TOP_M, SPACER_M], [END_M, -0.02, SPACER_M - END_FLARE_M], [END_M, -0.05, SPACER_M - END_FLARE_M], [0, RAIL_TOP_M - 0.31, SPACER_M]], "rail", 0.9);
  return streetModel(near, far, RAIL_SWAP_M, RAIL_REACH_M, runMotion);
}

/** The other end, for where a run stops at a side road: a short rounded return of the beam, curling back behind its last post. A `stretch` of -1 puts it on a run's start, as for the ramped end. */
export function buildGuardRailReturn(): RoadsideModel {
  const curve = [0, 0.4, 0.8, 1.2].map((angle) => [Math.sin(angle) * 0.34, RAIL_TOP_M, 0.34 * (Math.cos(angle) - 1)] as const);
  const near = sweep(new Painted(), curve);
  railPost(near, 0);
  const far = new Painted().face([[0, RAIL_TOP_M, SPACER_M], [0.3, RAIL_TOP_M, SPACER_M - 0.2], [0.3, RAIL_TOP_M - 0.31, SPACER_M - 0.2], [0, RAIL_TOP_M - 0.31, SPACER_M]], "rail", 0.9);
  return streetModel(near, far, RAIL_SWAP_M, RAIL_REACH_M, runMotion);
}

const REFLECTOR_TALL_M = 1.05;
const BAND_LOW_M = 0.76;
const BAND_HIGH_M = 0.94;

/** A white edge post with its black band and a reflector on the band, facing +z down the road both ways. */
export function buildReflectorPost(): RoadsideModel {
  const [wide, deep] = [0.055, 0.035];
  const section: V3[] = [[-wide, 0, deep * 0.4], [0, 0, deep], [wide, 0, deep * 0.4], [wide * 0.8, 0, -deep], [-wide * 0.8, 0, -deep]];
  const at = (corner: V3, y: number): V3 => [corner[0], y, corner[2]];
  const near = new Painted();
  const stretch = (low: number, high: number, part: "post-white" | "post-band", shade: number) => {
    section.forEach((corner, index) => {
      const next = section[(index + 1) % section.length];
      near.face([at(corner, low), at(next, low), at(next, high), at(corner, high)], part, shade * (index === 3 ? 0.8 : 1));
    });
  };
  stretch(-SINK_M, BAND_LOW_M, "post-white", 1);
  stretch(BAND_LOW_M, BAND_HIGH_M, "post-band", 1);
  stretch(BAND_HIGH_M, REFLECTOR_TALL_M, "post-white", 1);
  near.face(section.map((corner) => at(corner, REFLECTOR_TALL_M)), "post-white", 1.05);
  for (const side of [-1, 1]) {
    const x = side * 0.024;
    near.face([[x - 0.019, BAND_LOW_M + 0.03, deep * 1.05], [x + 0.019, BAND_LOW_M + 0.03, deep * 1.05], [x + 0.019, BAND_HIGH_M - 0.03, deep * 1.05], [x - 0.019, BAND_HIGH_M - 0.03, deep * 1.05]], "reflector", 1.25);
  }
  const far = new Painted()
    .face([[-wide, -SINK_M, 0], [wide, -SINK_M, 0], [wide, BAND_LOW_M, 0], [-wide, BAND_LOW_M, 0]], "post-white")
    .face([[-wide, BAND_LOW_M, 0], [wide, BAND_LOW_M, 0], [wide, BAND_HIGH_M, 0], [-wide, BAND_HIGH_M, 0]], "post-band")
    .face([[-wide, BAND_HIGH_M, 0], [wide, BAND_HIGH_M, 0], [wide, REFLECTOR_TALL_M, 0], [-wide, REFLECTOR_TALL_M, 0]], "post-white");
  return streetModel(near, far, 45, 360);
}

/** A Finnish road-safety camera: a grey mast on a concrete foot, a cabinet with its lens looking along +z at oncoming cars, and the flash beside it. */
export function buildSpeedCamera(): RoadsideModel {
  const mast = 3.4;
  const [wide, deep, tall] = [0.24, 0.26, 0.72];
  const low = mast - 0.2;
  const near = new Painted()
    .box([-0.32, -SINK_M, -0.32], [0.32, 0.12, 0.32], "concrete", { open: true, shadeTop: 1.1 })
    .tube([0, 0.1, 0], [0, low, 0], 0.075, 6, { radiusTo: 0.065 }, "camera-grey")
    .box([-wide, low, -deep], [wide, low + tall, deep], "camera-grey", { shade: 0.95, shadeTop: 1.08 })
    .box([-wide - 0.02, low + tall, -deep - 0.02], [wide + 0.02, low + tall + 0.04, deep + 0.03], "camera-dark", { shadeTop: 1.4 })
    .face([[-0.18, low + 0.28, deep + 0.004], [0.18, low + 0.28, deep + 0.004], [0.18, low + 0.62, deep + 0.004], [-0.18, low + 0.62, deep + 0.004]], "camera-glass")
    .tube([-0.07, low + 0.45, deep + 0.005], [-0.07, low + 0.45, deep + 0.03], 0.075, 6, { cap: true }, "camera-dark")
    .tube([-0.07, low + 0.45, deep + 0.03], [-0.07, low + 0.45, deep + 0.034], 0.05, 6, { cap: true, shadeFrom: 1.2 }, "camera-lens")
    .box([0.04, low + 0.34, deep + 0.005], [0.15, low + 0.56, deep + 0.03], "camera-lens", { shade: 1.15 })
    .box([-0.09, low - 0.6, -0.07], [0.09, low - 0.1, 0.08], "camera-dark", { open: false });
  const far = new Painted()
    .tube([0, -SINK_M, 0], [0, low, 0], 0.09, 3, {}, "camera-grey")
    .box([-wide, low, -deep], [wide, low + tall, deep], "camera-grey", { open: true, shadeTop: 1.1 });
  return streetModel(near, far, 90, 520);
}
