import type { FigureSpec, Outfit } from "./figure";
import type { Part } from "./parts";
import { posed, type Limb, type Piece, type PoseName, type Posed, type Prop } from "./poses";
import { add, cross, frameAlong, inFrame, lengthOf, lerp, measure, sub, unit, type Body, type Frame, type V3 } from "./skeleton";
import { ringIn, Soup, STILL, type Drive, type Rig, type Ring } from "./soup";

/*
 * A figure as rigid parts on pivots, written out in its pose. The parts are lofts of
 * a few rings, each ending in a blunt point inside its neighbour, so a joint can turn
 * with no seam to open. Clothes are what's different about the shape, not only the
 * colour: a hem, a sleeve, a collar, a skirt that follows the thighs when they sit.
 *
 * A near figure stays under 500 triangles. A far one is under 60, in the same pose
 * and the same colours, so nothing changes shape at the swap.
 */

type Sleeve = "none" | "short" | "long";
type Lower = "shorts" | "trousers" | "skirt";

const CUT: Record<Outfit, { sleeve: Sleeve; lower: Lower; jacket?: boolean; collar?: boolean }> = {
  "tee-shorts": { sleeve: "short", lower: "shorts" },
  "shirt-trousers": { sleeve: "long", lower: "trousers" },
  "jacket-trousers": { sleeve: "long", lower: "trousers", jacket: true },
  "summer-dress": { sleeve: "none", lower: "skirt" },
  "blouse-skirt": { sleeve: "short", lower: "skirt" },
  "sailing-jacket": { sleeve: "long", lower: "trousers", jacket: true, collar: true },
  overalls: { sleeve: "long", lower: "trousers" },
  cyclist: { sleeve: "short", lower: "shorts" },
};

export const wearsSkirt = (outfit: Outfit) => CUT[outfit].lower === "skirt";

const ARM_SIDES = 4;
const LEG_SIDES = 5;
const TORSO_SIDES = 7;
const HEAD_SIDES = 7;

/** A round part from one point to another, each end closed by a blunt tip. */
function capsule(soup: Soup, from: V3, to: V3, radiusFrom: number, radiusTo: number, part: Part, sides: number, { closed = true, blunt = 0.8 }: { closed?: boolean; blunt?: number } = {}) {
  const frame = frameAlong(from, to);
  const way = frame.y;
  const ringAt = (at: V3, radius: number): Ring => ({ at, u: add([0, 0, 0], frame.x, radius), v: add([0, 0, 0], frame.z, radius) });
  const [a, b] = [ringAt(from, radiusFrom), ringAt(to, radiusTo)];
  if (closed) soup.tip(a, add(from, way, -radiusFrom * blunt), part, sides);
  soup.loft([a, b], part, { sides });
  soup.tip(b, add(to, way, radiusTo * 0.8), part, sides);
}

/** A length of limb with open ends, for where a sleeve or a hem meets what's under it. */
function length(soup: Soup, from: V3, to: V3, radiusFrom: number, radiusTo: number, part: Part, sides: number) {
  const frame = frameAlong(from, to);
  const ringAt = (at: V3, radius: number): Ring => ({ at, u: add([0, 0, 0], frame.x, radius), v: add([0, 0, 0], frame.z, radius) });
  soup.loft([ringAt(from, radiusFrom), ringAt(to, radiusTo)], part, { sides });
}

function foot(soup: Soup, { end, point }: Limb, body: Body, part: Part) {
  const s = body.scale;
  const side = unit(cross([0, 1, 0.001], point));
  const up = unit(cross(point, side));
  const sole = add(end, up, -body.ankleY);
  const ring = (along: number, wide: number, tall: number): Ring => {
    const at = add(add(sole, point, along * s), up, tall * s);
    return { at, u: add([0, 0, 0], side, wide * s), v: add([0, 0, 0], up, tall * s) };
  };
  soup.loft([ring(-0.065, 0.036, 0.042), ring(0.075, 0.048, 0.042), ring(0.185, 0.04, 0.02)], part, { sides: ARM_SIDES, capStart: true, capEnd: true });
}

