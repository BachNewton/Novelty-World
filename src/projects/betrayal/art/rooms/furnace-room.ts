import * as THREE from "three";
import { createRng, pick } from "@/shared/lib/seeded-random";
import { animated } from "../animate";
import { cobweb, crate } from "../kit";
import { lightAnchor } from "../light-anchor";
import { flickerOf, flickerSignal } from "../lighting";
import type { PaletteKey } from "../palette";
import { INNER, onWall, type RoomDefinition } from "../room";
import { batch, box, cylinder, flat, glow, group, lathe, lightMaterial, pixelPlane } from "../shapes";
import { bricks, flagstones, pixelTexture } from "../textures";

/** Where the furnace stands, its fire-door turned across the room to the far
 *  corner, so the fire shows from the front or the side in every view. */
const FURNACE: [x: number, z: number] = [1.35, -0.45];
/** The furnace's iron belly. */
const BODY = 0.66;
/** Height of the collar the ducts rise from. */
const COLLAR = 1.5;

/** A straight round pipe from one point to another. */
function pipe(from: THREE.Vector3, to: THREE.Vector3, radius: number, material: THREE.Material, sides = 8): THREE.Mesh {
  const along = to.clone().sub(from);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, along.length(), sides), material);
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), along.normalize());
  return mesh;
}

/** A flame tongue whose height wavers with the fire's flicker signal. */
function tongue(x: number, z: number, height: number, radius: number, colour: PaletteKey, channel: 0 | 1 | 2 | 3): THREE.Mesh {
  const geometry = new THREE.ConeGeometry(radius, height, 4).translate(0, height / 2, 0);
  const mesh = new THREE.Mesh(geometry, glow(colour));
  mesh.position.set(x, 0, z);
  const signal = new THREE.Vector4();
  return animated(mesh, (seconds) => {
    flickerSignal(seconds, signal);
    mesh.scale.y = 1 + 0.4 * signal.getComponent(channel);
  });
}

/** A round cast-iron gravity furnace on a stone plinth, its fire-door hanging
 *  open on the fire, an ash pit glowing beneath. The fire-door faces +z. */
