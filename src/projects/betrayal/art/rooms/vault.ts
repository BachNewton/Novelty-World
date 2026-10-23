import * as THREE from "three";
import { createRng, pick } from "@/shared/lib/seeded-random";
import { chamberstick, cobweb, oilLamp, rug } from "../kit";
import { solidLathe } from "../kit/vessel";
import { lightAnchor } from "../light-anchor";
import { paletteHex, type PaletteKey } from "../palette";
import { INNER, onWall, type PropPlacement, type RoomDefinition } from "../room";
import { batch, box, cylinder, flat, glow, group, lightMaterial } from "../shapes";
import { shiny, shinyBatch, SHINES } from "../shine";
import { bricks, pixelTexture } from "../textures";

const SEED = "vault";
const hex = paletteHex;

/** The vault: its lacquered iron body, standing on a stone plinth against the back wall. */
const VAULT = { width: 2.1, height: 1.62, depth: 1.2, plinth: 0.08 };
/** Its round doorway: the middle's height, the hole, the steel collar round it, and how deep the chamber goes. */
const DOORWAY = { y: (VAULT.plinth + VAULT.height) / 2, hole: 0.62, collar: 0.71, collarDepth: 0.05, chamber: 0.72 };
/** The chamber's steel lining, just inside the hole and clear of its face. */
const LINING = { inner: 0.612, outer: 0.618 };
/** The door: its radius, a seam's width inside the hole, and how far it has been forced out of its seat. */
const DOOR = { radius: 0.585, rim: 0.17, sprung: 0.07 };
/** The hinge drum's axis, beside the doorway on the right as you face it. */
const HINGE = { x: DOORWAY.collar + 0.11, z: VAULT.depth + 0.14 };
/** How far the vault's back stands off the back wall's face, clear of its skirting. */
const VAULT_OUT = 0.05;
/** The front of the vault in room metres (it stands against the bottom wall, facing the door). */
const VAULT_FRONT = INNER - VAULT_OUT - VAULT.depth;

/** Whether the vault is still shut, or has been opened and emptied (the Vault Empty token). */
export type VaultState = "shut" | "emptied";

/** Turns a lathe's axis from up to out along +z. */
function facingOut(mesh: THREE.Mesh): THREE.Mesh {
  mesh.geometry.rotateX(Math.PI / 2);
  return mesh;
}

/** A flat ring, from `inner` to `outer` radius, along +z from `z0` to `z1`. */
function collar(inner: number, outer: number, z0: number, z1: number, material: THREE.Material, sides = 28): THREE.Mesh {
  const ring = new THREE.LatheGeometry(
    [
      [inner, z0],
      [outer, z0],
      [outer, z1],
      [inner, z1],
      [inner, z0],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    sides,
  );
  return facingOut(new THREE.Mesh(ring, material));
}

/** The floor: square-cut stone flags a metre across, laid in a grid, each a flat tone, with the odd one cracked. */
function flagFloor(): THREE.Texture {
  const rng = createRng(`${SEED}:floor`);
  const [size, flag] = [64, 32];
  const grid = Array.from({ length: size }, () => Array<string>(size).fill("g"));
  for (let row = 0; row < size / flag; row++) {
    for (let column = 0; column < size / flag; column++) {
      const [top, left] = [row * flag, column * flag];
      const tone = pick(rng, ["s", "d", "s"]);
      for (let y = 1; y < flag; y++) for (let x = 1; x < flag; x++) grid[top + y][left + x] = y === flag - 1 || x === flag - 1 ? "a" : tone;
      if (row === column) {
        // A crack wandering corner to corner across the flag.
        let y = top + 4 + Math.floor(rng.next() * 6);
        for (let x = left + 3; x < left + flag - 4; x++) {
          grid[y][x] = "a";
          if (rng.next() < 0.45) y = Math.min(top + flag - 4, Math.max(top + 3, y + (rng.next() < 0.7 ? 1 : -1)));
        }
      }
    }
  }
  return pixelTexture(
    grid.map((row) => row.join("")),
    { g: "soot", a: "ash", d: "stoneDark", s: "stone" },
    true,
  );
}

/** Rows of rivet heads along a line, into a batch: from `a` to `b`, every `step`, standing out along `out`. */
function rivets(b: ReturnType<typeof batch>, a: THREE.Vector3, to: THREE.Vector3, step: number, out: THREE.Vector3, tint: PaletteKey = "stoneLight") {
  const count = Math.max(1, Math.round(a.distanceTo(to) / step));
  const size = 0.03;
  const turn = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), out);
  for (let k = 0; k <= count; k++) {
    const at = a.clone().lerp(to, k / count).addScaledVector(out, 0.008);
    b.add([size, size, size], tint, new THREE.Matrix4().compose(at, turn, new THREE.Vector3(1, 1, 1)));
  }
}

