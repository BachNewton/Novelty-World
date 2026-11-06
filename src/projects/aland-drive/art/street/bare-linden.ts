import { DoubleSide, MeshBasicNodeMaterial, type Node } from "three/webgpu";
import { abs, attribute, cameraPosition, cos, dot, float, mix, normalize, positionWorld, sin, smoothstep, step, varying, vec3 } from "three/tsl";
import { BareWood, bareVertex, CLUMP_REACH_SHARE, rolled } from "../bare-wood";
import { outsideCar } from "../car-volume";
import { flatNormal } from "../flat-normal";
import { FRESH_SHARE, HAZE_EDGE, hazeByDistance, snowHeldOf, snowOnFace } from "../leaves";
import { facetLight, footShade, rollOf, screenPattern, type RoadsideMaterials, type RoadsideModel } from "../roadside/index";
import { seasonNodes, type SeasonLook } from "../season";
import { LINDEN_CROWN_MIDDLE, lindenCrownReach, lindenLeaves } from "./linden";
import type { StreetInputs } from "./material";

/*
 * A street linden without its leaves, one unit tall, scaled by the tree's height as the leafy one is: the clear trunk
 * the leafy model already stands on, then a broad oval dome of limbs arching up and out from the head of the trunk,
 * each set with thin straight shoots, as Nordic towns keep their lindens crown-lifted and cut back. Clumps of leaves sit
 * at the shoots' ends while it has any (`art/leaves.ts`), all inside the leafy crown's outline. Far off, where its
 * shoots and limbs are under a pixel, a see-through haze of its twigs fills that outline instead (`buildLindenHaze`).
 *
 * It is one model at every linden, whichever seed's crown it had, turned by the place's yaw; its own material folds
 * a tree in full leaf away, and the game only fills its lists while the season has any linden short of leaves.
 */

const LIMBS = 9;
const SHOOTS_A_LIMB = 7;
const LIMB_FROM: [number, number] = [0.3, 0.42];
const LIMB_RADIUS: [number, number] = [0.0085, 0.005];
const SHOOT_RADIUS = 0.0028;
const LEADER: [from: number, to: number, radius: number] = [0.38, 0.92, 0.009];
/** A clump's half width and half height, in shares of the tree's height, and how much each varies. */
const CLUMP: [number, number] = [0.05, 0.035];
const CLUMP_SIZES: [number, number] = [0.75, 1.3];
/** Its branches end a little inside the leafy crown's outline, and its clumps inside it. */
const BRANCH_REACH = 0.9;
/** Where its branches give way to its twigs' haze, dissolving over the last share of this. */
const BARE_REACH_M = 220;

type V3 = readonly [number, number, number];

const atReach = (angle: number, share: number, height: number): V3 => {
  const reach = lindenCrownReach(height) * share;
  return [Math.sin(angle) * reach, height, Math.cos(angle) * reach];
};

/** A bare linden's wood, and the clumps of leaves on it, as two models: the clumps are only drawn while some linden is part way through its leaves. */
export function buildBareLinden(): { wood: RoadsideModel; clumps: RoadsideModel } {
  const wood = new BareWood();
  const clumps = new BareWood();
  wood.branch([[0, LEADER[0], 0], [0, (LEADER[0] + LEADER[1]) / 2, 0], [0, LEADER[1], 0]], [LEADER[2], LEADER[2] * 0.5, 0], 4, [0.1, 0.8]);
  const goldenTurn = Math.PI * (3 - Math.sqrt(5));
  const ends: V3[] = [];
  for (let limb = 0; limb < LIMBS; limb++) {
    const share = limb / (LIMBS - 1);
    const from = LIMB_FROM[0] + (LIMB_FROM[1] - LIMB_FROM[0]) * share;
    const angle = limb * goldenTurn + (rolled(limb, 1) - 0.5) * 0.5;
    const start: V3 = [0, from, 0];
    const elbow = atReach(angle, 0.55, from + 0.16);
    const tip = atReach(angle, BRANCH_REACH, Math.min(from + 0.4 + share * 0.1, 0.9));
    wood.branch([start, elbow, tip], [LIMB_RADIUS[0], LIMB_RADIUS[1], 0], 3, [0.2, 0.7]);
    ends.push(tip);
    for (let shoot = 0; shoot < SHOOTS_A_LIMB; shoot++) {
      const along = 0.3 + (shoot / SHOOTS_A_LIMB) * 0.68;
      const base: V3 = along < 0.5 ? lerp(start, elbow, along * 2) : lerp(elbow, tip, (along - 0.5) * 2);
      // Shoots grow straight up from the limb, leaning a little out its own way.
      const turn = angle + (shoot % 2 === 0 ? 1 : -1) * (0.35 + rolled(limb * 7 + shoot, 2) * 0.4);
      const height = Math.min(base[1] + 0.12 + rolled(limb * 7 + shoot, 3) * 0.1, 0.95);
      const end = atReach(turn, BRANCH_REACH * (0.75 + rolled(limb * 7 + shoot, 4) * 0.25), height);
      wood.branch([base, end], [SHOOT_RADIUS, 0], 3, [0.6, 1]);
      // Clumps on every other shoot, and on each limb's tip: enough to fill the crown without a clump to every twig.
      if (shoot % 2 === 0) ends.push(end);
    }
  }
  ends.forEach((end, clump) => {
    const size = CLUMP_SIZES[0] + (CLUMP_SIZES[1] - CLUMP_SIZES[0]) * rolled(clump, 5);
    const [wide, high] = [CLUMP[0] * size, CLUMP[1] * size];
    const out = Math.hypot(end[0], end[2]);
    const room = Math.max(0, lindenCrownReach(end[1]) - wide * CLUMP_REACH_SHARE);
    const pulled = Math.min(out, room) / Math.max(out, 1e-6);
    clumps.clump([end[0] * pulled, Math.min(end[1], 0.97 - high * CLUMP_REACH_SHARE), end[2] * pulled], wide, high, (clump * 0.6180339887) % 1);
  });
  const model = (built: BareWood): RoadsideModel => ({ near: built.geometry(), far: null, swapM: BARE_REACH_M, reachM: BARE_REACH_M });
  return { wood: model(wood), clumps: model(clumps) };
}

