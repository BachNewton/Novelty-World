import * as THREE from "three";
import { createRng, pick, type Rng } from "@/shared/lib/seeded-random";
import { candle, cobweb } from "../kit";
import { solidLathe } from "../kit/vessel";
import { lightAnchor } from "../light-anchor";
import { paletteHex, type PaletteKey } from "../palette";
import { CUT_HEIGHT, INNER, onWall, type PropPlacement, type RoomDefinition } from "../room";
import { batch, box, flat, group, lightMaterial, textured } from "../shapes";
import { shiny, SHINES } from "../shine";
import { flagstones, pixelTexture, TEXELS_PER_METRE } from "../textures";

const SEED = "crypt";

/** The stone bench round the walls: how far it comes out, and its top, a little under the cut wall's. */
const BENCH = { depth: 0.42, top: CUT_HEIGHT - 0.004, cap: 0.06 };
/** The burial niches above the bench: their size, the stone between them, and how many rows. */
const NICHE = { width: 0.625, height: 0.5, frame: 0.09, rows: 3, recess: 0.04, depth: 0.24 };
/** How far out from its wall a thing set on the bench's ledge stands, in front of the niches. */
const LEDGE = NICHE.depth + (BENCH.depth - NICHE.depth) / 2;
const NICHE_TOP = CUT_HEIGHT + NICHE.frame + NICHE.rows * (NICHE.height + NICHE.frame);

/** The sarcophagus: where it stands, and its body's size. */
const TOMB_AT: [number, number] = [-0.45, 0.55];
const TOMB = { length: 2.0, width: 0.84, plinth: 0.15, height: 0.8, wall: 0.09 };
/** The tablet waiting by the right-hand bench, and where it leans. */
const TABLET = { width: 22 / TEXELS_PER_METRE, height: 32 / TEXELS_PER_METRE, thick: 0.07 };
/** Its back's foot, set out from the wall so it leans on the bench's edge. */
const TABLET_AT: [number, number] = [INNER - 0.46, -0.55];

const hex = paletteHex;
const SIDE = INNER * 2;

/** The floor: big dressed slabs, a metre by half a metre, in staggered courses, each one flat stone with its
 *  lower and right edges sunk dark, and a crack or two. */
function slabFloor(): THREE.Texture {
  const rng = createRng(`${SEED}:floor`);
  const size = 64;
  const grid = Array.from({ length: size }, () => Array<string>(size).fill("m"));
  for (let course = 0; course < size / 16; course++) {
    const offset = (course % 2) * 16 + (course === 3 ? 8 : 0);
    for (let slab = 0; slab < size / 32; slab++) {
      const tone = pick(rng, ["a", "s", "s", "l"]);
      for (let y = 1; y < 16; y++) {
        for (let x = 1; x < 32; x++) {
          const edge = y === 15 || x === 31;
          grid[course * 16 + y][(slab * 32 + offset + x) % size] = edge ? "a" : tone === "a" ? "s" : tone;
        }
      }
      if (tone === "a") {
        // A worn slab: its crack, an unbroken jagged line part way across it.
        let y = course * 16 + 4 + Math.floor(rng.next() * 7);
        const from = 4 + Math.floor(rng.next() * 6);
        for (let x = from; x < from + 12 + Math.floor(rng.next() * 8); x++) {
          grid[y][(slab * 32 + offset + x) % size] = "c";
          if (rng.next() < 0.3) {
            y = Math.min(course * 16 + 13, Math.max(course * 16 + 2, y + (rng.next() < 0.5 ? -1 : 1)));
            grid[y][(slab * 32 + offset + x) % size] = "c";
          }
        }
      }
    }
  }
  return pixelTexture(grid.map((row) => row.join("")), { m: "soot", a: "ash", s: "stoneDark", l: "stone", c: "sootLight" }, true);
}

/** A box with one face drawn from a pixel texture made to fit it exactly: `face` is the texture, the box `size`
 *  its texels' metres wide and tall; faces +z, its base at y = 0. */