function furnace(): THREE.Group {
  const iron = flat("ash");
  const dark = flat("soot");
  const band = flat("stoneDark");
  const result = group(
    cylinder(0.8, 0.1, flat("stoneDark"), [0, 0, 0], { sides: 12 }),
    lathe(
      [
        [0, 0.1],
        [BODY, 0.1],
        [BODY, 1.2],
        [0.58, 1.36],
        [0.38, 1.46],
        [0.32, 1.47],
        [0.32, COLLAR + 0.1],
        [0, COLLAR + 0.1],
      ],
      iron,
      12,
    ),
    cylinder(BODY + 0.02, 0.06, band, [0, 0.98, 0], { sides: 12 }),
    cylinder(BODY + 0.02, 0.06, band, [0, 0.14, 0], { sides: 12 }),
    cylinder(0.35, 0.05, band, [0, COLLAR + 0.04, 0], { sides: 12 }),
  );

  // The fire-door's frame and the fire inside it.
  const open = { width: 0.46, bottom: 0.34, top: 0.72 };
  const jamb = 0.12;
  result.add(
    box([jamb, open.top - open.bottom + 0.12, 0.36], iron, [-(open.width / 2 + jamb / 2), open.bottom - 0.1, 0.68]),
    box([jamb, open.top - open.bottom + 0.12, 0.36], iron, [open.width / 2 + jamb / 2, open.bottom - 0.1, 0.68]),
    box([open.width + jamb * 2 + 0.04, 0.12, 0.38], iron, [0, open.top, 0.69]),
    box([open.width + jamb * 2 + 0.04, 0.1, 0.4], iron, [0, open.bottom - 0.1, 0.7]),
    box([open.width - 0.02, open.top - open.bottom, 0.02], glow("ember"), [0, open.bottom, 0.69]),
  );
  const coals: [number, number, number, PaletteKey][] = [
    [-0.16, 0.08, 0.76, "ember"],
    [-0.06, 0.1, 0.74, "amber"],
    [0.05, 0.07, 0.78, "ember"],
    [0.15, 0.09, 0.75, "amber"],
    [0.0, 0.06, 0.83, "flame"],
    [-0.11, 0.05, 0.84, "ember"],
    [0.12, 0.05, 0.84, "ember"],
  ];
  for (const [x, size, z, colour] of coals) {
    const coal = box([size, size * 0.7, size], glow(colour), [x, open.bottom, z]);
    coal.rotation.y = x * 4;
    result.add(coal);
  }
  const fire = group(
    tongue(-0.12, 0.74, 0.22, 0.07, "ember", 0),
    tongue(0.13, 0.75, 0.2, 0.06, "ember", 1),
    tongue(-0.04, 0.76, 0.3, 0.07, "amber", 2),
    tongue(0.06, 0.73, 0.26, 0.06, "amber", 3),
    tongue(0.0, 0.79, 0.16, 0.05, "flame", 0),
  );
  fire.position.y = open.bottom + 0.03;
  result.add(fire);

  // The fire-door, hanging open off its upper hinge, swung back against the belly.
  const leaf = group(
    box([0.5, 0.44, 0.04], iron, [0.25, -0.22, 0.02]),
    box([0.42, 0.36, 0.02], dark, [0.25, -0.18, 0.045]),
    box([0.06, 0.05, 0.07], band, [0.44, -0.02, 0.04]),
  );
  const hinge = group(leaf);
  hinge.position.set(-(open.width / 2 + jamb), open.top, 0.86);
  hinge.rotation.set(0, -1.95, 0.08);
  result.add(hinge);

  // The ash pit below, glowing through its open slot.
  result.add(
    box([0.56, 0.16, 0.12], iron, [0, 0.1, 0.68]),
    box([0.42, 0.07, 0.03], glow("ember"), [0, 0.135, 0.735]),
  );

  // A pressure gauge on the shoulder, its needle hard over into the red.
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 10), band);
  dial.rotation.x = Math.PI / 2;
  dial.position.set(0.22, 1.24, 0.6);
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.02, 10), flat("boneDark"));
  face.rotation.x = Math.PI / 2;
  face.position.set(0.22, 1.24, 0.63);
  const needle = box([0.015, 0.065, 0.015], flat("scarlet"), [0, 0, 0]);
  needle.position.set(0.22, 1.24, 0.645);
  needle.rotation.z = -1.25;
  result.add(dial, face, needle, box([0.03, 0.03, 0.08], band, [0.22, 1.21, 0.55]));

  // A seam split open in the back of the belly, glowing.
  const seam = box([0.04, 0.52, 0.03], glow("amber"), [0.12, 0.36, -BODY - 0.005]);
  seam.rotation.z = 0.18;
  result.add(seam);

  result.add(
    // Flame signal 1, which the floor's glowing cracks waver with too.
    lightAnchor({ colour: "amber", intensity: 30, range: 12, flicker: 0.5, signal: 1 }, [0, 0.56, 0.95]),
    lightAnchor({ colour: "ember", intensity: 8, range: 7, flicker: 0.45 }, [0, 0.12, 0.98]),
    lightAnchor({ colour: "ember", intensity: 5, range: 6, flicker: 0.4 }, [0.1, 0.5, -0.95]),
  );
  return result;
}

/** One of the furnace's wrapped ducts, rising from its collar and running up
 *  into a wall, built in room metres from the collar's height. */
function duct(to: [x: number, y: number, z: number]): THREE.Group {
  const wrap = flat("bone");
  const strap = flat("boneDark");
  const [fx, fz] = FURNACE;
  const direction = new THREE.Vector2(to[0] - fx, to[2] - fz).normalize().multiplyScalar(0.24);
  const foot = new THREE.Vector3(fx + direction.x, 0, fz + direction.y);
  const elbow = foot.clone().setY(0.45);
  const end = new THREE.Vector3(to[0], to[1] - COLLAR, to[2]);
  const radius = 0.125;
  const joint = new THREE.Mesh(new THREE.IcosahedronGeometry(radius * 1.05, 0), wrap);
  joint.position.copy(elbow);
  const result = group(pipe(foot, elbow, radius, wrap), pipe(elbow, end, radius, wrap), joint);
  const run = end.clone().sub(elbow);
  for (const t of [0.3, 0.65]) {
    const at = elbow.clone().addScaledVector(run, t);
    result.add(pipe(at.clone().addScaledVector(run, -0.02 / run.length()), at.clone().addScaledVector(run, 0.02 / run.length()), radius + 0.018, strap));
  }
  return result;
}

