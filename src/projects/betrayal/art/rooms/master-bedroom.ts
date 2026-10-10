import * as THREE from "three";
import { candle, chair, chamberstick, pictureFrame, rug, table } from "../kit";
import { RAMPS, type PaletteKey } from "../palette";
import { CUT_HEIGHT, INNER, onWall, type RoomDefinition } from "../room";
import { batch, box, flat, group, lathe, textured } from "../shapes";
import { panelling, wallpaper, woodPlanks } from "../textures";

/** The bed's footprint in its own frame: across x, and from the wall (z = 0) out to its foot. */
const BED = { width: 1.6, length: 2.15, posts: 2.2, mattress: 0.66 };
const POST_X = BED.width / 2 - 0.02;
const HEAD_Z = 0.08;
const FOOT_Z = BED.length - 0.08;

/** One turned bedpost, standing on the floor at the origin. */
function bedpost(material: THREE.Material, height: number): THREE.Group {
  return group(
    box([0.12, 0.5, 0.12], material, [0, 0, 0]),
    lathe(
      [
        [0.055, 0.5],
        [0.035, 0.6],
        [0.045, 0.75],
        [0.03, 0.9],
        [0.03, height - 0.25],
        [0.045, height - 0.18],
        [0.03, height - 0.1],
        [0.04, height],
        [0, height + 0.02],
      ],
      material,
      6,
    ),
  );
}

/** A curtain gathered and tied back against a post: a few deep folds, pale linen. */
function gatheredCurtain(b: ReturnType<typeof batch>, x: number, z: number, top: number) {
  const folds: [dx: number, dz: number, colour: PaletteKey][] = [
    [-0.06, 0, "boneDark"],
    [0, 0.03, "bone"],
    [0.06, -0.01, "boneDark"],
  ];
  // The middle fold stops a little lower than the two it overlaps, so their tops never share a plane.
  for (const [dx, dz, colour] of folds) {
    b.block([0.07, top - 1.25 - (dx === 0 ? 0.003 : 0), 0.11], colour, [x + dx, 1.25, z + dz]);
    b.block([0.06, 1.1, 0.1], colour, [x + dx * 0.6, 0.12, z + dz]);
  }
  b.block([0.22, 0.07, 0.15], "bloodDark", [x, 1.18, z + 0.01]);
}

/**
 * The great four-poster, its head at z = 0 against the wall and its foot
 * towards +z: tall turned posts, an open tester hung with a pale valance,
 * curtains tied back at each post. It is turned down and made for someone,
 * and under the coverlet lies a long shape with nothing on the pillow.
 */
