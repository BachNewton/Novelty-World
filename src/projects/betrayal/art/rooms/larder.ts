import * as THREE from "three";
import { createRng, pick, uniform } from "@/shared/lib/seeded-random";
import { cask, cobweb } from "../kit";
import { solidLathe, vessel } from "../kit/vessel";
import { lightAnchor } from "../light-anchor";
import type { PaletteKey } from "../palette";
import { CUT_HEIGHT, INNER, onWall, type PropPlacement, type RoomDefinition } from "../room";
import { batch, box, cylinder, flat, glow, group } from "../shapes";
import { shiny, shinyBatch, SHINES } from "../shine";
import { flagstones, pixelTexture, plaster } from "../textures";

const SEED = "larder";

/** The cold slab along the left wall: how far along the wall its middle is, its length, depth and height. */
const THRALL = { along: 0.4, length: 4.2, depth: 0.62, height: 0.85, slab: 0.07 };
/** The low slate shelf under the slab. */
const UNDER = 0.22;

/** A piece holding a light, or glowing, must not throw a shadow over it. */
function noShadows<T extends THREE.Object3D>(object: T): T {
  object.traverse((child) => {
    child.userData.noShadow = true;
  });
  return object;
}

/** A place on the slab's top, `u` metres along it (positive towards the top wall) and `v` out from the wall, in room metres. */
function onSlab(u: number, v: number): Pick<PropPlacement, "at" | "y" | "turn"> {
  return { at: [-INNER + v, -(THRALL.along + u)], y: THRALL.height, turn: 90 };
}

/** Red quarry tiles, square, in dark grout, some darker where they have worn. */
function quarryTiles(): THREE.Texture {
  const size = 64;
  const tile = 8;
  const rng = createRng(`${SEED}:tiles`);
  const shades = Array.from({ length: (size / tile) ** 2 }, () => (rng.next() < 0.4 ? "d" : "b"));
  const rows = Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => {
      if (x % tile === 0 || y % tile === 0) return "g";
      return shades[Math.floor(y / tile) * (size / tile) + Math.floor(x / tile)];
    }).join(""),
  );
  return pixelTexture(rows, { g: "woodDark", d: "brickDark", b: "brick" }, true);
}

/**
 * A wheel of `radius` and `height` with a bite out of its rim at `angle`
 * (radians round from +x): three tooth-round scallops, as a closed solid.
 * Its top and bottom are `top`, its rind and the bitten face `side`. Stands on y = 0.
 */
function bitten(radius: number, height: number, top: THREE.Material, side: THREE.Material, angle = 0, bite = 0.3): THREE.Mesh {
  const steps = 48;
  const half = bite / 2;
  const points = Array.from({ length: steps }, (_, i) => {
    const theta = (i / steps) * Math.PI * 2;
    const off = Math.atan2(Math.sin(theta - angle), Math.cos(theta - angle));
    // Three scallops across the bite, each a round tooth mark.
    const inBite = Math.abs(off) < half ? Math.sin(((off + half) / bite) * Math.PI * 3) : 0;
    const r = radius - (Math.abs(off) < half ? radius * 0.22 * (0.55 + 0.45 * Math.abs(inBite)) : 0);
    return new THREE.Vector2(Math.cos(theta) * r, Math.sin(theta) * r);
  });
  const geometry = new THREE.ExtrudeGeometry(new THREE.Shape(points), { depth: height, bevelEnabled: false, curveSegments: 1 });
  geometry.rotateX(-Math.PI / 2);
  return new THREE.Mesh(geometry, [top, side]);
}

/** Jam, honey and marmalade colours: the fire ramp, which glows. */
const GLOWING: readonly PaletteKey[] = ["ember", "amber", "amber", "flame"];
/** Pickles and dark fruit in plain glass, which don't. */
const DARK_FILLS: readonly PaletteKey[] = ["bloodDark", "woodMid", "verdigrisDark", "bruise"];

/**
 * Preserving jars bunched along x, `length` long, two rows deep, of mixed
 * sizes, with brass lids; `glowing` of every ten glow from inside their own
 * filling. Base at y = 0, its back row at z = 0.
 */
