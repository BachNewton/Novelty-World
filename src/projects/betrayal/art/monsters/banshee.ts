import * as THREE from "three";
import { createRng } from "@/shared/lib/seeded-random";
import { animated } from "../animate";
import { arm, burst, floats, joins, pose, reach, STANDING, walks, type Gait, type Joint, type Limb } from "../explorers/figure";
import { ball, ellipsoid, glowShaded, loft, rod, sculpt, stretched, type Section, type Tone } from "../forms";
import { paletteHex } from "../palette";
import { group, lightMaterial } from "../shapes";
import { floorGlow, spectral, type MonsterOptions } from "./base";

/*
 * The Banshee: a wailing spirit in sickly green, the supernatural's colour.
 * Read at a glance: a glowing woman taller than an explorer, floating free of
 * the floor with no base (a digital figure needs no flying stand), a soft
 * pool of her green light on the floor beneath her, her robe tattered into
 * points and fading to a veil, her long hair streaming, her mouth a black
 * hole. When she wails she throws her head back and flings her arms wide,
 * and rings of light pulse out of her mouth. She faces +z squarely, her body
 * and her reaching hands showing which way: haunt 08 turns her by it, so
 * whoever places her turns her to face along the grid. She is all glow and no
 * paint: she lights herself, so she reads in the darkest room without a live
 * light. Her solid parts glow in vertex colours shaded once from above, so
 * her sculpted form shows though no light falls on her; her veil, halo,
 * tatters and mist are light, added to what lies behind.
 *
 * Every size is in metres, every height from the floor; each pivot sits at its joint.
 */

/** The pool of her light on the floor beneath her. */
const GLOW_RADIUS = 0.55;
/** Her waist, where the robe hangs from and the chest turns. */
const WAIST = 1.22;
const HEM = 0.5;
const SHOULDER: [number, number] = [0.17, 0.34];
const NECK = 0.42;
const UPPER_ARM = 0.3;
const FOREARM = 0.28;
const HAND = 0.1;
const LOWER_ARM = FOREARM + HAND / 2;
/** Where the wail leaves her mouth, in the neck's frame. */
const MOUTH: [number, number, number] = [0, 0.13, 0.13];

/** The head on its neck: a gaunt skull, hollow eyes, the mouth stretched open
 *  in a black hole, and long hair falling round her face and down her back. */
function head(): THREE.BufferGeometry {
  const shape = sculpt()
    .add(rod([0, -0.02, -0.01], [0, 0.1, 0], 0.045, 0.04), "wraithLight")
    .add(ellipsoid([0, 0.245, 0], [0.1, 0.14, 0.11]), "wraithLight", 0.03)
    .add(ellipsoid([0, 0.14, 0.025], [0.072, 0.105, 0.085]), "wraithLight", 0.04);
  for (const side of [-1, 1]) {
    shape.add(ball([side * 0.058, 0.2, 0.085], 0.024), "wraithLight", 0.02);
    shape.carve(ellipsoid([side * 0.04, 0.245, 0.105], [0.026, 0.03, 0.03]), { blend: 0.012, colour: "void" });
    // Long hair falling either side of her face, past the jaw.
    shape.add(rod([side * 0.09, 0.3, -0.01], [side * 0.11, 0.02, -0.04], 0.05, 0.03), "wraith", 0.03);
  }
  return shape
    .carve(ellipsoid([0, 0.125, 0.1], [0.028, 0.052, 0.04]), { blend: 0.012, colour: "void" })
    .add(ellipsoid([0, 0.275, -0.035], [0.12, 0.155, 0.118]), "wraith", 0.012)
    .geometry(0.007);
}

/** A ribbon of hair, hanging from its root along +y (the mane hangs it down her back). */
function lock(length: number, width: number, colour: Tone): THREE.BufferGeometry {
  const sections: Section[] = [0, 0.35, 0.7, 1].map((t) => ({ at: [0, t * length, -0.01 * Math.sin(t * Math.PI)], radius: [width * (1 - t * 0.55), 0.012], colour }));
  return loft(sections, { sides: 10, ends: ["round", "point"] });
}

/** The bodice from the waist up: a narrow ribbed body under bony shoulders. */
function torso(): THREE.BufferGeometry {
  const shape = sculpt()
    .add(stretched(rod([0, 0.0, 0], [0, 0.26, 0], 0.12, 0.13), [0, 0.13, 0], [1, 1, 0.75]), "wraithLight")
    .add(rod([-0.16, 0.335, 0], [0.16, 0.335, 0], 0.048), "wraithLight", 0.07)
    .add(rod([0, 0.33, 0], [0, 0.43, 0], 0.05, 0.045), "wraithLight", 0.04);
  // Her ribs show through the bodice, in the robe's darker green.
  for (const y of [0.12, 0.17, 0.22]) shape.paint((x, py, z) => (Math.abs(py - y) < 0.009 && z > 0.04 && Math.abs(x) > 0.025 ? -1 : 1), "wraith");
  return shape.paint((x, y, z) => (z > 0 && y > 0.25 && y < 0.36 - Math.abs(x) * 0.6 ? -1 : 1), "wraith").geometry(0.01);
}