function fourPosterBed(): THREE.Group {
  const dark = flat("woodDark");
  const mid = flat("wood");
  const result = group();
  for (const x of [-POST_X, POST_X]) {
    for (const z of [HEAD_Z, FOOT_Z]) {
      const post = bedpost(dark, BED.posts);
      post.position.set(x, 0, z);
      result.add(post);
    }
  }
  const span = POST_X * 2 - 0.1;
  result.add(
    // The headboard stops under its top rail, so their ends never share a plane.
    box([span, 1.13, 0.06], dark, [0, 0.2, HEAD_Z]),
    box([span - 0.3, 0.55, 0.03], mid, [0, 0.72, HEAD_Z + 0.04]),
    box([span, 0.12, 0.1], dark, [0, 1.33, HEAD_Z]),
    box([span, 0.55, 0.06], dark, [0, 0.2, FOOT_Z]),
    box([span, 0.07, 0.09], mid, [0, 0.75, FOOT_Z]),
    box([0.06, 0.22, FOOT_Z - HEAD_Z], dark, [-POST_X + 0.02, 0.22, BED.length / 2]),
    box([0.06, 0.22, FOOT_Z - HEAD_Z], dark, [POST_X - 0.02, 0.22, BED.length / 2]),
  );

  const linen = flat("bone");
  const pale = flat("boneLight");
  const cover = flat("boneDark");
  const inside = FOOT_Z - HEAD_Z - 0.08;
  result.add(box([span - 0.04, 0.24, inside], linen, [0, 0.4, BED.length / 2]));
  const coverFrom = 0.68;
  const coverTo = FOOT_Z - 0.05;
  const coverMid = (coverFrom + coverTo) / 2;
  const coverLen = coverTo - coverFrom;
  result.add(
    box([span + 0.02, 0.04, coverLen], cover, [0, BED.mattress - 0.02, coverMid]),
    box([0.03, 0.34, coverLen], cover, [-span / 2 - 0.01, 0.3, coverMid]),
    box([0.03, 0.34, coverLen], cover, [span / 2 + 0.01, 0.3, coverMid]),
    box([span + 0.04, 0.05, 0.28], linen, [0, BED.mattress - 0.01, coverFrom + 0.1]),
  );
  for (const [x, turn] of [[-0.36, 0.04], [0.36, -0.06]]) {
    const pillow = box([0.62, 0.15, 0.36], pale, [0, 0, 0]);
    pillow.position.set(x, BED.mattress - 0.04, 0.34);
    pillow.rotation.y = turn;
    result.add(pillow);
  }
  const shapeGeometry = new THREE.SphereGeometry(1, 6, 4);
  shapeGeometry.scale(0.22, 0.13, 0.6);
  const shape = new THREE.Mesh(shapeGeometry, cover);
  shape.position.set(0.18, BED.mattress, 1.35);
  shape.rotation.y = 0.08;
  result.add(shape);

  const hangings = batch();
  const top = BED.posts - 0.02;
  const rail = (size: [number, number, number], at: [number, number, number]) => hangings.block(size, "woodDark", at);
  rail([POST_X * 2 + 0.1, 0.07, 0.08], [0, top, HEAD_Z]);
  rail([POST_X * 2 + 0.1, 0.07, 0.08], [0, top, FOOT_Z]);
  // The side rails run between the head and foot rails, so no two rails share a top where they meet.
  rail([0.08, 0.07, FOOT_Z - HEAD_Z - 0.08], [-POST_X, top, BED.length / 2]);
  rail([0.08, 0.07, FOOT_Z - HEAD_Z - 0.08], [POST_X, top, BED.length / 2]);
  const valance = 0.3;
  const drop = top + 0.08 - valance;
  hangings.block([POST_X * 2 + 0.16, valance, 0.03], "bone", [0, drop, FOOT_Z + 0.06]);
  // The side valances stop at the back of the foot's, so their tops never overlap in one plane.
  hangings.block([0.03, valance, FOOT_Z - HEAD_Z + 0.095], "bone", [-POST_X - 0.06, drop, BED.length / 2 - 0.0025]);
  hangings.block([0.03, valance, FOOT_Z - HEAD_Z + 0.095], "bone", [POST_X + 0.06, drop, BED.length / 2 - 0.0025]);
  for (let i = 0; i < 9; i++) {
    const x = -POST_X + (i + 0.5) * ((POST_X * 2) / 9);
    hangings.block([0.06, 0.06, 0.035], "bloodDark", [x, drop - 0.05, FOOT_Z + 0.06]);
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      const z = HEAD_Z + (i + 0.5) * ((FOOT_Z - HEAD_Z) / 9);
      hangings.block([0.035, 0.06, 0.06], "bloodDark", [side * (POST_X + 0.06), drop - 0.05, z]);
    }
    gatheredCurtain(hangings, side * (POST_X + 0.13), FOOT_Z, drop + 0.02);
    gatheredCurtain(hangings, side * (POST_X + 0.13), HEAD_Z + 0.08, drop + 0.02);
  }
  result.add(hangings.mesh());
  return result;
}

/** The pleated cloth behind the bedhead, from the headboard up to the tester,
 *  hung on the wall so it hides when that wall is cut. Faces +z, back at z = 0. */
function testerBack(): THREE.Mesh {
  const b = batch();
  const height = BED.posts - 0.06 - 1.45;
  const pleats = 10;
  const width = POST_X * 2 - 0.1;
  for (let i = 0; i < pleats; i++) {
    const x = -width / 2 + (i + 0.5) * (width / pleats);
    // The shallow pleats stop a little lower than the deep ones they overlap, so their tops never share a plane.
    b.block([width / pleats + 0.005, i % 2 ? height - 0.005 : height, i % 2 ? 0.03 : 0.05], i % 2 ? "boneDark" : "bone", [x, 0, 0.03]);
  }
  return b.mesh();
}

/** A small bedside cupboard with a drawer. Faces +z, back at z = 0. */
function nightstand(): THREE.Group {
  const top = textured(woodPlanks({ plankPx: 5, size: 32, seed: "master-bedroom-stand" }));
  return group(
    box([0.44, 0.58, 0.38], flat("wood"), [0, 0.02, 0.21]),
    box([0.5, 0.04, 0.44], top, [0, 0.6, 0.22]),
    box([0.36, 0.14, 0.02], flat("woodMid"), [0, 0.4, 0.405]),
    box([0.36, 0.26, 0.02], flat("woodMid"), [0, 0.08, 0.405]),
    box([0.05, 0.03, 0.03], flat("brass"), [0, 0.45, 0.42]),
  );
}