/** A heap of coal in the corner, under its chute, a shovel driven into it. */
function coalHeap(): THREE.Group {
  const rng = createRng("furnace-room-coal");
  const radius = 0.7;
  const height = 0.5;
  const lumps = batch();
  for (let i = 0; i < 70; i++) {
    const r = Math.sqrt(rng.next()) * radius;
    const angle = rng.next() * Math.PI * 2;
    const size = 0.07 + rng.next() * 0.08;
    const y = height * (1 - r / radius) - size * 0.4;
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(Math.cos(angle) * r, Math.max(y + size * 0.3, size * 0.85), Math.sin(angle) * r),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.next() * 3, rng.next() * 3, rng.next() * 3)),
      new THREE.Vector3(1, 1, 1),
    );
    lumps.add([size, size * 0.8, size], pick(rng, ["void", "soot", "sootLight", "stoneDark", "soot"] as const), matrix);
  }
  const cone = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 7).translate(0, height / 2, 0), flat("soot"));
  const handle = pipe(new THREE.Vector3(-0.05, 0.3, -0.1), new THREE.Vector3(-0.45, 1.05, 0.15), 0.02, flat("woodMid"), 6);
  const blade = box([0.24, 0.3, 0.02], flat("ash"), [0, -0.15, 0]);
  blade.position.set(0.02, 0.3, -0.13);
  blade.rotation.set(0.25, 0.55, 0.45);
  return group(cone, lumps.mesh(), handle, blade);
}

/** The iron hatch of the coal chute, hung on the wall above the heap. Faces +z. */
function chuteHatch(): THREE.Group {
  const iron = flat("sootLight");
  const trough = box([0.46, 0.03, 0.55], iron, [0, 0, 0]);
  trough.rotation.x = 0.55;
  trough.position.set(0, -0.28, 0.32);
  return group(
    box([0.62, 0.5, 0.08], iron, [0, 0, 0.04]),
    box([0.48, 0.36, 0.03], flat("void"), [0, 0.07, 0.09]),
    box([0.66, 0.05, 0.1], flat("ash"), [0, 0.5, 0.05]),
    trough,
  );
}

/** An iron grille in the floor over a pit of embers, the fire showing through. */
function floorGrate(): THREE.Group {
  const iron = flat("soot");
  const size = 0.72;
  const bars = batch();
  for (let i = 0; i < 7; i++) {
    const x = -size / 2 + 0.07 + i * ((size - 0.14) / 6);
    bars.block([0.035, 0.03, size - 0.04], "soot", [x, 0.012, 0]);
  }
  for (const z of [-0.12, 0.12]) bars.block([size - 0.04, 0.035, 0.03], "sootLight", [0, 0.014, z]);
  const pit = box([size - 0.08, 0.004, size - 0.08], glow("ember"), [0, 0.006, 0]);
  pit.userData.noShadow = true;
  const embers = [
    [-0.18, 0.1],
    [0.12, -0.2],
    [0.2, 0.15],
  ].map(([x, z]) => box([0.08, 0.003, 0.06], glow("amber"), [x, 0.008, z]));
  return group(
    box([size, 0.04, 0.06], iron, [0, 0, -size / 2 + 0.03]),
    box([size, 0.04, 0.06], iron, [0, 0, size / 2 - 0.03]),
    box([0.06, 0.04, size - 0.12], iron, [-size / 2 + 0.03, 0, 0]),
    box([0.06, 0.04, size - 0.12], iron, [size / 2 - 0.03, 0, 0]),
    pit,
    ...embers,
    bars.mesh(),
    lightAnchor({ colour: "ember", intensity: 8, range: 7, flicker: 0.4 }, [0, 0.16, 0]),
  );
}

/** A flat decal on the floor, its pixels on the room's grid; `y` lifts it off the boards. */
function floorDecal(texture: THREE.Texture, y: number, material?: THREE.Material): THREE.Mesh {
  const plane = pixelPlane(texture, { alpha: true });
  if (material) plane.material = material;
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = y;
  plane.userData.noShadow = true;
  return plane;
}

/** Rows of a ring of soot scorched into the floor about the furnace, and the
 *  glowing cracks the heat has opened in the stones, as two grids. */