/** The robe from the waist to where it thins into the veil. */
function robe(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, 0.03, 0], [0, -0.3, 0], 0.12, 0.2), "wraith")
    .add(ellipsoid([0, -0.02, 0], [0.135, 0.04, 0.12]), "wraithLight", 0.02)
    .geometry(0.012);
}

/** The robe below, fading into a see-through veil to the hem: a tube of
 *  rings, ragged at its lower edge. */
function veil(): THREE.BufferGeometry {
  const sections: Section[] = [
    { at: [0, -0.28, 0], radius: 0.19, colour: "wraith" },
    { at: [0, -0.4, 0], radius: 0.235, colour: "wraith" },
    { at: [0, HEM - WAIST + 0.18, 0], radius: 0.27, colour: "wraith" },
    { at: [0, HEM - WAIST, 0], radius: 0.3, colour: "wraithDark" },
  ];
  return loft(sections, { sides: 18, ends: ["flat", "flat"] });
}

/** A ring of light round the robe, a hand's width out. */
function halo(): THREE.BufferGeometry {
  const sections: Section[] = [
    [0.17, 0.0],
    [0.25, -0.32],
    [0.32, HEM - WAIST + 0.16],
    [0.35, HEM - WAIST - 0.02],
  ].map(([radius, y]) => ({ at: [0, y, 0], radius, colour: "wraithLight" }));
  return loft(sections, { sides: 18, ends: ["flat", "flat"] });
}

/** A ragged point of robe hanging from the hem, from its top. */
function tatter(length: number): THREE.BufferGeometry {
  return loft(
    [
      { at: [0, 0, 0], radius: [0.075, 0.014], colour: "wraith" },
      { at: [0, -length * 0.5, 0.01], radius: [0.05, 0.01], colour: "wraith" },
      { at: [0, -length, 0], radius: [0.012, 0.006], colour: "wraithLight" },
    ],
    { sides: 8, ends: ["flat", "point"] },
  );
}

/** A long sleeve to the elbow. */
function upperArm(): THREE.BufferGeometry {
  return sculpt().add(ball([0, -0.01, 0], 0.058), "wraith").add(rod([0, -0.02, 0], [0, -UPPER_ARM, 0], 0.046, 0.05), "wraith", 0.03).geometry(0.01);
}

/** The forearm: a sleeve that flares into a bell at the wrist, and a bony hand of three long fingers. */
function forearm(side: -1 | 1): THREE.BufferGeometry {
  const shape = sculpt()
    .add(rod([0, 0.02, 0], [0, -FOREARM + 0.02, 0], 0.05, 0.085), "wraith")
    .carve(rod([0, -FOREARM + 0.08, 0], [0, -FOREARM - 0.04, 0], 0.03, 0.07), { blend: 0.01, colour: "wraithDark" })
    .add(rod([0, -FOREARM + 0.04, 0], [0, -FOREARM - 0.03, 0.005], 0.02, 0.018), "wraithLight", 0.01)
    .add(ellipsoid([0, -FOREARM - 0.04, 0.008], [0.018, 0.032, 0.03]), "wraithLight", 0.012);
  for (const z of [-0.016, 0.006, 0.026]) {
    shape.add(rod([0, -FOREARM - 0.06, z], [side * 0.006, -FOREARM - HAND - 0.02, z * 1.3 + 0.012], 0.008, 0.005), "wraithLight", 0.006);
  }
  return shape.geometry(0.006);
}

/** A ring of light that leaves her mouth as she wails, facing +z. */
function wailRing(): THREE.Mesh {
  const material = lightMaterial(0);
  material.color.set(paletteHex("wraithLight"));
  material.toneMapped = false;
  return new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 32), material);
}

function meshParts() {
  const lockLengths = [0.3, 0.38, 0.34, 0.27];
  return {
    head: glowShaded(head()),
    mane: glowShaded(lock(0.34, 0.125, "wraith"), 0.3),
    locks: lockLengths.map((length, i) => glowShaded(lock(length, 0.035, i % 2 ? "wraith" : "wraithLight"), 0.3)),
    torso: glowShaded(torso()),
    robe: glowShaded(robe()),
    veil: veil(),
    halo: halo(),
    tatters: [0.3, 0.42, 0.34, 0.46, 0.28, 0.4].map(tatter),
    upperArm: glowShaded(upperArm()),
    forearms: [glowShaded(forearm(-1)), glowShaded(forearm(1))],
  };
}
type Parts = ReturnType<typeof meshParts>;
/** Meshed once on first use and shared by every banshee: none of it depends on the seed. */
let meshed: Parts | undefined;