/** A ewer standing in its basin, and a closed book beside them, on a nightstand top. */
function washstandThings(): THREE.Group {
  const china = flat("boneLight");
  const basin = lathe([[0.05, 0], [0.12, 0.05], [0.13, 0.07], [0.11, 0.07], [0.04, 0.02]], china, 8);
  const ewer = lathe([[0.04, 0.02], [0.065, 0.08], [0.06, 0.15], [0.035, 0.2], [0.045, 0.24], [0, 0.24]], flat("bone"), 8);
  const book = box([0.14, 0.04, 0.2], flat("blood"), [0, 0, 0]);
  book.position.set(0.1, 0, 0.24);
  book.rotation.y = 0.3;
  const result = group(basin, ewer, book);
  ewer.position.set(-0.03, 0, -0.02);
  basin.position.set(-0.03, 0, -0.02);
  return result;
}

/** A pair of slippers set side by side, waiting, toes towards +z. */
function slippers(): THREE.Group {
  const b = batch();
  for (const x of [-0.07, 0.07]) {
    b.block([0.1, 0.05, 0.26], "bruiseLight", [x, 0, 0]);
    b.block([0.08, 0.02, 0.12], "boneDark", [x, 0.04, -0.05]);
  }
  return group(b.mesh());
}

/** A long chest at the foot of the bed, with a nightgown laid out on its lid. Faces +z. */
function blanketChest(): THREE.Group {
  const body = textured(woodPlanks({ plankPx: 6, size: 32, seed: "master-bedroom-chest" }));
  const brass = flat("brass");
  return group(
    box([1.1, 0.42, 0.45], body, [0, 0.03, 0]),
    box([1.06, 0.03, 0.41], flat("woodDark"), [0, 0, 0]),
    box([1.14, 0.05, 0.49], flat("woodMid"), [0, 0.45, 0]),
    box([0.04, 0.44, 0.47], brass, [-0.36, 0.03, 0]),
    box([0.04, 0.44, 0.47], brass, [0.36, 0.03, 0]),
    box([0.08, 0.08, 0.02], brass, [0, 0.3, 0.235]),
    box([0.7, 0.03, 0.38], flat("boneLight"), [-0.05, 0.5, -0.02]),
    box([0.18, 0.025, 0.12], flat("bone"), [-0.25, 0.53, 0.06]),
  );
}

const WARDROBE = { width: 1.2, depth: 0.56, height: 2.3 };
/** How far under the cut height the wardrobe's base stops. */
const BELOW_CUT = 0.005;

/** The wardrobe's plinth and drawer, as tall as a cut-away wall. Faces +z, back at z = 0. */
function wardrobeBase(): THREE.Group {
  const { width, depth } = WARDROBE;
  return group(
    box([width, CUT_HEIGHT - 0.03 - BELOW_CUT, depth], flat("wood"), [0, 0, depth / 2]),
    box([width - 0.16, 0.2, 0.02], flat("woodLight"), [0, 0.12 - BELOW_CUT, depth + 0.01]),
    box([0.08, 0.03, 0.03], flat("brass"), [0, 0.22, depth + 0.02]),
    // Its top stops a little under the cut wall's, so the two never share a plane; the body above reaches down to it.
    box([width + 0.04, 0.03, depth + 0.03], flat("wood"), [0, CUT_HEIGHT - 0.03 - BELOW_CUT, depth / 2 + 0.015]),
  );
}

/** The wardrobe above its base, hung with the wall it stands against; one door stands ajar on the dark. */
function wardrobeBody(): THREE.Group {
  const { width, depth, height } = WARDROBE;
  const tall = height - CUT_HEIGHT;
  const doorWidth = width / 2 - 0.06;
  const door = flat("woodLight");
  const result = group(
    box([width, tall + BELOW_CUT, depth - 0.02], flat("woodMid"), [0, -BELOW_CUT, depth / 2 - 0.01]),
    box([width - 0.1, tall - 0.18, 0.02], flat("void"), [0, 0.06, depth - 0.01]),
    box([width + 0.1, 0.1, depth + 0.04], flat("woodDark"), [0, tall, depth / 2 + 0.02]),
    box([doorWidth, tall - 0.22, 0.03], door, [-width / 4, 0.08, depth + 0.015]),
  );
  const ajar = box([doorWidth, tall - 0.22, 0.03], door, [doorWidth / 2, 0.08, 0.015]);
  const hinge = group(ajar);
  hinge.position.set(width / 2 - 0.04, 0, depth);
  hinge.rotation.y = 0.35;
  result.add(hinge);
  return result;
}

/** A dark looking-glass in a plain frame, hung over the dressing table; it shows nothing. Back at z = 0. */
function lookingGlass(): THREE.Group {
  const frame = flat("woodDark");
  return group(
    box([0.62, 0.86, 0.04], frame, [0, 0, 0.02]),
    box([0.5, 0.74, 0.02], flat("moonDark"), [0, 0.06, 0.04]),
  );
}