function hand(soup: Soup, { end, point }: Limb, body: Body, part: Part) {
  const frame = frameAlong(end, add(end, point));
  const s = body.handM;
  const ring = (along: number, wide: number, flat: number): Ring => ({ at: add(end, point, along * s), u: add([0, 0, 0], frame.x, wide * s), v: add([0, 0, 0], frame.z, flat * s) });
  soup.loft([ring(-0.1, 0.2, 0.2), ring(0.48, 0.25, 0.13)], part, { sides: ARM_SIDES });
  soup.tip(ring(0.48, 0.25, 0.13), add(end, point, s * 0.82), part, ARM_SIDES);
}

function arm(soup: Soup, limb: Limb, body: Body, sleeve: Sleeve, skin: Part, cloth: Part, bulk: number, rigUpper: Rig, rigLower: Rig) {
  const [elbow, wrist] = [limb.joint, limb.end];
  const r = body.armR;
  soup.rigged(rigUpper, () => {
    if (sleeve === "short") {
      const hem = lerp(limb.root, elbow, 0.5);
      const frame = frameAlong(limb.root, elbow);
      const top: Ring = { at: limb.root, u: add([0, 0, 0], frame.x, r * 1.14), v: add([0, 0, 0], frame.z, r * 1.14) };
      soup.tip(top, add(limb.root, frame.y, -r * 0.2), cloth, ARM_SIDES);
      length(soup, limb.root, hem, r * 1.14, r * 1.1, cloth, ARM_SIDES);
      capsule(soup, hem, elbow, r * 0.94, r * 0.86, skin, ARM_SIDES, { closed: false });
    } else {
      capsule(soup, limb.root, elbow, r * bulk, r * 0.86 * bulk, sleeve === "long" ? cloth : skin, ARM_SIDES, { blunt: 0.2 });
    }
  });
  soup.rigged(rigLower, () => {
    capsule(soup, elbow, wrist, r * 0.86 * bulk, r * 0.62 * (sleeve === "long" ? bulk : 1), sleeve === "long" ? cloth : skin, ARM_SIDES);
    hand(soup, limb, body, skin);
  });
}

function leg(soup: Soup, limb: Limb, body: Body, lower: Lower, skin: Part, cloth: Part, shoes: Part, rigUpper: Rig, rigLower: Rig) {
  const [knee, ankle] = [limb.joint, limb.end];
  const { thighR, calfR } = body;
  const dressed = lower === "trousers";
  soup.rigged(rigUpper, () => {
    if (lower === "shorts") {
      const hem = lerp(limb.root, knee, 0.52);
      length(soup, limb.root, hem, thighR * 0.92, thighR * 1.0, cloth, LEG_SIDES);
      capsule(soup, hem, knee, thighR * 0.86, calfR * 1.08, skin, LEG_SIDES, { closed: false });
    } else {
      capsule(soup, limb.root, knee, thighR * 0.92, calfR * 1.08, dressed ? cloth : skin, LEG_SIDES, { closed: false });
    }
  });
  soup.rigged(rigLower, () => {
    const part = dressed ? cloth : skin;
    const frame = frameAlong(knee, ankle);
    const ring = (at: V3, radius: number): Ring => ({ at, u: add([0, 0, 0], frame.x, radius), v: add([0, 0, 0], frame.z, radius) });
    soup.tip(ring(knee, calfR * 1.05), add(knee, frame.y, -calfR * 0.8), part, LEG_SIDES);
    soup.loft([ring(knee, calfR * 1.05), ring(lerp(knee, ankle, 0.36), calfR * 1.12), ring(ankle, calfR * (dressed ? 1 : 0.7))], part, { sides: LEG_SIDES, capEnd: true });
    foot(soup, limb, body, shoes);
  });
}