/** Light added to what lies behind it, coloured by its geometry's colours. */
function light(opacity: number): THREE.MeshBasicMaterial {
  const material = lightMaterial(opacity, { vertexColors: true });
  material.toneMapped = false;
  return material;
}

/**
 * The Banshee floating free of the floor, about 1.95 m to the crown. Her idle:
 * she drifts up and down, sways, her tatters and hair ripple, her hands reach
 * slowly forward, and every few seconds she wails. Stunned, she sinks low,
 * slumps with her head bowed and her arms hanging, and her glow dims to its
 * darkest greens. Moving, she glides: she leans into the way she goes and her
 * tatters and hair stream behind her; she has no legs to stride.
 */
export function banshee(seed = "banshee", gait: Gait = STANDING, { stunned = false }: MonsterOptions = {}): THREE.Group {
  meshed ??= meshParts();
  const parts = meshed;
  const glowing = spectral(stunned ? 0.5 : 1);
  const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material = glowing, name = "") => {
    const made = new THREE.Mesh(geometry, material);
    made.name = name;
    return made;
  };
  const halo = light(stunned ? 0.12 : 0.28);
  const veil = light(stunned ? 0.35 : 0.75);
  const mist = light(stunned ? 0.25 : 0.5);

  const rng = createRng(seed);
  const tatters = parts.tatters.map((geometry, i) => {
    const angle = (i / parts.tatters.length) * Math.PI * 2 + rng.next() * 0.4;
    const piece = group(mesh(geometry, i % 2 ? veil : mist));
    piece.position.set(Math.sin(angle) * 0.27, HEM - WAIST + 0.03, Math.cos(angle) * 0.27);
    piece.rotation.y = angle;
    return piece;
  });
  const robe = mesh(parts.robe, glowing, "robe");
  const hem = group(robe, mesh(parts.veil, veil), mesh(parts.halo, halo), ...tatters);

  // Her hair: one sheet hanging from the back of her crown to between her
  // shoulders, splitting into ragged locks that stream behind her. A sheet
  // hugging her back reads as long hair from above; separate strands read as antennae.
  const locks = parts.locks.map((geometry, i) => {
    const end = group(mesh(geometry, glowing, `lock ${i + 1}`));
    const x = -0.075 + i * 0.05;
    end.position.set(x, 0.3, 0.016);
    // Her hair hangs upside down from its root, so this fans the locks apart.
    end.rotation.z = -x * 2;
    return end;
  });
  const mane = mesh(parts.mane, glowing, "mane");
  const maneRoot = group(mane, ...locks);
  maneRoot.position.set(0, 0.36, -0.1);

  const rings = [wailRing(), wailRing(), wailRing()];
  const mouth = group(...rings);
  mouth.position.set(...MOUTH);
  const face = mesh(parts.head, glowing, "head");
  const neck = group(face, maneRoot, mouth);
  neck.position.y = NECK;

  const limb = (side: -1 | 1) => {
    const name = side < 0 ? "right" : "left";
    return arm(
      mesh(parts.upperArm, glowing, `${name} upper arm`),
      mesh(parts.forearms[side < 0 ? 0 : 1], glowing, `${name} forearm`),
      new THREE.Vector3(side * SHOULDER[0], SHOULDER[1], 0),
      UPPER_ARM,
    );
  };
  const left = limb(1);
  const right = limb(-1);
  const bend = (side: number) => new THREE.Vector3(side, -0.2, -1);
  const toward = (of: Limb, offset: [number, number, number]) => of.at.clone().add(new THREE.Vector3(...offset));
  const poses = (of: Limb, side: number) => ({
    reaching: reach(of.at, toward(of, [side * 0.05, -0.18, 0.5]), UPPER_ARM, LOWER_ARM, bend(side)),
    beckoning: reach(of.at, toward(of, [side * 0.12, 0.02, 0.48]), UPPER_ARM, LOWER_ARM, bend(side)),
    flung: reach(of.at, toward(of, [side * 0.45, 0.4, 0.12]), UPPER_ARM, LOWER_ARM, new THREE.Vector3(side, -1, 0)),
    limp: reach(of.at, toward(of, [side * 0.15, -0.5, 0.2]), UPPER_ARM, LOWER_ARM, new THREE.Vector3(0, 0, -1)),
  });
  const leftPoses = poses(left, 1);
  const rightPoses = poses(right, -1);

  const torso = mesh(parts.torso, glowing, "torso");
  const chest = group(torso, neck, left.shoulder, right.shoulder);
  const body = group(hem, chest);
  body.position.y = WAIST;

  // No base: she floats, and her light pools on the floor beneath her.
  const pool = floorGlow(GLOW_RADIUS, "wraith", stunned ? 0.35 : 0.6);
  const poolMaterial = pool.material as THREE.MeshBasicMaterial;
  const resting = poolMaterial.opacity;

  const figure = joins(group(pool, body), [
    { parts: [face, torso], at: neck, radius: 0.12 },
    // Her hair is a sheet from the back of her crown, splitting into locks where it ends.
    { parts: [mane, face], at: maneRoot, radius: 0.18 },
    ...locks.map((end): Joint => ({ parts: [end, mane], at: end, radius: 0.13 })),
    ...locks.slice(1).map((end, i): Joint => ({ parts: [end, locks[i]], at: end, radius: 0.08 })),
    // Her robe hangs from her waist, inside her bodice.
    { parts: [robe, torso], at: body, radius: 0.2 },
    ...[left, right].flatMap((of): Joint[] => [
      { parts: [of.shoulder.children[0], torso], at: of.shoulder, radius: 0.1 },
      { parts: [of.shoulder.children[0], of.elbow.children[0]], at: of.elbow, radius: 0.1 },
    ]),
  ]);

  const swayPhase = rng.next() * Math.PI * 2;
  const offset = rng.next() * 100;
  const sink = stunned ? -0.22 : 0;

  // She glides: no hop, and the step only paces how her tatters stream.
  return floats(walks(
    animated(figure, (clock) => {
      const seconds = clock + offset;
      const glide = gait(clock).amount;
      const drift = Math.sin((seconds / 3.4) * Math.PI * 2);
      const sway = Math.sin((seconds / 7.3) * Math.PI * 2 + swayPhase);
      const wail = stunned ? 0 : burst(seconds, `${seed}:wail`, { every: 7, lasts: 3, chance: 0.75 }).amount * (1 - glide);
      const beckon = stunned ? 0 : burst(seconds, `${seed}:beckon`, { every: 5, lasts: 2.4, chance: 0.5 }).amount * (1 - wail);

      body.position.y = WAIST + sink + drift * (stunned ? 0.015 : 0.05) + wail * 0.06;
      body.rotation.z = sway * 0.05;
      body.rotation.x = glide * 0.25;
      chest.rotation.x = stunned ? 0.5 : -wail * 0.18 + drift * 0.02;
      neck.rotation.x = stunned ? 0.45 : 0.08 - wail * 0.55;
      // Her head barely turns from the way she faces, so her facing always reads.
      neck.rotation.y = stunned ? 0 : sway * 0.08 * (1 - wail);
      neck.rotation.z = sway * 0.04;

      // Her light on the floor is brighter as she drifts lower, and flares as she wails.
      poolMaterial.opacity = resting * (1 - drift * 0.2 + wail * 0.4);

      // Tatters ripple, and stream back as she glides.
      tatters.forEach((piece, i) => {
        piece.rotation.x = 0.25 + Math.sin(seconds * 2.3 + i * 1.7) * 0.18 + glide * 0.4 * Math.cos(piece.rotation.y) + wail * 0.2;
      });

      // Her hair hangs down her back, its locks rippling; wailing or gliding, it lifts and streams behind.
      // Stunned, her head and chest bow forward, so her hair turns further to keep hanging down.
      maneRoot.rotation.x = stunned ? -2.6 : -2.85 + wail * 0.75 + glide * 0.5 + drift * 0.04;
      locks.forEach((end, i) => {
        end.rotation.x = stunned ? 0 : 0.25 + Math.sin(seconds * 2.4 + i * 0.5) * 0.18 + wail * 0.3;
      });

      if (stunned) {
        pose(left, leftPoses.limp, leftPoses.limp, 1);
        pose(right, rightPoses.limp, rightPoses.limp, 1);
      } else {
        const sweep = Math.sin(seconds * 0.9) * 0.5 + 0.5;
        for (const [of, set] of [
          [left, leftPoses],
          [right, rightPoses],
        ] as const) {
          pose(of, set.reaching, set.beckoning, Math.max(beckon, sweep * 0.3));
          if (wail > 0) {
            of.shoulder.quaternion.slerp(set.flung.shoulder, wail);
            of.elbow.quaternion.slerp(set.flung.elbow, wail);
          }
        }
      }

      // Rings of light leave her mouth while she wails, growing and fading.
      rings.forEach((ring, i) => {
        const travel = (seconds * 0.9 + i / rings.length) % 1;
        ring.visible = wail > 0.01;
        ring.scale.setScalar(0.06 + travel * 0.55);
        ring.position.z = travel * 0.9;
        (ring.material as THREE.MeshBasicMaterial).opacity = (1 - travel) * wail * 0.85;
      });
      halo.opacity = stunned ? 0.1 + Math.max(0, Math.sin(seconds * 5.3)) * 0.06 : 0.24 + wail * 0.25;
    }),
    { step: 0.9, hop: 0 },
  ));
}
