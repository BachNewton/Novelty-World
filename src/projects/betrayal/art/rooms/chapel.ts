import * as THREE from "three";
import { candle, cobweb, rug, windowPool } from "../kit";
import { lightAnchor } from "../light-anchor";
import { paletteHex, RAMPS, type PaletteKey } from "../palette";
import type { Edge } from "../../types";
import { INNER, onWall, WINDOW_SILL, WINDOW_TOP, WINDOW_WIDTH, type PropPlacement, type RoomDefinition } from "../room";
import { box, cylinder, flat, glow, group, lathe, textured } from "../shapes";
import { flagstones, marble, panelling, svgTexture, TEXELS_PER_METRE, wallpaper, woodPlanks } from "../textures";

/** The jewel colours of the glass, and so of the light it throws. */
const GLASS: PaletteKey[] = ["blood", "amber", "verdigris", "moon", "bloodLight", "verdigrisLight"];

const hex = paletteHex;

function svg(w: number, h: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${body}</svg>`;
}

/** A pointed arch standing on the bottom edge, `x`..`x + w` wide, apex at `top`. */
function archPath(x: number, top: number, w: number, bottom: number): string {
  const spring = top + w * 0.75;
  const cx = x + w / 2;
  return `M${x} ${bottom} L${x} ${spring} Q${x} ${top + w * 0.2} ${cx} ${top} Q${x + w} ${top + w * 0.2} ${x + w} ${spring} L${x + w} ${bottom} Z`;
}

/** A lancet of leaded glass: a jewelled border, a field of diamond quarries,
 *  a haloed figure and a small rose in the head of the arch. */
function lancetSvg(w: number, h: number): string {
  const lead = hex("void");
  const cx = w / 2;
  const quarries: string[] = [];
  for (let y = -4; y < h; y += 6) {
    for (let x = -4; x < w + 4; x += 6) {
      const odd = ((x + y) / 6) % 2 === 0;
      quarries.push(`<path d="M${x + 3} ${y} l3 3 l-3 3 l-3 -3z" fill="${hex(odd ? "verdigrisDark" : "moonDark")}" stroke="${lead}" stroke-width="0.6"/>`);
    }
  }
  const border: string[] = [];
  for (let y = 0; y < h; y += 4) {
    const colour = (y / 4) % 2 === 0 ? "amber" : "blood";
    border.push(`<rect x="0" y="${y}" width="${w}" height="4" fill="${hex(colour)}"/>`);
  }
  const roseY = w * 0.62;
  const figureTop = roseY + 10;
  const robe = `M${cx - 7} ${h - 5} L${cx - 4} ${figureTop + 7} L${cx + 4} ${figureTop + 7} L${cx + 7} ${h - 5}Z`;
  const inner = archPath(3, 3, w - 6, h - 3);
  return svg(
    w,
    h,
    `<defs><clipPath id="o"><path d="${archPath(0, 0, w, h)}"/></clipPath><clipPath id="i"><path d="${inner}"/></clipPath></defs>
<g clip-path="url(#o)">${border.join("")}</g>
<g clip-path="url(#i)">
<rect width="${w}" height="${h}" fill="${hex("moonDark")}"/>${quarries.join("")}
<path d="${robe}" fill="${hex("blood")}" stroke="${lead}" stroke-width="1"/>
<path d="M${cx - 4} ${figureTop + 7} L${cx + 4} ${figureTop + 7} L${cx + 2} ${h - 5} L${cx - 2} ${h - 5}Z" fill="${hex("bruiseLight")}"/>
<circle cx="${cx}" cy="${figureTop + 3}" r="5" fill="${hex("amber")}" stroke="${lead}" stroke-width="1"/>
<circle cx="${cx}" cy="${figureTop + 3}" r="2.5" fill="${hex("boneLight")}"/>
<circle cx="${cx}" cy="${roseY}" r="7" fill="${hex("bloodDark")}" stroke="${lead}" stroke-width="1"/>
<circle cx="${cx}" cy="${roseY}" r="5" fill="${hex("bloodLight")}"/>
<circle cx="${cx}" cy="${roseY}" r="2.5" fill="${hex("flame")}"/>
<path d="M${cx} ${roseY - 7} V${roseY + 7} M${cx - 7} ${roseY} H${cx + 7}" stroke="${lead}" stroke-width="1"/>
<rect x="0" y="${h - 5}" width="${w}" height="2" fill="${lead}"/>
</g>
<path d="${inner}" fill="none" stroke="${lead}" stroke-width="1"/>`,
  );
}

/** The stone frame of the lancet: a pointed arch of voussoirs. */
function surroundSvg(w: number, h: number, band: number): string {
  const outer = archPath(0, 0, w, h);
  const inner = archPath(band, band, w - band * 2, h + 1);
  const joints: string[] = [];
  for (let y = band * 2; y < h; y += 7) {
    joints.push(`<path d="M0 ${y} H${w}" stroke="${hex("stoneDark")}" stroke-width="1"/>`);
  }
  return svg(
    w,
    h,
    `<path d="${outer} ${inner}" fill="${hex("stone")}" fill-rule="evenodd"/>
<path d="${inner}" fill="none" stroke="${hex("stoneDark")}" stroke-width="1.5"/>
<path d="${outer}" fill="none" stroke="${hex("ash")}" stroke-width="1.5"/>
<g clip-path="url(#s)">${joints.join("")}</g>
<defs><clipPath id="s"><path d="${outer} ${inner}" clip-rule="evenodd"/></clipPath></defs>`,
  );
}

/** The east window: a stained-glass lancet over the room's real window, in a
 *  stone surround. Its origin is the sill, its back against the wall. */
function stainedWindow(): THREE.Group {
  const width = WINDOW_WIDTH + 0.2;
  const height = WINDOW_TOP - WINDOW_SILL + 0.5;
  const w = Math.round(width * TEXELS_PER_METRE);
  const h = Math.round(height * TEXELS_PER_METRE);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w / TEXELS_PER_METRE, h / TEXELS_PER_METRE), glow("moon", svgTexture(lancetSvg(w, h), w, h)));
  glass.position.set(0, h / TEXELS_PER_METRE / 2, 0.09);
  const band = 5;
  const sw = w + band * 2;
  const sh = h + band;
  const surround = new THREE.Mesh(
    new THREE.PlaneGeometry(sw / TEXELS_PER_METRE, sh / TEXELS_PER_METRE),
    textured(svgTexture(surroundSvg(sw, sh, band), sw, sh), true),
  );
  // Proud of the sill's front, which stands 10 cm off the wall.
  surround.position.set(0, sh / TEXELS_PER_METRE / 2, 0.11);
  glass.userData.noShadow = true;
  surround.userData.noShadow = true;
  return group(glass, surround);
}

/** The lancet's colours laid on the floor before the chancel: a stylised
 *  glow of the window, falling straight out of it whichever way the tile
 *  turns. Its origin is where it meets the chancel step; it reaches out along +z. */
function stainedPool(): THREE.Mesh {
  return windowPool({ reach: 1.9, glass: GLASS, panes: [6, 8], opacity: 0.6 });
}

/** A row of chapel seating with gothic pointed ends. It faces +z. */
function pew(length = 1.6): THREE.Group {
  const boards = textured(woodPlanks({ plankPx: 6, seed: "pew" }));
  const dark = flat("woodDark");
  const end = flat("woodMid");
  const span = length - 0.1;
  const result = group(
    box([span, 0.05, 0.42], boards, [0, 0.42, 0.02]),
    box([span, 0.08, 0.04], dark, [0, 0.33, 0.21]),
    box([span, 0.49, 0.05], boards, [0, 0.47, -0.2]),
    box([span, 0.06, 0.09], dark, [0, 0.96, -0.2]),
    box([span, 0.03, 0.14], dark, [0, 0.74, -0.3]),
  );
  for (const x of [-length / 2 + 0.03, length / 2 - 0.03]) {
    result.add(
      box([0.06, 0.92, 0.56], end, [x, 0, -0.04]),
      cylinder(0.07, 0.18, end, [x, 0.92, -0.2], { top: 0, sides: 4 }),
    );
  }
  return result;
}

/** A pew knocked over onto its back. */
function toppledPew(): THREE.Group {
  const fallen = pew(1.4);
  fallen.rotation.x = -Math.PI / 2 + 0.1;
  fallen.position.set(0, 0.34, 0.5);
  return group(fallen);
}

/** A candle burnt down to a stub in a puddle of its own wax. */
function stub(lit: boolean, height = 0.05): THREE.Group {
  const wax = flat("bone");
  const result = group(
    cylinder(0.07, 0.008, flat("boneDark"), [0, 0, 0], { sides: 7 }),
    box([0.02, 0.012, 0.09], wax, [0.04, 0, 0.02]),
  );
  if (lit) {
    result.add(candle({ height, light: false }));
  } else {
    result.add(
      cylinder(0.03, height, wax, [0, 0, 0], { top: 0.024, sides: 6 }),
      cylinder(0.004, 0.015, flat("void"), [0, height, 0], { sides: 3 }),
    );
  }
  return result;
}

/** A turned brass candlestick holding a tall candle. */
function candlestick(height: number, lit = true): THREE.Group {
  const stick = lathe(
    [
      [0, 0],
      [0.09, 0],
      [0.09, 0.03],
      [0.04, 0.06],
      [0.03, height * 0.5],
      [0.05, height * 0.55],
      [0.025, height * 0.6],
      [0.025, height - 0.02],
      [0.06, height],
      [0, height],
    ],
    flat("brass"),
    8,
  );
  const taper = lit ? candle({ height: 0.3, light: false }) : stub(false, 0.12);
  taper.position.y = height;
  return group(stick, taper);
}

/** A stone altar under a cloth and a red frontal, with its cross and candles.
 *  It faces +z, towards the people. */
function altar(): THREE.Group {
  const stone = textured(flagstones({ stonePx: 8, size: 32, seed: "altar" }));
  const brass = flat("brass");
  const cloth = flat("bone");
  const slab = 0.9;
  const top = slab + 0.012;
  const result = group(
    box([1.7, 0.84, 0.7], stone, [0, 0, 0]),
    box([1.86, 0.06, 0.82], stone, [0, 0.84, 0]),
    box([1.9, 0.012, 0.86], cloth, [0, slab, 0]),
    box([1.9, 0.22, 0.012], cloth, [0, top - 0.22, 0.432]),
    box([0.9, 0.62, 0.012], flat("blood"), [0, slab - 0.68, 0.44]),
    box([0.94, 0.05, 0.02], flat("amber"), [0, slab - 0.1, 0.44]),
    box([0.06, 0.38, 0.016], flat("amber"), [0, slab - 0.6, 0.446]),
    box([0.24, 0.06, 0.016], flat("amber"), [0, slab - 0.4, 0.446]),
  );
  result.add(
    box([0.26, 0.05, 0.18], brass, [0, top, -0.2]),
    box([0.16, 0.05, 0.12], brass, [0, top + 0.05, -0.2]),
    box([0.06, 0.72, 0.06], brass, [0, top + 0.1, -0.2]),
    box([0.38, 0.06, 0.06], brass, [0, top + 0.56, -0.2]),
  );
  for (const [x, lit] of [[-0.62, true], [0.62, false]] as const) {
    const stick = candlestick(0.4, lit);
    stick.position.set(x, top, -0.15);
    result.add(stick);
  }
  for (const [x, z, lit] of [[-0.3, 0.18, false], [0.34, 0.2, true], [0.8, 0.28, false]] as const) {
    const s = stub(lit, lit ? 0.06 : 0.04);
    s.position.set(x, top, z);
    result.add(s);
  }
  for (const [x, length] of [[0.33, 0.12], [0.38, 0.24], [-0.7, 0.16]]) {
    result.add(box([0.025, length, 0.02], flat("boneLight"), [x, slab - length, 0.452]));
  }
  // The holy light: gold, as the lighting language gives the Chapel.
  result.add(lightAnchor({ colour: "gold", intensity: 6, range: 8, flicker: 0.12 }, [0, top + 0.55, 0.75]));
  return result;
}

/** The raised floor the altar stands on, with a communion rail in front. */
function chancel(): THREE.Group {
  const stone = textured(marble({ chequer: false, pale: "bone", paleVein: "boneLight", grout: "boneDark", seed: "chancel" }));
  const rail = flat("woodDark");
  const result = group(box([4.2, 0.15, 1.35], stone, [0, 0, 0]));
  for (const side of [-1, 1]) {
    const cx = side * 1.3;
    result.add(box([1.5, 0.06, 0.12], flat("wood"), [cx, 0.85, -0.6]), box([1.5, 0.08, 0.3], flat("blood"), [cx, 0.15, -0.5]));
    for (let i = 0; i <= 5; i++) {
      result.add(box([0.05, 0.7, 0.05], rail, [cx - 0.72 + i * 0.288, 0.15, -0.6]));
    }
  }
  return result;
}

/** A reading stand with an open book. The reader stands on its +z side. */
function lectern(): THREE.Group {
  const wood = flat("wood");
  const dark = flat("woodDark");
  const desk = group(
    box([0.56, 0.04, 0.42], wood, [0, 0, 0]),
    box([0.58, 0.06, 0.03], dark, [0, 0.02, 0.2]),
    box([0.24, 0.03, 0.34], flat("boneLight"), [-0.13, 0.04, 0]),
    box([0.24, 0.03, 0.34], flat("bone"), [0.13, 0.04, 0]),
    box([0.03, 0.012, 0.32], flat("boneDark"), [0, 0.07, 0]),
    box([0.025, 0.25, 0.004], flat("blood"), [0.04, -0.2, -0.21]),
  );
  desk.rotation.x = -0.4;
  desk.position.set(0, 1.08, 0);
  return group(box([0.46, 0.06, 0.46], dark, [0, 0, 0]), box([0.12, 1.05, 0.12], wood, [0, 0.06, 0]), desk);
}

/** An iron stand of votive candles, most long gone out. */
function votiveStand(): THREE.Group {
  const iron = flat("sootLight");
  const result = group(box([0.04, 0.9, 0.04], iron, [0, 0, 0]), box([0.3, 0.03, 0.3], iron, [0, 0, 0]));
  const tiers = [
    { y: 0.6, z: 0.12, lit: [true, false, false, true] },
    { y: 0.75, z: 0, lit: [false, true, false, false] },
    { y: 0.9, z: -0.12, lit: [false, false, true, false] },
  ];
  for (const tier of tiers) {
    result.add(box([0.62, 0.025, 0.1], iron, [0, tier.y, tier.z]));
    tier.lit.forEach((lit, i) => {
      const s = stub(lit, lit ? 0.07 : 0.03);
      s.scale.setScalar(0.7);
      s.position.set(-0.22 + i * 0.145, tier.y + 0.025, tier.z);
      result.add(s);
    });
  }
  result.add(lightAnchor({ colour: "amber", intensity: 2.5, range: 4, flicker: 0.2 }, [0, 1.1, 0.1]));
  return result;
}

/** A tall iron pricket stand holding one candle, for the side aisles. */
function pricket(): THREE.Group {
  const iron = flat("sootLight");
  const base = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.12, 3), iron);
  base.position.y = 0.06;
  const taper = candle({ height: 0.22, intensity: 2.5 });
  taper.position.y = 1.3;
  return group(
    base,
    box([0.04, 1.24, 0.04], iron, [0, 0.06, 0]),
    cylinder(0.12, 0.03, iron, [0, 1.27, 0], { top: 0.14, sides: 8 }),
    cylinder(0.11, 0.006, flat("boneDark"), [0, 1.3, 0], { sides: 8 }),
    box([0.02, 0.135, 0.02], flat("bone"), [0.11, 1.15, 0]),
    taper,
  );
}

/** A stone font for holy water, split by a crack, a piece of its rim on the floor. */
function crackedFont(): THREE.Group {
  const stone = flat("stone");
  const bowl = lathe(
    [
      [0, 0],
      [0.3, 0],
      [0.3, 0.08],
      [0.12, 0.14],
      [0.1, 0.6],
      [0.18, 0.66],
      [0.34, 0.86],
      [0.36, 0.94],
      [0.3, 0.94],
      [0.28, 0.88],
      [0, 0.86],
    ],
    stone,
    9,
  );
  const water = cylinder(0.27, 0.01, flat("verdigrisDark"), [0, 0.87, 0], { sides: 9 });
  const crack = box([0.025, 0.34, 0.04], flat("void"), [0, 0.6, 0.32]);
  crack.rotation.z = 0.25;
  const chunk = new THREE.Mesh(new THREE.DodecahedronGeometry(0.08, 0), stone);
  chunk.scale.set(1.4, 0.6, 1);
  chunk.position.set(0.45, 0.05, 0.25);
  const shard = new THREE.Mesh(new THREE.TetrahedronGeometry(0.05, 0), stone);
  shard.position.set(0.3, 0.03, 0.5);
  return group(bowl, water, crack, chunk, shard);
}

/** A tattered banner hung from a rod, its lower edge torn. */
function banner(emblem: "cross" | "rose"): THREE.Group {
  const w = 19;
  const h = 38;
  const torn = [0, 3, 1, 5, 2, 0, 4, 1, 6, 2, 0, 3, 5, 1, 2, 4, 0, 3, 1];
  const field = torn.map((cut, x) => `<rect x="${x}" y="0" width="1" height="${h - cut}" fill="${hex("blood")}"/>`).join("");
  const mark =
    emblem === "cross"
      ? `<rect x="8" y="7" width="3" height="17" fill="${hex("amber")}"/><rect x="4" y="11" width="11" height="3" fill="${hex("amber")}"/>`
      : `<circle cx="9.5" cy="14" r="6" fill="${hex("amber")}"/><circle cx="9.5" cy="14" r="3.5" fill="${hex("bloodDark")}"/><circle cx="9.5" cy="14" r="1.5" fill="${hex("amber")}"/>`;
  const art = svg(
    w,
    h,
    `${field}<rect x="0" y="2" width="${w}" height="1" fill="${hex("amber")}"/><rect x="2" y="0" width="1" height="${h - 7}" fill="${hex("bloodDark")}"/><rect x="${w - 3}" y="0" width="1" height="${h - 7}" fill="${hex("bloodDark")}"/>${mark}`,
  );
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(w / TEXELS_PER_METRE, h / TEXELS_PER_METRE), textured(svgTexture(art, w, h), true));
  cloth.position.set(0, -h / TEXELS_PER_METRE / 2, 0.04);
  cloth.userData.noShadow = true;
  const rod = box([w / TEXELS_PER_METRE + 0.16, 0.03, 0.03], flat("brass"), [0, 0, 0.04]);
  return group(cloth, rod);
}

/** A cobweb across a corner; `x` and `z` give the corner's signs. It hides
 *  when either of the corner's walls is cut away. */
function cornerWeb(x: 1 | -1, z: 1 | -1): PropPlacement {
  const inset = INNER - 0.29;
  const walls: Edge[] = [x > 0 ? "right" : "left", z > 0 ? "bottom" : "top"];
  return { build: () => cobweb({ form: "slung" }), at: [x * inset, z * inset], y: 3.05, turn: x * z > 0 ? 45 : -45, walls };
}

/** The Chapel: pews in two ranks down a red runner to an altar in gold
 *  light, under a stained-glass lancet whose colours lie on the floor before
 *  the chancel. A ground-floor room in the formal zone: marble, damask, panelling. */
export const CHAPEL: RoomDefinition = {
  id: "chapel",
  floor: () => marble({ square: 32, chequer: false, pale: "stoneDark", paleVein: "stone", grout: "ash", veins: 10, seed: "chapel" }),
  wall: () => wallpaper({ ground: "ash", stripe: "sootLight", motif: "stoneDark", seed: "chapel" }),
  wainscot: () => panelling({ ramp: RAMPS.wood, seed: "chapel" }),
  trim: "woodDark",
  props: [
    { build: () => rug({ width: 1.1, length: 3.9, field: "blood", border: "bloodDark", motif: "amber" }), at: [0, -0.6] },
    { build: chancel, at: [0, 2.12] },
    { build: altar, ...onWall("bottom", 0, { y: 0.15, out: 0.55 }) },
    { build: stainedWindow, ...onWall("bottom", 0, { y: WINDOW_SILL }) },
    { build: stainedPool, ...onWall("bottom", 0, { out: 1.36 }) },
    { build: lectern, at: [-1.75, 2.1], y: 0.15, turn: 200 },
    { build: votiveStand, at: [2.3, 1.85], turn: 200 },
    // The back of the nave is left open, for the people coming in at the door.
    ...[-1.1, -0.2, 0.7].map((z) => ({ build: () => pew(), at: [-1.55, z] as [number, number] })),
    ...[-1.1, -0.2].map((z) => ({ build: () => pew(), at: [1.55, z] as [number, number] })),
    { build: toppledPew, at: [1.6, 0.78], turn: 18 },
    { build: pricket, at: [-2.55, -0.65] },
    { build: pricket, at: [2.55, 0.25] },
    { build: crackedFont, at: [-2.2, -2.2] },
    { build: () => banner("cross"), ...onWall("left", -0.2, { y: 2.7 }) },
    { build: () => banner("rose"), ...onWall("right", 0.7, { y: 2.7 }) },
    cornerWeb(-1, -1),
    cornerWeb(1, 1),
    cornerWeb(1, -1),
  ],
  focus: [0, 1.0, 1.2],
  pawn: [0.15, -1.6],
  spots: [[-0.05, -0.75], [1.2, -2.1], [-1.2, -2.1], [0.2, 0.1], [-0.15, 0.9]],
};