function jars(length: number, seed: string, glowing: number): THREE.Group {
  const rng = createRng(`${SEED}:jars:${seed}`);
  const glass = new Map<PaletteKey, THREE.Material>();
  const lid = shiny(flat("brass"), SHINES.tarnishedBrass);
  const result = group();
  for (const [row, z] of [[0, 0.07], [1, 0.19]] as const) {
    for (let x = -length / 2 + 0.06 + row * 0.04; x < length / 2 - 0.06; ) {
      const r = 0.045 + rng.next() * 0.025;
      if (rng.next() < 0.1) {
        x += r * 2 + 0.02;
        continue;
      }
      const h = (row === 0 ? 0.16 : 0.11) + rng.next() * 0.08;
      const lit = rng.next() * 10 < glowing;
      const fill = pick(rng, lit ? GLOWING : DARK_FILLS);
      let material = glass.get(fill);
      if (!material) glass.set(fill, (material = lit ? glow(fill) : shiny(flat(fill), SHINES.glass)));
      const at: [number, number, number] = [x + r, 0, z + uniform(rng, -0.015, 0.015)];
      result.add(cylinder(r, h, material, at, { sides: 8 }), cylinder(r * 0.82, 0.03, lid, [at[0], h - 0.004, at[2]], { sides: 8 }));
      x += r * 2 + 0.015 + rng.next() * 0.02;
    }
  }
  return result;
}

/**
 * A bunch of jars of preserves on the slab, glowing amber from inside as if
 * the summer they were put up in were sealed in with them, nothing lit
 * behind them: one of the room's lights. Back to the wall at z = 0, faces +z.
 */
function glowingJars({ length = 0.5, seed, intensity = 4 }: { length?: number; seed: string; intensity?: number }): THREE.Group {
  const result = jars(length, seed, 8);
  result.add(lightAnchor({ colour: "amber", intensity, range: 7, kind: "glow" }, [0, 0.42, 0.22]));
  return noShadows(result);
}

/**
 * The thrall: a long slab of slate on brick piers along the wall, the cold
 * shelf a larder keeps its food on, a second slate shelf under it stood with
 * stoneware crocks and spare cheeses. Back to the wall at z = 0, faces +z.
 */
function thrall(): THREE.Group {
  const { length, depth, height, slab } = THRALL;
  const b = batch();
  b.block([length, slab, depth], "ash", [0, height - slab, depth / 2]);
  b.block([length - 0.04, 0.05, depth - 0.06], "ash", [0, UNDER, (depth - 0.06) / 2]);
  for (const x of [-length / 2 + 0.14, -0.7, 0.7, length / 2 - 0.14]) {
    b.block([0.26, height - slab, depth - 0.04], "brick", [x, 0, (depth - 0.04) / 2]);
  }
  // A darker front edge along the slab, standing a little proud.
  b.block([length + 0.02, 0.05, 0.03], "soot", [0, height - slab + 0.01, depth + 0.004]);
  const result = group(b.mesh());
  const glaze = (colour: PaletteKey) => shiny(flat(colour), SHINES.glazedChina);
  const crocks: [number, number, number, PaletteKey][] = [
    [-1.75, 0.16, 0.36, "woodMid"],
    [-1.35, 0.13, 0.3, "brass"],
    [-0.35, 0.18, 0.42, "woodMid"],
    [0.05, 0.12, 0.28, "boneDark"],
    [1.05, 0.15, 0.38, "brass"],
    [1.75, 0.13, 0.3, "woodMid"],
  ];
  for (const [x, r, h, colour] of crocks) {
    const crock = solidLathe([[r * 0.8, 0], [r, h * 0.2], [r, h * 0.75], [r * 0.75, h * 0.92], [r * 0.78, h]], glaze(colour), 10);
    crock.position.set(x, UNDER + 0.05, depth / 2 - 0.02);
    // A dark lid of slate on the open ones.
    const cover = cylinder(r * 0.8, 0.025, flat("soot"), [x, UNDER + 0.05 + h, depth / 2 - 0.02], { sides: 10 });
    result.add(crock, cover);
  }
  // Two spare cheeses lying under the slab, between the crocks.
  for (const [x, r] of [[0.45, 0.17], [-0.95, 0.19]] as const) {
    result.add(bitten(r, 0.13, flat("bone"), flat("brass"), 0, 0).translateX(x).translateY(UNDER + 0.05).translateZ(depth / 2));
  }
  return result;
}

/** The cold slab's shelving above the cut height, hung on the wall: two slate shelves on iron brackets, more jars on each, some glowing. Base at the cut height; faces +z. */
function shelvesAbove(): THREE.Group {
  const length = 3.2;
  const depth = 0.3;
  const iron = batch();
  const slate = batch();
  const result = group();
  [1.05, 1.5].forEach((y, i) => {
    slate.block([length, 0.04, depth], "ash", [0, y, depth / 2]);
    for (const x of [-length / 2 + 0.2, 0, length / 2 - 0.2]) iron.block([0.03, 0.2, depth - 0.04], "soot", [x, y - 0.2, (depth - 0.04) / 2]);
    const row = jars(length - 0.1, `above-${i}`, 4);
    row.position.set(0, y + 0.04, 0.0);
    result.add(row);
  });
  result.add(slate.mesh(), shinyBatch(iron, SHINES.iron));
  result.add(lightAnchor({ colour: "amber", intensity: 1.8, range: 6, kind: "glow" }, [0, 1.3, 0.35]));
  return noShadows(result);
}