/**
 * The vault's body: a squat block of lacquered iron on a stone plinth, a
 * round doorway through its front into a steel-lined chamber, its edges
 * bound with steel angle and riveted bands. Its back stands at z = 0 and its
 * front faces +z.
 */
function vaultBody(): THREE.Group {
  const { width, height, depth, plinth } = VAULT;
  const lacquer = shiny(flat("blood"), SHINES.lacquer);
  const steel = shiny(flat("stone"), SHINES.pewter);
  // The body, its round doorway cut right through it: the chamber's back closes it inside.
  const outline = new THREE.Shape();
  outline.moveTo(-width / 2, plinth);
  outline.lineTo(width / 2, plinth);
  outline.lineTo(width / 2, height);
  outline.lineTo(-width / 2, height);
  outline.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, DOORWAY.y, DOORWAY.hole, 0, Math.PI * 2, true);
  outline.holes.push(hole);
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(outline, { depth, bevelEnabled: false, curveSegments: 28 }), lacquer);
  const result = group(
    box([width + 0.14, plinth, depth + 0.08], flat("stoneDark"), [0, 0, (depth + 0.08) / 2]),
    body,
    // The steel collar round the doorway, a little inside its edge so the two never share a face.
    collar(DOORWAY.hole + 0.005, DOORWAY.collar, depth - 0.01, depth + DOORWAY.collarDepth, steel),
  );
  result.children[2].position.y = DOORWAY.y;
  // The chamber: a steel lining just inside the hole, and its back.
  const lining = collar(LINING.inner, LINING.outer, depth - DOORWAY.chamber, depth - 0.02, flat("ash"));
  lining.position.y = DOORWAY.y;
  const back = facingOut(cylinder(LINING.inner - 0.001, 0.02, flat("sootLight"), [0, depth - DOORWAY.chamber - 0.02, 0], { sides: 28 }));
  back.position.y = DOORWAY.y;
  result.add(lining, back);
  // Steel angle down the four upright edges and round the top, standing proud of the lacquer.
  const bands = batch();
  const angle = 0.09;
  for (const x of [-1, 1]) {
    for (const z of [0.03, depth]) bands.block([angle, height - plinth + 0.005, angle], "stone", [x * (width / 2), plinth, z]);
  }
  for (const z of [0.03, depth]) bands.block([width - angle + 0.004, 0.08, 0.05], "stone", [0, height - 0.07, z]);
  for (const x of [-1, 1]) bands.block([0.05, 0.08, depth - angle - 0.03], "stone", [x * (width / 2), height - 0.07, depth / 2 + 0.015]);
  // A band across the top and down the back between plates.
  bands.block([0.07, 0.012, depth - 0.1], "stone", [0, height, depth / 2 + 0.02]);
  bands.block([0.07, height - plinth - 0.16, 0.012], "stone", [0, plinth + 0.04, -0.006]);
  result.add(shinyBatch(bands, SHINES.pewter));
  // Rivets along every band.
  const heads = batch();
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const front = depth + angle / 2;
  for (const x of [-1, 1]) {
    const edge = x * (width / 2 - 0.01);
    rivets(heads, v(edge, plinth + 0.1, front), v(edge, height - 0.12, front), 0.13, v(0, 0, 1));
    rivets(heads, v(x * (width / 2 + angle / 2), plinth + 0.1, depth - 0.02), v(x * (width / 2 + angle / 2), height - 0.12, depth - 0.02), 0.13, v(x, 0, 0));
    rivets(heads, v(x * (width / 2 + angle / 2), plinth + 0.1, 0.04), v(x * (width / 2 + angle / 2), height - 0.12, 0.04), 0.13, v(x, 0, 0));
  }
  rivets(heads, v(-width / 2 + 0.1, height + 0.012, depth - 0.02), v(width / 2 - 0.1, height + 0.012, depth - 0.02), 0.13, v(0, 1, 0));
  rivets(heads, v(-width / 2 + 0.1, height + 0.012, 0.035), v(width / 2 - 0.1, height + 0.012, 0.035), 0.13, v(0, 1, 0));
  rivets(heads, v(0, height + 0.012, 0.14), v(0, height + 0.012, depth - 0.12), 0.13, v(0, 1, 0));
  rivets(heads, v(0, plinth + 0.08, -0.012), v(0, height - 0.16, -0.012), 0.13, v(0, 0, -1));
  result.add(shinyBatch(heads, SHINES.pewter));
  return result;
}