function faced(face: THREE.Texture, depth: number, body: THREE.Material): THREE.Mesh {
  const image = face.image as { width: number; height: number };
  const [w, h] = [image.width / TEXELS_PER_METRE, image.height / TEXELS_PER_METRE];
  // Built from x = 0, so the face's texture starts at its left edge, then centred.
  const mesh = box([w, h, depth], [body, body, body, body, textured(face), body], [w / 2, 0, -depth / 2]);
  mesh.geometry.translate(-w / 2, 0, 0);
  return mesh;
}

/** Lines of carved lettering, `width` texels wide, as pixel rows: words of 2–5 cuts with a gap between. */
function lettering(rng: Rng, width: number, rows: number[], height: number, letters: number): string[] {
  const grid = Array.from({ length: height }, () => Array<string>(width).fill("."));
  for (const [line, y] of rows.entries()) {
    const span = line === 0 ? width - 4 : width - 6 - Math.floor(rng.next() * 6);
    let x = Math.floor((width - span) / 2);
    const end = x + span;
    let cut = 0;
    while (x < end && cut < letters) {
      const word = 2 + Math.floor(rng.next() * 4);
      for (let k = 0; k < word && x < end; k++, x++, cut++) grid[y][x] = rng.next() < 0.8 ? "c" : ".";
      x++;
    }
  }
  return grid.map((row) => row.join(""));
}

/** A sealed niche's slab, face on: a cut border and a name and dates, worn. */
function slabFace(seed: string): THREE.Texture {
  const rng = createRng(`${SEED}:slab:${seed}`);
  const [w, h] = [Math.round(NICHE.width * TEXELS_PER_METRE), Math.round(NICHE.height * TEXELS_PER_METRE)];
  const carved = lettering(rng, w, [6, 9], h, 99);
  const rows = carved.map((row, y) =>
    [...row]
      .map((cell, x) => {
        if (x === 2 || x === w - 3 || y === 2 || y === h - 3) return x >= 2 && x <= w - 3 && y >= 2 && y <= h - 3 ? "c" : "s";
        return cell === "c" ? "c" : "s";
      })
      .join(""),
  );
  const tone = pick(rng, ["stone", "stoneDark", "stoneDark"] as PaletteKey[]);
  return pixelTexture(rows, { s: tone, c: tone === "stone" ? "stoneDark" : "ash" });
}

/** The new tablet, face on: pale fresh-cut stone, a border and two lines cut,
 *  and the third, the name, only begun, its guide line scratched on. */
function tabletFace(): THREE.Texture {
  const rng = createRng(`${SEED}:tablet`);
  const [w, h] = [22, 32];
  const carved = lettering(rng, w, [7, 10], h, 99);
  const name = lettering(createRng(`${SEED}:tablet-name`), w, [16], h, 4);
  const rows = carved.map((row, y) =>
    [...row]
      .map((cell, x) => {
        const border = (x === 2 || x === w - 3 || y === 2 || y === h - 3) && x >= 2 && x <= w - 3 && y >= 2 && y <= h - 3;
        if (border || cell === "c" || name[y][x] === "c") return "c";
        if (y === 17 && x >= 5 && x <= w - 6) return "g";
        if (y === 13 && x >= 7 && x <= w - 8) return "c";
        return "s";
      })
      .join(""),
  );
  return pixelTexture(rows, { s: "bone", c: "boneDark", g: "stoneLight" });
}

/**
 * The stone bench along one wall, `length` long, its top a ledge for
 * candles: a body of dark dressed stone under a paler cap slab. Runs along x,
 * backed against the wall at z = 0, faces +z.
 */
function bench(length: number): THREE.Group {
  const body = textured(flagstones({ ramp: ["soot", "sootLight", "ash", "stoneDark"], mortar: "void", stonePx: 8, seed: `${SEED}:bench` }));
  const cap = flat("stoneDark");
  const { depth, top, cap: capH } = BENCH;
  return group(
    box([length, top - capH, depth - 0.02], body, [0, 0, (depth - 0.02) / 2 - 0.005]),
    box([length, capH, depth], cap, [0, top - capH, depth / 2 - 0.005]),
  );
}

/** What fills one niche: a slab sealing it, or the dark of an open one. */
type Niche = { sealed: string } | "open";