/** The trunk: hips to the neck's root, with the waist between. */
function torso(soup: Soup, pose: Posed, body: Body, lowerPart: Part, topPart: Part, jacket: boolean, yoke: Part, rig: Rig) {
  const { pelvis, chest } = pose;
  const chestUp = body.shoulderUp - body.waistUp;
  const swell = jacket ? 1.06 : 1;
  const hem = jacket ? ringIn(pelvis, -0.06 * body.scale, body.hipX * 1.05, body.hipZ * 1.08, -0.01) : ringIn(pelvis, -0.01, body.hipX, body.hipZ, -0.012);
  soup.loft([ringIn(pelvis, -0.085 * body.scale, body.hipX * 0.58, body.hipZ * 0.72), hem, ringIn(pelvis, body.waistUp + 0.02, body.waistX * swell, body.waistZ * swell)], [lowerPart, jacket ? topPart : lowerPart], { sides: TORSO_SIDES, capStart: true });
  soup.rigged(rig, () => {
    const breast = ringIn(chest, chestUp * 0.5, body.chestX * swell, body.chestZ * swell, 0.012);
    const shoulders = [ringIn(chest, chestUp * 0.88, body.shoulderX * swell, body.shoulderZ * swell, 0.004), ringIn(chest, chestUp * 1.05, body.shoulderX * 0.42, body.shoulderZ * 0.66, -0.004)];
    const waist = ringIn(chest, -0.03, body.waistX * swell, body.waistZ * swell);
    const sides = { sides: TORSO_SIDES, capEnd: true };
    if (yoke === topPart) soup.loft([waist, breast, ...shoulders], topPart, sides);
    else soup.loft([waist, breast, ringIn(chest, chestUp * 0.72, body.chestX * 1.04 * swell, body.chestZ * swell, 0.01), ...shoulders], [topPart, topPart, yoke, yoke], sides);
  });
}

/** A skirt runs from the waist along the thighs, standing or sitting, so it needs no second shape for a seat. */
function skirt(soup: Soup, { pelvis, legLeft, legRight }: Posed, body: Body, part: Part, length: number) {
  const hips = lerp(legLeft.root, legRight.root, 0.5);
  const knees = lerp(legLeft.joint, legRight.joint, 0.5);
  const hem = lerp(hips, knees, length);
  const axis = unit(sub(knees, hips));
  const hanging = axis[1] * axis[1];
  const apart = lengthOf(sub(legLeft.joint, legRight.joint)) / 2;
  const across = frameAlong(hips, knees);
  const side = pelvis.x;
  const depth = unit(cross(across.y, side));
  const hemWide = Math.max(body.hipX * 1.18, apart + body.thighR * 1.1);
  const hemDeep = body.thighR * 1.5 + (body.hipZ * 1.75 - body.thighR * 1.5) * hanging;
  const rings: Ring[] = [
    ringIn(pelvis, body.waistUp + 0.02, body.waistX * 1.02, body.waistZ * 1.02),
    ringIn(pelvis, -0.012, body.hipX * 1.05, body.hipZ * 1.08, -0.01),
    { at: hem, u: add([0, 0, 0], side, hemWide), v: add([0, 0, 0], depth, hemDeep), shade: 0.92 },
  ];
  soup.loft(rings, part, { sides: TORSO_SIDES });
}

function head(soup: Soup, frame: Frame, body: Body, skin: Part) {
  const s = body.headScale;
  soup.loft([ringIn(frame, 0.004 * s, 0.034 * s, 0.038 * s, 0.022 * s), ringIn(frame, 0.04 * s, 0.056 * s, 0.069 * s, 0.018 * s), ringIn(frame, 0.095 * s, 0.075 * s, 0.092 * s, 0.006 * s), ringIn(frame, 0.155 * s, 0.079 * s, 0.098 * s), ringIn(frame, 0.2 * s, 0.058 * s, 0.072 * s, -0.004 * s)], skin, { sides: HEAD_SIDES, turn: 0, capStart: true });
  soup.tip(ringIn(frame, 0.2 * s, 0.058 * s, 0.072 * s, -0.004 * s), inFrame(frame, 0, 0.222 * s, -0.004 * s), skin, HEAD_SIDES, 0);
}

/*
 * Hair is a shell pushed back from the skull, so its front falls inside the face and
 * the hairline is simply where the two meet. Each style is the rings of that shell.
 */