/** The door's bolts, round its face: which are gone, sheared off and lying on the floor. */
const BOLTS = 14;
const SHEARED = [1, 2, 6, 11];

/**
 * The round steel door, its face domed out, a ring of heavy bolts round it
 * and a brass wheel and combination dial in the middle. Built in its own
 * frame: its seat's centre at the origin, its face looking +z, its back at
 * z = 0.
 */
function door(): THREE.Group {
  const steel = shiny(flat("stone"), SHINES.pewter);
  // Smooth-shaded, so the dome's facets don't break it into dark wedges.
  const face = shiny(new THREE.MeshLambertMaterial({ color: hex("stone") }), SHINES.pewter);
  const brass = shiny(flat("brass"), SHINES.brass);
  const r = DOOR.radius;
  const dome = facingOut(
    solidLathe(
      [
        [r, 0],
        [r, DOOR.rim],
        [r - 0.04, DOOR.rim + 0.02],
        [0.42, DOOR.rim + 0.04],
        [0.2, DOOR.rim + 0.08],
        [0, DOOR.rim + 0.09],
      ],
      face,
      28,
    ),
  );
  const result = group(dome);
  const bolts = batch();
  for (let k = 0; k < BOLTS; k++) {
    if (SHEARED.includes(k)) continue;
    const a = (k / BOLTS) * Math.PI * 2;
    bolts.add([0.06, 0.06, 0.04], "stoneLight", new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * 0.5, Math.sin(a) * 0.5, DOOR.rim + 0.045), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a + Math.PI / 4), new THREE.Vector3(1, 1, 1)));
  }
  // Where the sheared bolts were: their broken stubs, dark.
  for (const k of SHEARED) {
    const a = (k / BOLTS) * Math.PI * 2;
    bolts.add([0.045, 0.045, 0.02], "sootLight", new THREE.Matrix4().makeTranslation(Math.cos(a) * 0.5, Math.sin(a) * 0.5, DOOR.rim + 0.04));
  }
  result.add(shinyBatch(bolts, SHINES.pewter));
  // The wheel: a hub on its spindle, six spokes and a rim, knocked a little out of true.
  const wheel = group();
  const front = DOOR.rim + 0.09;
  wheel.add(facingOut(cylinder(0.06, 0.12, brass, [0, 0, 0], { sides: 10 })));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.028, 6, 24), brass);
  rim.position.z = 0.1;
  wheel.add(rim);
  for (let k = 0; k < 6; k++) {
    const spoke = box([0.03, 0.27, 0.03], brass, [0, 0, 0.1 - 0.015]);
    spoke.rotation.z = (k / 6) * Math.PI * 2;
    wheel.add(spoke);
  }
  wheel.position.z = front - 0.01;
  // Its spokes' shadows, thrown by the seam's light from just below, read as dark wedges cut in the dome.
  wheel.traverse((piece) => (piece.userData.noShadow = true));
  wheel.rotation.set(0.09, -0.06, 0.2);
  result.add(wheel);
  // The combination dial, below the wheel.
  const dial = group(
    facingOut(cylinder(0.1, 0.03, steel, [0, 0, 0], { sides: 16 })),
    facingOut(cylinder(0.075, 0.035, brass, [0, 0.025, 0], { sides: 16 })),
    box([0.015, 0.05, 0.02], flat("sootLight"), [0, 0.03, 0.055]),
  );
  dial.position.set(0, -0.42, DOOR.rim + 0.03);
  result.add(dial);
  // The two hinge arms out to the drum on the right.
  for (const y of [0.3, -0.3]) result.add(box([HINGE.x - 0.3, 0.09, 0.05], steel, [(HINGE.x + 0.3) / 2 - 0.02, y - 0.045, 0.125]));
  return result;
}