/** A great wheel of cheese, and a smaller one stood on it. Stands on y = 0. */
function cheeses(): THREE.Group {
  return group(
    bitten(0.22, 0.15, flat("bone"), flat("brass"), 0, 0),
    bitten(0.18, 0.13, flat("bone"), flat("brass"), 0, 0).translateY(0.15).translateX(0.02),
  );
}

/** A wheel of cheese on its board, with a bite taken out of it, tooth marks and all, facing +z. */
function bittenCheese(): THREE.Group {
  const board = box([0.56, 0.03, 0.4], flat("woodLight"));
  return group(board, bitten(0.2, 0.14, flat("bone"), flat("brass"), Math.PI / 2, 0.75).translateY(0.03));
}

/** A raised pork pie, its crust crimped round the lid, a bite out of its side towards +z. Stands on y = 0. */
function pie(): THREE.Group {
  const crust = flat("woodLight");
  return group(bitten(0.12, 0.11, flat("woodMid"), crust, Math.PI / 2, 0.8), bitten(0.125, 0.02, crust, flat("woodMid"), Math.PI / 2, 0.8).translateY(0.11));
}

/** A cured ham lying on its board, the knuckle bone towards +x. Stands on y = 0. */
function ham(): THREE.Group {
  const meat = solidLathe([[0.02, 0], [0.08, 0.03], [0.14, 0.12], [0.15, 0.2], [0.11, 0.3], [0.05, 0.37], [0.03, 0.4]], flat("brickLight"), 10);
  meat.geometry.rotateZ(-Math.PI / 2);
  meat.scale.set(1, 0.75, 1);
  meat.position.set(-0.2, 0.03 + 0.15 * 0.75, 0);
  const knuckle = cylinder(0.025, 0.08, flat("boneLight"), [0, 0, 0], { sides: 6 });
  knuckle.geometry.rotateZ(-Math.PI / 2);
  knuckle.position.set(0.18, 0.03 + 0.15 * 0.75, 0);
  return group(box([0.62, 0.03, 0.36], flat("woodLight")), meat, knuckle);
}

/** A stoneware bowl of eggs. Stands on y = 0. */
function eggBowl(): THREE.Group {
  const bowl = vessel([[0.07, 0], [0.12, 0.04], [0.14, 0.09]], shiny(flat("boneDark"), SHINES.glazedChina), { wall: 0.012, depth: 0.07, sides: 10 });
  const result = group(bowl);
  const egg = flat("bone");
  const rng = createRng(`${SEED}:eggs`);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.03, 1), egg);
    shell.scale.set(1, 1.3, 1);
    shell.position.set(Math.cos(a) * 0.055, 0.075 + rng.next() * 0.015, Math.sin(a) * 0.055);
    result.add(shell);
  }
  return result;
}

/** A slatted rack of apple trays against the wall, apples laid out not touching, one bitten; a bunch of glowing jars on its top board. Back to the wall at z = 0, faces +z. */
function appleRack(): THREE.Group {
  const length = 1.3;
  const depth = 0.5;
  const top = 1.0;
  const b = batch();
  for (const x of [-length / 2 + 0.03, length / 2 - 0.03]) for (const z of [0.03, depth - 0.03]) b.block([0.05, top + 0.03, 0.05], "woodDark", [x, 0, z]);
  const trays = [0.12, 0.37, 0.62];
  for (const y of [...trays, top - 0.03]) {
    for (let k = 0; k < 5; k++) b.block([length - 0.1, 0.02, 0.07], k % 2 ? "woodMid" : "wood", [0, y, 0.06 + k * 0.095]);
    for (const z of [0.03, depth - 0.03]) b.block([length - 0.08, 0.05, 0.03], "woodDark", [0, y - 0.02, z]);
  }
  const result = group(b.mesh());
  const rng = createRng(`${SEED}:apples`);
  const skins: readonly PaletteKey[] = ["bloodLight", "blood", "wraith", "bloodLight", "brass"];
  const materials = new Map<PaletteKey, THREE.Material>();
  trays.forEach((y, t) => {
    for (let i = 0; i < 9; i++) {
      for (let j = 0; j < 3; j++) {
        if (rng.next() < 0.18) continue;
        const skin = pick(rng, skins);
        let material = materials.get(skin);
        if (!material) materials.set(skin, (material = flat(skin)));
        const apple = new THREE.Mesh(new THREE.IcosahedronGeometry(0.045, 0), material);
        apple.position.set(-length / 2 + 0.12 + i * 0.133 + uniform(rng, -0.01, 0.01), y + 0.02 + 0.04, 0.1 + j * 0.15);
        apple.rotation.set(rng.next() * 3, rng.next() * 3, 0);
        result.add(apple);
        if (t === 2 && i === 4 && j === 2) {
          // One bitten, its white flesh showing towards the room.
          result.add(cylinder(0.03, 0.01, flat("boneLight"), [apple.position.x, apple.position.y, apple.position.z + 0.036], { sides: 6 }).rotateX(Math.PI / 2));
        }
      }
    }
  });
  const jarsOnTop = glowingJars({ length: 0.9, seed: "rack", intensity: 3 });
  jarsOnTop.position.set(0, top, 0.08);
  result.add(jarsOnTop);
  return result;
}