function hair(soup: Soup, frame: Frame, body: Body, { hair: style, hat: kind }: FigureSpec, part: Part) {
  const s = body.headScale;
  const covered = kind !== "none";
  type Band = readonly [number, number, number, number];
  const rings = (list: readonly Band[]) => list.map(([y, x, z, back]) => ringIn(frame, y * s, x * s, z * s, back * s));
  const shell = (list: readonly Band[]) => {
    // Under a hat only what shows below its band is drawn, or the crown of the hair comes through it.
    const shown = rings(covered ? list.filter(([y]) => y < HAT_LINE) : list.slice(0, -1));
    soup.loft(shown, part, { sides: 6, turn: 0, capStart: true, capEnd: covered });
    if (!covered) soup.tip(shown[shown.length - 1], inFrame(frame, 0, 0.244 * s, -0.012 * s), part, 6, 0);
  };
  const cap: readonly [number, number, number, number][] = [[0.065, 0.058, 0.066, -0.046], [0.125, 0.083, 0.094, -0.026], [0.19, 0.082, 0.096, -0.012], [0.236, 0.056, 0.066, -0.012]];
  switch (style) {
    case "receding":
      shell([[0.07, 0.06, 0.066, -0.036], [0.125, 0.081, 0.092, -0.016], [0.17, 0.079, 0.088, -0.022], [0.19, 0.04, 0.05, -0.05]]);
      break;
    case "short":
      shell(cap);
      break;
    case "bob":
      shell([[0.002, 0.082, 0.07, -0.034], [0.08, 0.095, 0.102, -0.028], [0.19, 0.084, 0.098, -0.012], [0.236, 0.056, 0.066, -0.012]]);
      break;
    case "long":
      shell([[-0.2, 0.07, 0.035, -0.09], [-0.03, 0.098, 0.062, -0.066], [0.1, 0.094, 0.1, -0.03], [0.19, 0.084, 0.098, -0.012], [0.236, 0.056, 0.066, -0.012]]);
      break;
    case "ponytail":
      shell(cap);
      capsule(soup, inFrame(frame, 0, 0.15 * s, -0.11 * s), inFrame(frame, 0, -0.03 * s, -0.135 * s), 0.03 * s, 0.018 * s, part, 4);
      break;
    case "bun":
      shell(cap);
      if (!covered) capsule(soup, inFrame(frame, 0, 0.205 * s, -0.075 * s), inFrame(frame, 0, 0.235 * s, -0.092 * s), 0.036 * s, 0.03 * s, part, 5);
      break;
  }
}

const HAT_LINE = 0.16;

function hat(soup: Soup, frame: Frame, body: Body, { hat: kind, colours }: FigureSpec) {
  const s = body.headScale;
  const brimAt = 0.168 * s;
  if (kind === "cap") {
    soup.loft([ringIn(frame, 0.16 * s, 0.086 * s, 0.102 * s, -0.004 * s), ringIn(frame, 0.205 * s, 0.078 * s, 0.092 * s, -0.006 * s), ringIn(frame, 0.24 * s, 0.03 * s, 0.036 * s, -0.008 * s)], colours.hat, { sides: 7, turn: 0, capEnd: true });
    const [left, right, tipL, tipR] = [inFrame(frame, 0.07 * s, brimAt, 0.075 * s), inFrame(frame, -0.07 * s, brimAt, 0.075 * s), inFrame(frame, 0.052 * s, brimAt - 0.022 * s, 0.17 * s), inFrame(frame, -0.052 * s, brimAt - 0.022 * s, 0.17 * s)];
    soup.quad(left, right, tipR, tipL, colours.hat, 0.9);
  } else if (kind === "sun-hat") {
    soup.loft([ringIn(frame, brimAt - 0.014 * s, 0.195 * s, 0.205 * s, -0.004 * s), ringIn(frame, brimAt, 0.098 * s, 0.112 * s, -0.004 * s), ringIn(frame, 0.215 * s, 0.09 * s, 0.1 * s, -0.006 * s), ringIn(frame, 0.255 * s, 0.05 * s, 0.056 * s, -0.008 * s)], ["straw", colours.hat, "straw"], { sides: 7, turn: 0, capEnd: true });
  } else if (kind === "helmet") {
    soup.loft([ringIn(frame, 0.135 * s, 0.09 * s, 0.112 * s, -0.008 * s), ringIn(frame, 0.2 * s, 0.09 * s, 0.116 * s, -0.012 * s), ringIn(frame, 0.25 * s, 0.05 * s, 0.078 * s, -0.016 * s)], colours.hat, { sides: 7, turn: 0, capEnd: true });
  }
}