/** The hinge drum the door hangs from: a tall steel cylinder with brass caps, upright. */
function hingeDrum(): THREE.Group {
  const steel = shiny(flat("stone"), SHINES.pewter);
  const brass = shiny(flat("brass"), SHINES.brass);
  const tall = 0.9;
  return group(cylinder(0.075, tall, steel, [0, -tall / 2, 0], { sides: 12 }), cylinder(0.085, 0.04, brass, [0, tall / 2, 0], { sides: 12 }), cylinder(0.085, 0.04, brass, [0, -tall / 2 - 0.04, 0], { sides: 12 }));
}

/**
 * The red of something shut inside, leaking out where the door has been
 * forced from its seat: the hole's back aglow behind the door, a bloom of
 * it round the seam on the vault's face, and a pool on the floor before it.
 * In the vault's frame.
 */
function seamGlow(): THREE.Group {
  const { depth } = VAULT;
  const behind = facingOut(cylinder(LINING.inner - 0.001, 0.01, glow("scarlet"), [0, depth - 0.21, 0], { sides: 28 }));
  behind.position.y = DOORWAY.y;
  const bloom = new THREE.RingGeometry(DOOR.radius - 0.01, DOORWAY.collar + 0.16, 32, 3);
  const red = new THREE.Color(hex("scarlet"));
  const colours: number[] = [];
  const position = bloom.getAttribute("position");
  for (let i = 0; i < position.count; i++) {
    const out = (Math.hypot(position.getX(i), position.getY(i)) - DOOR.radius) / (DOORWAY.collar + 0.16 - DOOR.radius);
    colours.push(...red.clone().multiplyScalar(Math.pow(Math.max(0, 1 - out), 2)).toArray());
  }
  bloom.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
  const halo = new THREE.Mesh(bloom, lightMaterial(0.8, { vertexColors: true }));
  halo.position.set(0, DOORWAY.y, depth + DOORWAY.collarDepth + 0.012);
  // The pool on the floor, spreading from the door's foot.
  const [w, d] = [2.6, 1.8];
  const floor = new THREE.PlaneGeometry(w, d, 26, 18).rotateX(-Math.PI / 2);
  const fp = floor.getAttribute("position");
  const pool: number[] = [];
  for (let i = 0; i < fp.count; i++) {
    const out = Math.hypot(fp.getX(i) / (w / 2), (fp.getZ(i) + d / 2) / d);
    pool.push(...red.clone().multiplyScalar(Math.pow(Math.max(0, 1 - out), 2)).toArray());
  }
  floor.setAttribute("color", new THREE.Float32BufferAttribute(pool, 3));
  const spill = new THREE.Mesh(floor, lightMaterial(0.35, { vertexColors: true }));
  spill.position.set(0, 0.012, depth + 0.04 + d / 2);
  const result = group(behind, halo, spill);
  result.traverse((piece) => (piece.userData.noShadow = true));
  result.add(lightAnchor({ colour: "scarlet", intensity: 4.2, range: 6, kind: "glow" }, [0, 0.35, depth + 0.45]));
  return result;
}

/**
 * The vault, shut or emptied: its body, and its door forced out of its seat
 * with red leaking round it; or the door swung wide on its hinge and the
 * chamber bare. Back at z = 0, faces +z.
 */