const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** The share of its reach over which a bare linden's branches dissolve into its haze. */
const LEAVE_SHARE = 0.25;
/** How much snow lies on a bare linden's upward faces, against a conifer's. */
const BRANCH_SNOW = 0.8;
/**
 * How dense a linden's twigs' haze is against a forest tree's, and how bright: one stands alone against the sky, where
 * the forest's denser, darker haze read as a dark ball, so it is fainter and lighter, a lace over what's behind it.
 */
const TWIG_DENSITY = 0.4;
const TWIG_LIGHT = 1;

/** Where a placed linden's vertex goes, its share of leaves and how far it is: the roadside kit's place, fit and reach. */
function placedLinden(season: SeasonLook | undefined) {
  const place = attribute<"vec4">("place", "vec4");
  const fit = attribute<"vec4">("fit", "vec4");
  const reach = attribute<"vec2">("reach", "vec2");
  const distance = place.xz.sub(cameraPosition.xz).length();
  const roll = rollOf(place.xz);
  const leaves = lindenLeaves(seasonNodes(season), place.xz);
  const [yawCos, yawSin] = [cos(place.w), sin(place.w)];
  const toWorld = (local: Node<"vec3">, size: Node<"float">) => vec3(place.x.add(local.x.mul(yawCos).add(local.z.mul(yawSin)).mul(size)), place.y.add(local.y.mul(size)), place.z.add(local.z.mul(yawCos).sub(local.x.mul(yawSin)).mul(size)));
  return { place, fit, reach, distance, roll, leaves, toWorld };
}

/** The bare linden's material: its branches and clumps, folded away for a tree in full leaf and past its reach. */
export function bareLindenMaterials(inputs: StreetInputs): RoadsideMaterials {
  const { fit, reach, distance, roll, leaves, toWorld } = placedLinden(inputs.season);
  const share = leaves.inLeaf;
  const bare = bareVertex(attribute<"vec3">("position", "vec3"), attribute<"vec4">("bare", "vec4"), share, roll);
  const shown = float(1).sub(step(float(1), share)).mul(step(distance, reach.y));
  const material = new MeshBasicNodeMaterial();
  material.positionNode = toWorld(bare.position, fit.x.mul(shown));

  const isClump = varying(bare.isClump);
  const thin = varying(bare.thin);
  const token = (name: string) => vec3(inputs.linear(name));
  const leaf = varying(mix(mix(token("tree-birch").mul(1.1), token("tree-fresh"), leaves.fresh.mul(FRESH_SHARE)), token("autumn-linden"), leaves.turned));
  const barkColour = mix(mix(token("tree-bark"), token("wall-plinth"), 0.3).mul(1.05), token("tree-twig"), smoothstep(float(0.4), float(1), thin));
  const snow = varying(snowHeldOf(seasonNodes(inputs.season), roll).mul(BRANCH_SNOW)).mul(snowOnFace(flatNormal().y)).mul(float(1).sub(isClump));
  const natural = mix(mix(barkColour, leaf, isClump), token("tree-snow"), snow.clamp(0, 1));
  material.colorNode = inputs.hazed(natural.mul(facetLight(inputs.sun).lit).mul(footShade(bare.position.y.mul(fit.x))));
  const pattern = screenPattern();
  material.maskNode = pattern.greaterThanEqual(smoothstep(reach.y.mul(1 - LEAVE_SHARE), reach.y, distance)).and(outsideCar());
  material.side = DoubleSide;
  return { near: material, far: material };
}

/** The twigs' haze over a bare linden's crown: blended, never a screen pattern, none near and denser far off where its branches are under a pixel. */
export function lindenHazeMaterials(inputs: StreetInputs): RoadsideMaterials {
  const { fit, distance, leaves, toWorld } = placedLinden(inputs.season);
  const local = attribute<"vec3">("position", "vec3");
  const bareness = float(1).sub(leaves.inLeaf);
  const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  material.positionNode = toWorld(local, fit.x.mul(step(float(1e-4), bareness)));
  // Out from the crown's middle, for how thick the haze is seen through.
  const rounded = varying(toWorld(local, fit.x).sub(toWorld(vec3(0, LINDEN_CROWN_MIDDLE, 0), fit.x)));
  const fromCamera = positionWorld.sub(cameraPosition);
  const thickness = smoothstep(float(0), float(HAZE_EDGE), abs(dot(normalize(rounded), normalize(fromCamera))));
  material.colorNode = inputs.hazed(vec3(inputs.linear("tree-twig")).mul(facetLight(inputs.sun).lit.mul(TWIG_LIGHT)));
  material.opacityNode = varying(bareness).mul(hazeByDistance(distance)).mul(thickness).mul(TWIG_DENSITY);
  material.maskNode = outsideCar();
  material.side = DoubleSide;
  return { near: material, far: material };
}