function scorchRows(size: number): { soot: string[]; cracks: string[] } {
  const rng = createRng("furnace-room-scorch");
  const soot = Array.from({ length: size }, () => Array.from({ length: size }, () => "."));
  const cracks = Array.from({ length: size }, () => Array.from({ length: size }, () => "."));
  const centre = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x + 0.5 - centre, y + 0.5 - centre) / centre;
      const density = r < 0.38 ? 0.85 : Math.max(0, 1 - (r - 0.38) / 0.5) ** 2 * 0.8;
      if (rng.next() < density) soot[y][x] = rng.next() < 0.5 ? "v" : "s";
    }
  }
  for (let i = 0; i < 9; i++) {
    let angle = (i / 9) * Math.PI * 2 + rng.next() * 0.5;
    let r = 0.36 * centre;
    let x = centre + Math.cos(angle) * r;
    let y = centre + Math.sin(angle) * r;
    const reach = (0.6 + rng.next() * 0.35) * centre;
    for (let step = 0; step < reach; step++) {
      const px = Math.round(x);
      const py = Math.round(y);
      if (px < 0 || py < 0 || px >= size || py >= size) break;
      cracks[py][px] = step < reach * 0.35 ? "a" : "e";
      if (step < reach * 0.6 && px + 1 < size) cracks[py][px + 1] = "e";
      angle += (rng.next() - 0.5) * 0.7;
      r += 1;
      x += Math.cos(angle);
      y += Math.sin(angle);
      if (rng.next() < 0.08) {
        const bx = Math.round(x + Math.sin(angle) * 1.5);
        const by = Math.round(y - Math.cos(angle) * 1.5);
        if (bx >= 0 && by >= 0 && bx < size && by < size) cracks[by][bx] = "e";
      }
    }
  }
  return { soot: soot.map((row) => row.join("")), cracks: cracks.map((row) => row.join("")) };
}

/** The floor around the furnace: blackened with soot, split by cracks that
 *  glow with the fire beneath and waver with it. */
function scorchedFloor(): THREE.Group {
  const { soot, cracks } = scorchRows(112);
  const crackTexture = pixelTexture(cracks, { a: "amber", e: "ember" });
  const glowing = lightMaterial(1, { map: crackTexture });
  const crackPlane = floorDecal(crackTexture, 0.014, glowing);
  return group(
    floorDecal(pixelTexture(soot, { v: "void", s: "soot" }), 0.006),
    animated(crackPlane, (seconds) => {
      glowing.opacity = 0.8 + 0.2 * flickerOf(seconds, 1);
    }),
  );
}

const SHOE = ["##.######.", "##.#######", "##.######."];

/** Rows of a trail of ashen footprints walking +x, every one going in. */
function footprintRows(width: number): string[] {
  const rows = Array.from({ length: 9 }, () => Array.from({ length: width }, () => "."));
  for (let step = 0, x = 1; x + SHOE[0].length < width; step++, x += 9) {
    const top = step % 2 === 0 ? 0 : 5;
    const faint = step < 2;
    SHOE.forEach((row, dy) => {
      [...row].forEach((cell, dx) => {
        if (cell === "#" && !(faint && (dx + dy) % 2 === 0)) rows[top + dy + (step % 2 === 0 ? 1 : 0)][x + dx] = (dx + step) % 4 === 0 ? "b" : "a";
      });
    });
  }
  return rows.map((row) => row.join(""));
}

/** Ashen footprints from the left doorway straight into the furnace's mouth,
 *  and none coming back. They run along +x. */
function footprints(): THREE.Group {
  return group(floorDecal(pixelTexture(footprintRows(76), { a: "stoneLight", b: "boneDark" }), 0.01));
}

/** A coal scuttle, tipped half over. */
function scuttle(): THREE.Group {
  const body = lathe(
    [
      [0, 0],
      [0.15, 0],
      [0.19, 0.3],
      [0.17, 0.32],
      [0, 0.32],
    ],
    flat("ash"),
    9,
  );
  const coal = cylinder(0.16, 0.05, flat("void"), [0, 0.31, 0], { top: 0.07, sides: 9 });
  const handle = box([0.36, 0.025, 0.025], flat("sootLight"), [0, 0.36, 0]);
  return group(body, coal, handle);
}

/** A three-legged stool knocked onto its side, its tin cup rolled away. */
function fallenStool(): THREE.Group {
  const wood = flat("wood");
  const stool = group(cylinder(0.18, 0.05, flat("woodMid"), [0, 0.42, 0], { sides: 9 }));
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2;
    stool.add(box([0.04, 0.43, 0.04], wood, [Math.cos(angle) * 0.11, 0, Math.sin(angle) * 0.11]));
  }
  stool.rotation.z = Math.PI / 2;
  stool.position.y = 0.17;
  const cup = cylinder(0.04, 0.09, flat("stone"), [0, 0, 0], { sides: 7 });
  cup.rotation.x = Math.PI / 2;
  cup.position.set(-0.7, 0.04, 0.3);
  return group(stool, cup);
}