function prop(soup: Soup, { kind, from, to, lineTo }: Prop) {
  const way = unit(sub(to, from));
  const frame = frameAlong(from, to);
  switch (kind) {
    case "rod":
      length(soup, from, lerp(from, to, 0.34), 0.014, 0.009, "prop-rod", 3);
      soup.loft([{ at: lerp(from, to, 0.3), u: add([0, 0, 0], frame.x, 0.009), v: add([0, 0, 0], frame.z, 0.009) }, { at: to, u: add([0, 0, 0], frame.x, 0.0035), v: add([0, 0, 0], frame.z, 0.0035) }], "prop-rod", { sides: 3 });
      if (lineTo !== undefined) {
        const line = frameAlong(to, lineTo);
        soup.loft([{ at: to, u: add([0, 0, 0], line.x, 0.005), v: add([0, 0, 0], line.z, 0.005) }, { at: lineTo, u: add([0, 0, 0], line.x, 0.005), v: add([0, 0, 0], line.z, 0.005) }], "prop-line", { sides: 3 });
      }
      break;
    case "cup": {
      const radius = 0.04;
      soup.loft([{ at: from, u: [radius * 0.78, 0, 0], v: [0, 0, radius * 0.78] }, { at: to, u: [radius, 0, 0], v: [0, 0, radius] }], "cloth-white", { sides: 5, capStart: true, capEnd: true });
      break;
    }
    case "hoe": {
      length(soup, from, to, 0.016, 0.016, "prop-wood", 4);
      const back = add(from, way, 0.03);
      soup.quad(add(back, [0.075, 0.09, 0.03]), add(back, [-0.075, 0.09, 0.03]), add(back, [-0.08, -0.03, 0.09]), add(back, [0.08, -0.03, 0.09]), "prop-steel");
      break;
    }
    case "sponge":
      soup.loft([{ at: from, u: [0.05, 0, 0], v: [0, 0.035, 0] }, { at: to, u: [0.05, 0, 0], v: [0, 0.035, 0] }], "cloth-mustard", { sides: 4, capStart: true, capEnd: true });
      break;
  }
}

function rigOf(pose: Posed, piece: Piece): Rig {
  const rock = pose.rocks[piece];
  if (rock === undefined) return STILL;
  return { ...STILL, drive: `rock-${rock.axis}`, inner: rock.pivot, degrees: rock.degrees, rate: rock.rate, gated: !rock.steady };
}

/** Each limb's rig: in a walk its hip and knee, or shoulder and elbow; otherwise any rock the pose gives it. */
function limbRigs(pose: Posed) {
  const walking = (drive: Drive, { root, joint }: Limb, lower: boolean): Rig => ({ ...STILL, drive, inner: root, outer: joint, lower });
  if (pose.walks) {
    return {
      armLeft: [walking("arm-left", pose.armLeft, false), walking("arm-left", pose.armLeft, true)],
      armRight: [walking("arm-right", pose.armRight, false), walking("arm-right", pose.armRight, true)],
      legLeft: [walking("leg-left", pose.legLeft, false), walking("leg-left", pose.legLeft, true)],
      legRight: [walking("leg-right", pose.legRight, false), walking("leg-right", pose.legRight, true)],
    };
  }
  return {
    armLeft: [rigOf(pose, "armLeft"), rigOf(pose, "forearmLeft")],
    armRight: [rigOf(pose, "armRight"), rigOf(pose, "forearmRight")],
    legLeft: [STILL, rigOf(pose, "shinLeft")],
    legRight: [STILL, rigOf(pose, "shinRight")],
  };
}

function cutOf(spec: FigureSpec) {
  const cut = CUT[spec.outfit];
  const { top, accent, bottom, shoes } = spec.colours;
  const isOveralls = spec.outfit === "overalls";
  return { ...cut, skin: spec.skin, sleeveCloth: isOveralls ? accent : top, chestCloth: isOveralls ? accent : top, hipCloth: cut.lower === "skirt" && spec.outfit === "summer-dress" ? top : bottom, bottom, shoes, top, accent };
}