/**
 * The wall of burial niches above a bench, `length` long, from the cut
 * height up: rows of niches in a stone frame, most sealed by a slab cut with
 * a name, a few open and dark. Runs along x, backed against the wall at
 * z = 0, faces +z; hung, so it hides when its wall is cut.
 */
function niches(length: number, fill: Niche[][], cornice = length): THREE.Group {
  const { width, height, frame, recess, depth } = NICHE;
  const columns = fill[0].length;
  const run = columns * (width + frame) + frame;
  const margin = (length - run) / 2;
  const stone = batch();
  const tall = NICHE_TOP - CUT_HEIGHT;
  const front = depth - 0.005;
  // The frame: bars between the rows and the columns, and solid stone past the last niche at each end.
  for (let row = 0; row <= NICHE.rows; row++) stone.block([length, frame, depth], "stoneDark", [0, row * (height + frame), front - depth / 2]);
  for (let column = 0; column <= columns; column++) {
    const x = -run / 2 + column * (width + frame) + frame / 2;
    stone.block([frame, tall - 0.012, depth - 0.003], "stoneDark", [x, 0.006, front - depth / 2 - 0.0015]);
  }
  // Stopped a little short of the ends, so their ends never share a plane with the bars'.
  for (const side of [-1, 1]) stone.block([margin - 0.004, tall - 0.012, depth - 0.003], "stoneDark", [side * (length / 2 - margin / 2), 0.006, front - depth / 2 - 0.0015]);
  const result = group(stone.mesh());
  const dark = batch();
  fill.forEach((cells, row) => {
    const y = frame + (NICHE.rows - 1 - row) * (height + frame);
    cells.forEach((cell, column) => {
      const x = -run / 2 + frame + column * (width + frame) + width / 2;
      if (cell === "open") {
        dark.block([width + 0.004, height + 0.004, 0.04], "void", [x, y - 0.002, 0.02]);
        return;
      }
      const slab = faced(slabFace(cell.sealed), depth - recess - 0.01, flat("stoneDark"));
      slab.position.set(x, y + 0.001, front - recess);
      slab.scale.y = (height - 0.002) / height;
      result.add(slab);
    });
  });
  result.add(dark.mesh());
  // A cornice over the top row, a little proud of the frame.
  result.add(box([cornice, 0.08, depth + 0.04], flat("stone"), [0, tall, (depth + 0.04) / 2 - 0.005]));
  return result;
}

/** One wall's bench and niches, as its two placements. */
function wallOfNiches(edge: "left" | "right" | "bottom", fill: Niche[][]): PropPlacement[] {
  // The side walls' benches and niches run the wall's whole length; the back's stop against their faces.
  const between = edge === "bottom";
  const benchLength = between ? SIDE - 2 * (BENCH.depth - 0.005) : SIDE;
  const nicheLength = between ? SIDE - 2 * (NICHE.depth - 0.005) : SIDE;
  const cornice = between ? SIDE - 2 * (NICHE.depth + 0.035) : SIDE;
  return [
    { build: () => bench(benchLength), name: `${edge} bench`, ...onWall(edge, 0) },
    { build: () => niches(nicheLength, fill, cornice), name: `${edge} niches`, ...onWall(edge, 0, { y: CUT_HEIGHT }) },
  ];
}

/** A wall's niches, row by row from the top: sealed but where `open` lists a row and column. */
function fillOf(columns: number, open: [row: number, column: number][], seed: string): Niche[][] {
  return Array.from({ length: NICHE.rows }, (_, row) =>
    Array.from({ length: columns }, (_, column): Niche => (open.some(([r, c]) => r === row && c === column) ? "open" : { sealed: `${seed}:${row}:${column}` })),
  );
}