/** A long iron fire rake left lying on the floor. Runs along +x. */
function rake(): THREE.Group {
  const iron = flat("sootLight");
  const head = box([0.04, 0.05, 0.26], iron, [0.62, 0, 0]);
  const shaft = pipe(new THREE.Vector3(-0.65, 0.025, 0), new THREE.Vector3(0.62, 0.025, 0), 0.015, iron, 5);
  return group(shaft, head, box([0.1, 0.04, 0.04], iron, [-0.68, 0, 0]));
}

/** Two crates of kindling stacked in the far corner. */
function crates(): THREE.Group {
  const top = crate([0.5, 0.42, 0.5]);
  top.position.y = 0.6;
  top.rotation.y = 0.3;
  const kindling = batch();
  const rng = createRng("furnace-room-kindling");
  for (let i = 0; i < 9; i++) {
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(-0.2 + rng.next() * 0.4, 0.62, -0.2 + rng.next() * 0.4),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng.next() * 3, 0.1)),
      new THREE.Vector3(1, 1, 1),
    );
    kindling.add([0.5, 0.04, 0.05], pick(rng, ["woodLight", "woodMid"] as const), matrix);
  }
  return group(crate([0.62, 0.6, 0.62], "woodMid"), top, kindling.mesh());
}

/** The Furnace Room: a squat iron furnace with pale ducts reaching for the
 *  walls, its door hanging open on a roaring fire that lights the cellar
 *  orange from below; the floor around it is scorched and split with glowing
 *  cracks, and ashen footprints walk into its mouth. */
export const FURNACE_ROOM: RoomDefinition = {
  id: "furnace-room",
  floor: () => flagstones({ ramp: ["ash", "stoneDark", "stone", "stoneLight"], mortar: "soot", stonePx: 12, seed: "furnace-room" }),
  wall: () => bricks({ mortar: "stoneDark", seed: "furnace-room" }),
  wainscot: () => bricks({ ramp: ["soot", "sootLight", "ash", "stoneDark"], seed: "furnace-room-soot" }),
  trim: "soot",
  props: [
    { build: scorchedFloor, at: FURNACE },
    { build: furnace, at: FURNACE, turn: -45 },
    ...(
      [
        [[2.95, 2.55, -1.35], "right"],
        [[2.95, 2.7, 0.55], "right"],
        [[-1.2, 2.85, -2.95], "top"],
        [[0.55, 2.7, 2.95], "bottom"],
      ] as const
    ).map(([to, wall]) => ({
      build: () => duct([...to]),
      name: `duct to the ${wall} wall`,
      at: [0, 0] as [number, number],
      y: 1.5,
      walls: [wall],
      contacts: [
        { with: wall, because: "the duct runs into the wall" },
        { with: "furnace", because: "the duct rises out of the furnace's collar" },
      ],
    })),
    { build: footprints, at: [-0.7, 0.17], turn: -8 },
    { build: floorGrate, at: [0.35, 1.05], turn: 8 },
    { build: coalHeap, at: [2.05, -2.05] },
    { build: chuteHatch, ...onWall("right", -2.05, { y: 1.15 }) },
    { build: scuttle, at: [0.15, -0.4], turn: 20 },
    { build: fallenStool, at: [-0.5, -1.55], turn: 30 },
    { build: rake, at: [0.1, -2.05], turn: -8 },
    { build: crates, at: [-2.3, -2.3], turn: 10 },
    { build: () => cobweb({ form: "slung" }), name: "cobweb", at: [-(INNER - 0.29), -(INNER - 0.29)], y: 3.05, turn: 45, walls: ["left", "top"] },
  ],
  focus: [0.7, 0.6, -0.45],
  pawn: [-1.4, 0.45],
  spots: [[-0.6, -0.15], [-1.8, -1.1], [1.6, 1.4], [-2.0, 1.75], [0.95, 2.25]],
  // Down from the top doorway between the coal and the furnace, across the
  // floor to the other doorways, and round the coal into the corner behind it.
  lanes: [
    [[0, -2.2], [0, -1.2], [-0.45, -0.7], [-0.5, -0.35], [-0.5, 0.2], [0.3, 1.0], [0, 2.2]],
    [[-1.8, -1.4], [-1.6, -0.35], [-0.5, -0.35]],
    [[-1.6, -0.35], [-2.2, 0], [-0.5, 0.2]],
    [[0.3, 1.0], [1.5, 1.2]],
    [[0, 2.2], [-1.9, 1.9], [-2.2, 0]],
  ],
};