export function buildNear(spec: FigureSpec, name: PoseName): Soup {
  const body = measure(spec);
  const pose = posed(name, body);
  const soup = new Soup();
  const cut = cutOf(spec);
  const rigs = limbRigs(pose);
  const chestRig = rigOf(pose, "chest");
  const bulk = cut.jacket === true ? 1.2 : 1.06;

  torso(soup, pose, body, cut.hipCloth, cut.chestCloth, cut.jacket === true, spec.outfit === "sailing-jacket" ? cut.accent : cut.chestCloth, chestRig);
  if (cut.lower === "skirt") skirt(soup, pose, body, cut.bottom, spec.outfit === "summer-dress" ? 1.02 : 0.9);

  const chestUp = body.shoulderUp - body.waistUp;
  soup.rigged(chestRig, () => {
    capsule(soup, inFrame(pose.chest, 0, chestUp * 0.92, 0), pose.head.at, 0.055 * body.scale, 0.05 * body.scale, spec.skin, 4, { closed: false });
    if (cut.collar === true) capsule(soup, inFrame(pose.chest, 0, chestUp * 0.96, 0), lerp(inFrame(pose.chest, 0, chestUp * 0.96, 0), pose.head.at, 0.72), 0.078 * body.scale, 0.074 * body.scale, cut.accent, 5, { closed: false });
    if (spec.outfit === "cyclist") {
      soup.loft([ringIn(pose.chest, chestUp * 0.34, body.chestX * 0.98, body.chestZ * 1.0, 0.008), ringIn(pose.chest, chestUp * 0.56, body.chestX * 1.02, body.chestZ * 1.02, 0.012)], cut.accent, { sides: TORSO_SIDES });
    }
    if (spec.outfit === "overalls") bib(soup, pose, body, cut.top);
  });

  arm(soup, pose.armLeft, body, cut.sleeve, cut.skin, cut.sleeveCloth, bulk, rigs.armLeft[0], rigs.armLeft[1]);
  arm(soup, pose.armRight, body, cut.sleeve, cut.skin, cut.sleeveCloth, bulk, rigs.armRight[0], rigs.armRight[1]);
  leg(soup, pose.legLeft, body, cut.lower, cut.skin, cut.bottom, cut.shoes, rigs.legLeft[0], rigs.legLeft[1]);
  leg(soup, pose.legRight, body, cut.lower, cut.skin, cut.bottom, cut.shoes, rigs.legRight[0], rigs.legRight[1]);

  soup.rigged(rigOf(pose, "head"), () => {
    head(soup, pose.head, body, spec.skin);
    hair(soup, pose.head, body, spec, spec.hairColour);
    hat(soup, pose.head, body, spec);
  });

  if (pose.prop !== undefined) {
    const held = pose.prop.heldBy === undefined ? rigOf(pose, "prop") : rigOf(pose, pose.prop.heldBy);
    const { prop: item } = pose;
    soup.rigged(held, () => prop(soup, item));
  }
  return soup;
}

/** The bib of a pair of overalls, front and straps, lying on the chest. */
function bib(soup: Soup, { chest }: Posed, body: Body, part: Part) {
  const up = body.shoulderUp - body.waistUp;
  const [front, wide] = [body.chestZ * 1.09, body.chestX * 0.62];
  const low = inFrame(chest, wide, up * 0.1, front * 0.98);
  const lowR = inFrame(chest, -wide, up * 0.1, front * 0.98);
  const high = inFrame(chest, wide * 0.9, up * 0.66, front * 1.09);
  const highR = inFrame(chest, -wide * 0.9, up * 0.66, front * 1.09);
  soup.quad(low, lowR, highR, high, part);
  for (const side of [-1, 1]) {
    const inner = side * wide * 0.7;
    const outer = side * wide * 0.92;
    const shoulder = side * body.shoulderX * 0.72;
    soup.quad(inFrame(chest, inner, up * 0.66, front * 1.09), inFrame(chest, outer, up * 0.66, front * 1.09), inFrame(chest, shoulder + side * 0.03, up * 0.98, 0.02), inFrame(chest, shoulder, up * 0.98, 0.02), part);
    soup.quad(inFrame(chest, shoulder + side * 0.03, up * 0.98, 0.02), inFrame(chest, shoulder, up * 0.98, 0.02), inFrame(chest, inner, up * 0.5, -body.chestZ * 1.04), inFrame(chest, outer, up * 0.5, -body.chestZ * 1.04), part);
  }
}