/** The teal welling out of the open tomb: a glow on its floor, a haze at its rim, and the light it throws. */
function tombGlow(opening: { x: [number, number]; z: [number, number] }, floorY: number, rimY: number): THREE.Group {
  const [x0, x1] = opening.x;
  const [z0, z1] = opening.z;
  const result = group();
  for (const [y, opacity] of [
    [floorY + 0.01, 0.9],
    [(floorY + rimY) / 2, 0.35],
    [rimY - 0.04, 0.22],
  ] as const) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2), lightMaterial(opacity));
    (plane.material as THREE.MeshBasicMaterial).color.set(hex("spectre"));
    plane.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    plane.userData.noShadow = true;
    result.add(plane);
  }
  return result;
}

/**
 * The sarcophagus on its low plinth, long along x, carved panels down its
 * sides: its heavy lid shoved askew towards the foot (+x), so the head end
 * stands open, and out of it wells a cold teal light. Its long carved side faces +z.
 */
function sarcophagus(): THREE.Group {
  const { length, width, plinth, height, wall } = TOMB;
  const body = flat("stoneDark");
  const pale = flat("stone");
  const result = group(
    box([length + 0.44, plinth - 0.06, width + 0.44], flat("ash"), [0, 0, 0]),
    box([length + 0.3, 0.06, width + 0.3], flat("ash"), [0, plinth - 0.06, 0]),
    // The foot of the body, a moulding a little wider than its walls.
    box([length + 0.08, 0.1, width + 0.08], pale, [0, plinth, 0]),
  );
  const y0 = plinth + 0.1;
  // The walls stop a little under the rim band's top, so the two never share a plane.
  const h = height - 0.11;
  const half = { x: length / 2, z: width / 2 };
  result.add(
    box([length, h, wall], body, [0, y0, half.z - wall / 2]),
    box([length, h, wall], body, [0, y0, -half.z + wall / 2]),
    // The ends sit a little in from the long walls' ends, so their faces never share a plane.
    box([wall, h, width - 2 * wall + 0.004], body, [half.x - wall / 2 - 0.004, y0, 0]),
    box([wall, h, width - 2 * wall + 0.004], body, [-half.x + wall / 2 + 0.004, y0, 0]),
    // Its dark inside floor, well down.
    box([length - 2 * wall + 0.004, 0.06, width - 2 * wall + 0.004], flat("void"), [0, y0, 0]),
  );
  // A rim band round the top, a little proud of the walls.
  const rimY = plinth + height;
  // It stands a little in from the walls' inner faces too, so it never shares their planes.
  for (const z of [-1, 1]) result.add(box([length + 0.04, 0.07, wall + 0.03], pale, [0, rimY - 0.07, z * (half.z - wall / 2 + 0.0075)]));
  for (const x of [-1, 1]) result.add(box([wall + 0.03, 0.07, width - 2 * wall - 0.002], pale, [x * (half.x - wall / 2 + 0.0075), rimY - 0.073, 0]));
  // Carved panels down each long side and on each end, standing proud.
  for (const z of [-1, 1]) {
    for (const x of [-0.62, 0, 0.62]) result.add(box([0.5, 0.42, 0.015], pale, [x, y0 + 0.1, z * (half.z + 0.0075)]));
  }
  for (const x of [-1, 1]) result.add(box([0.015, 0.42, 0.56], pale, [x * (half.x + 0.0075), y0 + 0.1, 0]));
  // The lid: a thick slab with a raised panel and a ridge, shoved towards the foot and turned on the rim.
  const lid = group(
    box([length + 0.1, 0.1, width + 0.1], body, [0, 0, 0]),
    box([length - 0.1, 0.05, width - 0.12], pale, [0, 0.1, 0]),
    box([length - 0.3, 0.04, 0.12], body, [0, 0.15, 0]),
  );
  // Resting on the rim, a hair clear of it so their faces never share a plane.
  lid.position.set(0.66, rimY + 0.003, 0.1);
  lid.rotation.y = -0.32;
  result.add(lid);
  result.add(tombGlow({ x: [-half.x + wall, 0.1], z: [-half.z + wall, half.z - wall] }, y0 + 0.06, rimY));
  result.add(lightAnchor({ colour: "spectre", intensity: 6, range: 7, kind: "glow" }, [-0.6, rimY + 0.55, 0]));
  return result;
}

/** The cold spilled over the tomb's rim and lying round its plinth: teal light on the floor, thinning away
 *  from the stone, and a fainter sheet of mist a little above it. Centred on the tomb, long along x. */