/** A tall wooden butter churn hooped in iron, its dasher standing up out of the lid. Stands on y = 0. */
function churn(): THREE.Group {
  const hoop = shiny(flat("soot"), SHINES.iron);
  return group(
    cylinder(0.17, 0.72, flat("woodMid"), [0, 0, 0], { top: 0.13, sides: 10 }),
    cylinder(0.182, 0.035, hoop, [0, 0.1, 0], { top: 0.178, sides: 10 }),
    cylinder(0.152, 0.035, hoop, [0, 0.58, 0], { top: 0.148, sides: 10 }),
    cylinder(0.12, 0.03, flat("woodLight"), [0, 0.72, 0], { sides: 10 }),
    cylinder(0.018, 0.5, flat("woodLight"), [0, 0.75, 0], { sides: 6 }),
    box([0.12, 0.025, 0.025], flat("woodLight"), [0, 1.22, 0]),
  );
}

/** The Larder: a cellar kept cold, blue-washed against the flies, with a long
 *  slate thrall down one wall heaped with cheeses, a ham, a pie and eggs,
 *  and every jar of preserves on it glowing amber from inside, lit by nothing.
 *  And everything has had one bite taken out of it. */
export const LARDER: RoomDefinition = {
  id: "larder",
  floor: quarryTiles,
  wall: () => plaster({ ramp: ["moon", "moon", "moon"], seed: SEED }),
  wainscot: () => flagstones({ ramp: ["soot", "sootLight", "ash", "stoneDark"], mortar: "void", stonePx: 16, seed: `${SEED}:dado` }),
  trim: "stoneDark",
  props: [
    { build: thrall, ...onWall("left", THRALL.along, { out: 0.01 }) },
    { build: shelvesAbove, ...onWall("left", THRALL.along, { y: CUT_HEIGHT, out: 0.01 }) },
    { build: () => glowingJars({ seed: "a" }), name: "glowingJars", ...onSlab(1.55, 0.03) },
    { build: cheeses, ...onSlab(0.85, 0.34) },
    { build: () => glowingJars({ seed: "b", length: 0.6 }), name: "glowingJars", ...onSlab(0.05, 0.03) },
    { build: pie, ...onSlab(-0.05, 0.47) },
    { build: bittenCheese, ...onSlab(-0.7, 0.36) },
    { build: () => glowingJars({ seed: "c" }), name: "glowingJars", ...onSlab(-1.45, 0.03) },
    { build: ham, ...onSlab(-1.45, 0.47) },
    { build: eggBowl, ...onSlab(1.65, 0.45) },
    { build: appleRack, ...onWall("right", -1.5, { out: 0.01 }) },
    { build: () => cask({ radius: 0.26, height: 0.78 }), name: "flourCask", at: [2.45, -2.45] },
    { build: churn, at: [-2.45, 2.35] },
    { build: () => cobweb({ form: "slung" }), name: "cobweb", at: [INNER - 0.29, -(INNER - 0.29)], y: 3.05, turn: -45, walls: ["right", "top"] },
  ],
  focus: [-2.0, 0.9, -0.3],
  prime: [1.0, 0.4],
  // In front of the thrall, so no figure stands between the player and the glowing slab.
  keepClear: [{ from: [-1.85, -1.6], to: [-1.85, 0.9], radius: 0.3 }],
};