function vault(state: VaultState): () => THREE.Group {
  return function strongroom() {
    const result = group(vaultBody());
    const drum = hingeDrum();
    drum.position.set(HINGE.x, DOORWAY.y, HINGE.z);
    result.add(drum);
    const swing = group(door());
    const seat = VAULT.depth - 0.12 + DOOR.sprung;
    if (state === "shut") {
      swing.position.set(0, DOORWAY.y, seat);
      result.add(swing, seamGlow());
    } else {
      // Swung open about the drum, out into the room to the right.
      const hung = group(swing);
      swing.position.set(-HINGE.x, 0, seat - HINGE.z);
      hung.position.set(HINGE.x, DOORWAY.y, HINGE.z);
      hung.rotation.y = 1.6;
      result.add(hung);
    }
    return result;
  };
}

/** The bolts sheared off the door, lying where they flew: steel stubs on the floor. Spread over a metre or so. */
function shearedBolts(): THREE.Group {
  const rng = createRng(`${SEED}:bolts`);
  const steel = shiny(flat("stoneLight"), SHINES.pewter);
  const result = group();
  const spots: [number, number][] = [
    [-0.55, 0.15],
    [0.25, 0.45],
    [0.75, -0.1],
    [-0.15, 0.6],
  ];
  for (const [x, z] of spots) {
    const bolt = group(cylinder(0.022, 0.12, flat("stoneDark"), [0, 0, 0], { sides: 6 }), box([0.06, 0.04, 0.06], steel, [0, 0.12, 0]));
    bolt.rotation.z = Math.PI / 2;
    bolt.position.set(x, 0.03, z);
    bolt.rotation.y = rng.next() * Math.PI;
    result.add(bolt);
  }
  return result;
}

/**
 * A clerk's high desk against the wall: a sloped writing lid on a cupboard
 * carcass, a flat ledge behind for the lamp, the vault's ledger lying open on
 * the slope. Faces +z: you write facing -z.
 */
function clerksDesk(): THREE.Group {
  const wood = shiny(flat("wood"), SHINES.polishedWood);
  const dark = shiny(flat("woodDark"), SHINES.polishedWood);
  const [width, depth, carcass] = [1.2, 0.74, 0.86];
  const shelf = 0.3;
  const result = group(
    box([width, 0.08, depth - 0.04], flat("woodDark"), [0, 0, depth / 2]),
    box([width, carcass - 0.08, depth], wood, [0, 0.08, depth / 2]),
    // The flat ledge at the back.
    box([width + 0.04, 0.04, shelf], dark, [0, carcass + 0.16, shelf / 2]),
    box([width, 0.16, shelf - 0.04], wood, [0, carcass, (shelf - 0.04) / 2]),
  );
  // The slope, falling towards you.
  const lid = box([width + 0.04, 0.035, depth - shelf], dark, [0, 0, (depth - shelf) / 2]);
  lid.position.set(0, carcass + 0.15, shelf);
  lid.rotation.x = 0.28;
  result.add(lid);
  // The ledger, open on the slope: pale pages, its spine across the slope.
  const ledger = group(
    box([0.56, 0.02, 0.34], flat("blood"), [0, 0, 0]),
    box([0.25, 0.016, 0.31], flat("bone"), [-0.135, 0.02, 0]),
    box([0.25, 0.016, 0.31], flat("boneLight"), [0.135, 0.02, 0]),
  );
  ledger.position.set(0.08, carcass + 0.15 + 0.035 - Math.sin(0.28) * 0.21, shelf + 0.21);
  ledger.rotation.x = 0.28;
  result.add(ledger);
  return result;
}

/** A tall clerk's stool, on four splayed legs. Base at y = 0. */
function stool(): THREE.Group {
  const wood = flat("woodMid");
  const result = group(cylinder(0.18, 0.05, shiny(flat("wood"), SHINES.polishedWood), [0, 0.72, 0], { sides: 10 }));
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const leg = box([0.035, 0.74, 0.035], wood, [0, 0, 0]);
    leg.position.set(Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12);
    leg.rotation.set(Math.sin(a) * -0.09, 0, Math.cos(a) * 0.09);
    result.add(leg);
  }
  result.add(box([0.24, 0.025, 0.025], wood, [0, 0.25, 0]), box([0.025, 0.025, 0.24], wood, [0, 0.3, 0]));
  return result;
}