function coldMist(): THREE.Group {
  const half = { x: (TOMB.length + 0.44) / 2, z: (TOMB.width + 0.44) / 2 };
  const result = group();
  for (const [y, reach, opacity] of [
    [0.014, 1.1, 0.3],
    [0.12, 1.4, 0.18],
  ] as const) {
    const [w, d] = [2 * (half.x + reach), 2 * (half.z + reach)];
    const geometry = new THREE.PlaneGeometry(w, d, Math.round(w * 10), Math.round(d * 10)).rotateX(-Math.PI / 2);
    const position = geometry.getAttribute("position");
    const teal = new THREE.Color(hex("spectre"));
    const colours: number[] = [];
    for (let i = 0; i < position.count; i++) {
      const out = Math.hypot(Math.max(0, Math.abs(position.getX(i)) - half.x), Math.max(0, Math.abs(position.getZ(i)) - half.z));
      colours.push(...teal.clone().multiplyScalar(Math.pow(Math.max(0, 1 - out / reach), 2)).toArray());
    }
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
    const sheet = new THREE.Mesh(geometry, lightMaterial(opacity, { vertexColors: true }));
    sheet.position.y = y;
    sheet.userData.noShadow = true;
    result.add(sheet);
  }
  return result;
}

/**
 * The new tablet, ready to seal a niche: pale fresh-cut stone among the
 * old, leaning against the bench, its name half cut. Faces +z, its foot at
 * the origin, leaning back.
 */
function waitingTablet(): THREE.Group {
  const slab = faced(tabletFace(), TABLET.thick, flat("bone"));
  slab.position.z = TABLET.thick;
  const result = group(slab);
  result.rotation.x = -0.12;
  return group(result);
}

/** The mason's tools put down mid-word: a mallet and a chisel, and pale chips of
 *  the fresh stone scattered round them. Lies flat, chips spread along x. */
function masonsTools(): THREE.Group {
  const rng = createRng(`${SEED}:chips`);
  const chips = batch();
  let lift = 0;
  for (let k = 0; k < 22; k++) {
    const s = 0.02 + rng.next() * 0.03;
    const at = new THREE.Vector3((rng.next() - 0.5) * 0.7, s / 2 + lift, (rng.next() - 0.5) * 0.55);
    lift += 0.0007;
    chips.add([s, s * 0.6, s * 0.8], pick(rng, ["bone", "boneLight", "boneDark"] as PaletteKey[]), new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng.next() * 3, 0)), new THREE.Vector3(1, 1, 1)));
  }
  const iron = shiny(flat("sootLight"), SHINES.iron);
  const chisel = group(box([0.2, 0.018, 0.018], iron, [0, 0, 0]), box([0.04, 0.012, 0.03], iron, [0.12, 0.003, 0]));
  chisel.position.set(0.12, 0, 0.16);
  chisel.rotation.y = 0.5;
  const mallet = group(
    box([0.26, 0.03, 0.03], flat("woodMid"), [0, 0.035, 0]),
    box([0.1, 0.1, 0.13], flat("woodLight"), [-0.16, 0, 0]),
  );
  mallet.position.set(-0.15, 0, -0.12);
  mallet.rotation.y = -0.9;
  return group(chips.mesh(), chisel, mallet);
}

/** The mason's working light: a candle stuck in its own wax on a block of
 *  stone set on the floor, before the tablet. */
function masonsCandle(): THREE.Group {
  const taper = candle({ height: 0.14, intensity: 4, range: 6 });
  taper.position.y = 0.16;
  return group(box([0.2, 0.16, 0.16], flat("stoneDark"), [0, 0, 0]), box([0.07, 0.01, 0.06], flat("bone"), [0, 0.16, 0]), taper);
}

/** A stone urn on the bench, its lid shut. */
function urn(): THREE.Mesh {
  return solidLathe([[0.04, 0], [0.055, 0.02], [0.04, 0.05], [0.07, 0.13], [0.065, 0.2], [0.04, 0.24], [0.05, 0.26], [0.015, 0.3]], flat("stone"), 8);
}