const SITTER = [
  "aaaaaaaaaaaaaaaa",
  "aaaaabbbbbbaaaaa",
  "aaaabbbbbbbbaaaa",
  "aaabbbffffbbbaaa",
  "aaabbffffffbbaaa",
  "aaabbfffffbbbaaa",
  "aaabbfeffefbbaaa",
  "aaabbfhffhfbbaaa",
  "aaabbffffffbbaaa",
  "aaabbbffgffbbaaa",
  "aaabbbbffffbbaaa",
  "aaaabbbbffbbaaaa",
  "aaaaaccffccaaaaa",
  "aaaccccddccccaaa",
  "aacccccddcccccaa",
  "accccccddccccccc",
  "cccccccddccccccc",
  "cccccccccccccccc",
  "cccccccccccccccc",
  "cccccccccccccccc",
];

/** The lady of the house, in a dark gown; her eyes have turned to look down at the bed. */
const SITTER_LEGEND = {
  a: "bloodDark",
  b: "soot",
  c: "sootLight",
  d: "boneDark",
  e: "boneLight",
  f: "bone",
  g: "boneDark",
  h: "void",
} as const;

/** A small rug laid where feet meet the floor getting out of bed. */
function bedsideRug(): THREE.Mesh {
  return rug({ width: 2.2, length: 1.0, field: "bloodDark", border: "woodDark", motif: "brass", fringe: "boneDark" });
}

const SPRIG = [
  "...#...",
  "..#.#..",
  "...#...",
  ".#.#.#.",
  "..###..",
  "...#...",
  "...#...",
  "..#....",
  "...#...",
];

/** An upper-floor bedroom made around one great pale four-poster, lit by a
 *  single candle on the nightstand against the moon from its window. */
export const MASTER_BEDROOM: RoomDefinition = {
  id: "master-bedroom",
  floor: () => woodPlanks({ seed: "master-bedroom" }),
  wall: () => wallpaper({ ground: "bloodDark", stripe: "blood", motif: "blood", pattern: SPRIG, seed: "master-bedroom" }),
  wainscot: () => panelling({ ramp: RAMPS.wood, seed: "master-bedroom" }),
  trim: "woodDark",
  props: [
    { build: bedsideRug, at: [1.15, 1.45] },
    { build: fourPosterBed, ...onWall("right", 0, { out: 0.05 }) },
    { build: testerBack, ...onWall("right", 0, { y: 1.45, out: 0.06 }) },
    { build: nightstand, ...onWall("right", -1.35, { out: 0.02 }) },
    { build: () => chamberstick({ height: 0.07, intensity: 8, range: 8, lift: 0.27 }), name: "chamberstick", at: [INNER - 0.24, -1.3], y: 0.64 },
    { build: nightstand, ...onWall("right", 1.35, { out: 0.02 }) },
    { build: washstandThings, at: [INNER - 0.24, 1.32], y: 0.64, turn: -90 },
    { build: slippers, at: [1.75, 1.2], turn: 8 },
    { build: blanketChest, at: [0.3, 0], turn: -90 },
    { build: wardrobeBase, ...onWall("top", -1.65) },
    { build: wardrobeBody, ...onWall("top", -1.65, { y: CUT_HEIGHT }) },
    { build: () => table({ length: 1.0, width: 0.45, height: 0.74 }), name: "dressingTable", ...onWall("left", -1.5, { out: 0.25 }) },
    { build: () => candle({ height: 0.22, intensity: 4 }), name: "dressingCandle", at: [-INNER + 0.22, 1.85], y: 0.74 },
    { build: lookingGlass, ...onWall("left", -1.5, { y: 1.12 }) },
    { build: () => chair({ cushion: "bloodDark" }), name: "watchingChair", at: [-1.7, 1.0], turn: 60 },
    { build: () => pictureFrame({ art: { rows: SITTER, legend: SITTER_LEGEND }, frame: "brass" }), name: "portrait", ...onWall("top", 1.4, { y: 1.35 }) },
  ],
  focus: [1.6, 0.9, 0],
  pawn: [-1.0, -1.2],
  spots: [[-0.45, 0.45], [0.65, -1.65], [-1.25, 1.95], [0.65, 1.75], [2.25, -2.25]],
  overflow: [[-1.65, 0.2], [-2.1, -1.1], [-0.25, 1.95], [1.65, -1.65], [-0.35, -1.65], [1.15, -2.25]],
  // Round the foot of the bed.
  lanes: [
    [[0, -2.2], [-0.6, -1.0], [-2.2, 0]],
    [[-0.6, -1.0], [-0.6, 0.4], [-2.2, 0]],
  ],
};