/**
 * A stack of black japanned deed boxes, each with a pale name card in a
 * frame on its front, some set askew. `count` boxes high, a chamberstick
 * burning on top when `lit`. Faces +z.
 */
function deedBoxes(count: number, seed: string, lit = false): () => THREE.Group {
  return function deedStack() {
    const rng = createRng(`${SEED}:deeds:${seed}`);
    const japan = shiny(flat("ash"), SHINES.lacquer);
    const result = group();
    let y = 0;
    for (let k = 0; k < count; k++) {
      const [w, h, d] = [0.46 - rng.next() * 0.06, 0.26 + rng.next() * 0.05, 0.34];
      const piece = group(
        box([w, h, d], japan, [0, 0, 0]),
        box([w + 0.012, 0.03, d + 0.012], japan, [0, h - 0.045, 0]),
        box([0.14, 0.08, 0.01], flat("brass"), [0, h * 0.4, d / 2 + 0.004]),
        box([0.11, 0.055, 0.01], flat("bone"), [0, h * 0.4 + 0.012, d / 2 + 0.008]),
        box([0.08, 0.02, 0.03], flat("brass"), [0, h + 0.002, 0]),
      );
      piece.position.y = y;
      piece.rotation.y = (rng.next() - 0.5) * 0.25;
      result.add(piece);
      y += h + 0.004;
    }
    if (lit) {
      const light = chamberstick({ intensity: 3.4, range: 7 });
      light.position.set(-0.12, y - 0.003, 0.02);
      result.add(light);
    }
    return result;
  };
}

/** The Vault's room, in one of its states: shut, red leaking from the forced door, or opened and emptied. */
function vaultRoom(state: VaultState): RoomDefinition {
  const props: PropPlacement[] = [
    { build: vault(state), ...onWall("bottom", 0, { out: VAULT_OUT }) },
    { build: () => rug({ width: 1.0, length: 3.1, field: "woodMid", border: "woodDark", motif: "wood", fringe: "boneDark" }), name: "drugget", at: [0, -1.1] },
    { build: clerksDesk, ...onWall("left", 1.15) },
    { build: stool, at: [-INNER + 1.0, -1.35] },
    { build: deedBoxes(4, "a"), ...onWall("right", 0.9, { out: 0.2 }) },
    { build: deedBoxes(3, "b", true), ...onWall("right", 1.45, { out: 0.2 }) },
    { build: deedBoxes(2, "c"), ...onWall("right", 0.3, { out: 0.22 }) },
    { build: () => cobweb({ form: "slung" }), name: "cobweb", at: [-INNER + 0.29, -INNER + 0.29], y: 3.05, turn: 135, walls: ["left", "top"] },
  ];
  props.push({ build: () => oilLamp({ intensity: 4.2, range: 8 }), name: "oil lamp", at: [-INNER + 0.17, -0.8], y: 1.06, turn: 90 });
  if (state === "shut") props.push({ build: shearedBolts, at: [0.1, VAULT_FRONT - 1.0] });
  return {
    id: "vault",
    floor: flagFloor,
    wall: () => bricks({ ramp: ["moonDark", "ash", "stoneDark", "stone"], mortar: "soot", wear: 0.2, seed: `${SEED}:wall` }),
    wainscot: () => bricks({ ramp: ["void", "soot", "sootLight", "ash"], mortar: "void", wear: 0.15, seed: `${SEED}:dado` }),
    trim: "stoneDark",
    props,
    focus: [0, 0.8, VAULT_FRONT],
    prime: [-1.35, -0.2],
    keepClear: [{ from: [0, VAULT_FRONT - 0.3], to: [0, VAULT_FRONT - 1.0], radius: 0.55 }],
  };
}

/** The Vault: a squat strongroom of lacquered iron against the back wall, its
 *  round steel door forced a hand's breadth out of its seat from inside, its
 *  bolts sheared and scattered, and red leaking round the seam onto the floor;
 *  a clerk's desk and its lamp, and the deed boxes, keep to the walls. */
export const VAULT_ROOM = vaultRoom("shut");

/** The Vault once opened and emptied: the door swung wide, the chamber bare and dark. */
export const VAULT_EMPTIED = vaultRoom("emptied");