/** A bunch of flowers left long ago on the bench, dead and gone grey. Lies along x. */
function deadFlowers(): THREE.Group {
  const rng = createRng(`${SEED}:flowers`);
  const b = batch();
  const turned = (at: THREE.Vector3, turn: number) => new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, turn, 0)), new THREE.Vector3(1, 1, 1));
  for (let k = 0; k < 7; k++) {
    const turn = (k - 3) * 0.08 + (rng.next() - 0.5) * 0.05;
    b.add([0.32, 0.012, 0.012], "wraithDark", turned(new THREE.Vector3(0, 0.008 + k * 0.0021, 0), turn));
    // Each dead head turned its own way, so no two share a plane.
    const head = new THREE.Vector3(Math.cos(turn) * 0.17, 0.02 + k * 0.0023, -Math.sin(turn) * 0.17);
    b.add([0.04 + k * 0.002, 0.03, 0.04], pick(rng, ["boneDark", "ash", "stoneDark"] as PaletteKey[]), turned(head, turn + k * 0.4));
  }
  b.block([0.03, 0.02, 0.05], "bloodDark", [-0.04, 0.012, 0]);
  return group(b.mesh());
}

/** A candle burnt down to a stub in its own wax on the ledge, still burning low. */
function stub(height: number): () => THREE.Group {
  return function guttered() {
    return group(candle({ height, intensity: 1.1, range: 3.5, wax: "boneDark" }), box([0.08, 0.008, 0.07], flat("boneDark"), [0, 0, 0]));
  };
}

const BENCH_TOP = BENCH.top;

/** The Crypt: a stone sarcophagus in the middle of a vault walled with sealed
 *  burial niches, its lid shoved askew and a cold teal light welling out of
 *  it. By the bench a new pale tablet waits, its name half cut, the mason's
 *  tools put down beside it: a place made ready for whoever stays. */
export const CRYPT: RoomDefinition = {
  id: "crypt",
  floor: slabFloor,
  wall: () => flagstones({ ramp: ["soot", "sootLight", "ash", "stoneDark"], mortar: "void", stonePx: 8, seed: `${SEED}:wall` }),
  trim: "ash",
  props: [
    ...wallOfNiches("left", fillOf(7, [[0, 2], [2, 5]], "left")),
    ...wallOfNiches("right", fillOf(7, [[1, 3]], "right")),
    ...wallOfNiches("bottom", fillOf(6, [[0, 4], [1, 1]], "back")),
    { build: sarcophagus, at: TOMB_AT },
    { build: coldMist, at: TOMB_AT },
    { build: waitingTablet, at: TABLET_AT, turn: -90 },
    { build: masonsTools, at: [TABLET_AT[0] - 0.45, TABLET_AT[1] + 0.05], turn: 80 },
    { build: masonsCandle, at: [TABLET_AT[0] - 0.6, TABLET_AT[1] - 0.45] },
    { build: () => candle({ height: 0.07, intensity: 2.2, range: 6 }), name: "candle", at: [-INNER + LEDGE, -1.6], y: BENCH_TOP },
    { build: () => candle({ height: 0.16, intensity: 2.2, range: 6 }), name: "candle", at: [-1.3, INNER - LEDGE], y: BENCH_TOP },
    { build: stub(0.04), at: [-1.12, INNER - LEDGE], y: BENCH_TOP },
    { build: stub(0.03), at: [INNER - LEDGE, 1.4], y: BENCH_TOP },
    { build: urn, at: [1.2, INNER - LEDGE], y: BENCH_TOP },
    { build: urn, at: [-INNER + LEDGE, 0.9], y: BENCH_TOP },
    { build: deadFlowers, at: [0.3, INNER - LEDGE], y: BENCH_TOP, turn: 10 },
    { build: () => cobweb({ form: "slung" }), name: "cobweb", at: [-INNER + 0.29, INNER - 0.29], y: 3.05, turn: 45, walls: ["left", "bottom"] },
  ],
  focus: [-0.4, 0.7, 0.5],
  prime: [-1.3, -1.25],
};