const FAR_SIDES = 3;

function farLimb(soup: Soup, limb: Limb, radius: number, tipR: number, part: Part, tipPart: Part, upper: Rig, lower: Rig, reachPast: number, ends?: number) {
  const frame = frameAlong(limb.root, limb.joint);
  const lean = frameAlong(limb.joint, limb.end);
  const ring = (at: V3, f: Frame, r: number): Ring => ({ at, u: add([0, 0, 0], f.x, r), v: add([0, 0, 0], f.z, r) });
  soup.rigged(upper, () => soup.loft([ring(limb.root, frame, radius), ring(limb.joint, frame, tipR)], part, { sides: FAR_SIDES }));
  soup.rigged(lower, () => {
    if (ends === undefined) soup.tip(ring(limb.joint, lean, tipR), lerp(limb.joint, limb.end, reachPast), tipPart, FAR_SIDES);
    else soup.loft([ring(limb.joint, lean, tipR), ring(lerp(limb.joint, limb.end, reachPast), lean, ends)], tipPart, { sides: FAR_SIDES });
  });
}

export function buildFar(spec: FigureSpec, name: PoseName): Soup {
  const body = measure(spec);
  const pose = posed(name, body);
  const soup = new Soup();
  const cut = cutOf(spec);
  const rigs = limbRigs(pose);
  const chestRig = rigOf(pose, "chest");
  const { chest, pelvis, head: top } = pose;
  const chestUp = body.shoulderUp - body.waistUp;
  const limbPart = cut.sleeve === "none" ? spec.skin : cut.sleeveCloth;
  const widen = 1.18;

  soup.rigged(chestRig, () => {
    soup.loft([ringIn(pelvis, -0.04, body.hipX * widen, body.hipZ * widen), ringIn(chest, chestUp * 0.95, body.shoulderX * widen, body.chestZ * widen)], cut.chestCloth, { sides: 4 });
  });
  if (cut.lower === "skirt") {
    const hem = lerp(lerp(pose.legLeft.root, pose.legRight.root, 0.5), lerp(pose.legLeft.joint, pose.legRight.joint, 0.5), 1);
    soup.loft([{ at: inFrame(pelvis, 0, body.waistUp, 0), u: [body.waistX, 0, 0], v: [0, 0, body.waistZ] }, { at: hem, u: [body.hipX * 1.4, 0, 0], v: [0, 0, body.hipZ * 1.7] }], cut.bottom, { sides: FAR_SIDES });
  }
  farLimb(soup, pose.armLeft, body.armR * 1.5, body.armR * 1.2, limbPart, spec.skin, rigs.armLeft[0], rigs.armLeft[1], 1.3);
  farLimb(soup, pose.armRight, body.armR * 1.5, body.armR * 1.2, limbPart, spec.skin, rigs.armRight[0], rigs.armRight[1], 1.3);
  const legPart = cut.lower === "trousers" ? cut.bottom : cut.lower === "shorts" ? cut.bottom : spec.skin;
  const shinPart = cut.lower === "trousers" ? cut.bottom : spec.skin;
  farLimb(soup, pose.legLeft, body.thighR * 1.25, body.calfR * 1.5, legPart, shinPart, rigs.legLeft[0], rigs.legLeft[1], 1.08, body.calfR);
  farLimb(soup, pose.legRight, body.thighR * 1.25, body.calfR * 1.5, legPart, shinPart, rigs.legRight[0], rigs.legRight[1], 1.08, body.calfR);

  soup.rigged(rigOf(pose, "head"), () => {
    const s = body.headScale;
    const crown: Part = spec.hat === "none" ? spec.hairColour : spec.hat === "sun-hat" ? "straw" : spec.colours.hat;
    const wide = spec.hat === "sun-hat" ? 0.17 : 0.095;
    const middle = ringIn(top, (spec.hat === "sun-hat" ? 0.17 : 0.14) * s, wide * s, wide * s, -0.008 * s);
    soup.tip(middle, top.at, spec.skin, FAR_SIDES);
    soup.tip(middle, inFrame(top, 0, 0.225 * s, -0.01 * s), crown, FAR_SIDES);
  });
  return soup;
}
