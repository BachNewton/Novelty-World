import * as THREE from "three";
import { enableShadows } from "./sky";
import type { Ocean } from "./ocean";

/**
 * Navigational-marker buoys — the decorative / non-simulated half of the HYBRID
 * floating model (see CLAUDE.md "Water architecture"). They ride the water purely
 * kinematically: each frame we place the buoy on the water particle at its rest
 * (x, z) via `ocean.sampleParticle` (forward Gerstner) and tilt it to the surface
 * normal. No physics engine, no collision — cheap and it looks great, which is why
 * it's the PERMANENT approach for markers, foam, debris, and ambient floaters.
 *
 * Two IALA mark types are modelled:
 *  - Lateral marks — a red (port) and a green (starboard) capsule float.
 *  - Cardinal marks — N/S/E/W, each a spar with the official black/yellow body
 *    pattern AND the distinguishing two-cone topmark. The pattern + topmark are
 *    built ABOVE the buoy's origin, and the origin rides the water surface, so the
 *    identifying marks sit above the waterline where they're actually visible.
 */

const UP = new THREE.Vector3(0, 1, 0);
const BLACK = "#1a1a1a";
const YELLOW = "#f2c200";

type ConeDir = "up" | "down";

interface CardinalSpec {
  name: string;
  restX: number;
  restZ: number;
  /** Body colour bands, top → bottom of the spar. */
  bands: string[];
  /** Topmark cone apex directions, [lower, upper]. */
  cones: [ConeDir, ConeDir];
}

// The four cardinal marks. Positions are a DEMO composition (not true IALA bearings): they're
// spread into mid- and background depth along the channel that leads toward the sun (az135),
// with the two laterals as the foreground pair — so the scene reads with fore/mid/background
// depth and an open centre. Body pattern + topmark still follow the IALA "System A/B" convention:
//   N  black/yellow,  cones ▲▲ (points up)
//   S  yellow/black,  cones ▼▼ (points down)
//   E  black/yellow/black, cones ◆ (bases together, points away)
//   W  yellow/black/yellow, cones ✕ (points together)
const CARDINALS: CardinalSpec[] = [
  { name: "N", restX: 2, restZ: -14, bands: [BLACK, YELLOW], cones: ["up", "up"] }, // midground
  { name: "E", restX: 14, restZ: -6, bands: [BLACK, YELLOW, BLACK], cones: ["down", "up"] }, // midground
  { name: "S", restX: 16, restZ: -26, bands: [YELLOW, BLACK], cones: ["down", "down"] }, // background
  { name: "W", restX: -2, restZ: -22, bands: [YELLOW, BLACK, YELLOW], cones: ["up", "down"] }, // background
];

interface Buoy {
  object: THREE.Object3D;
  restX: number;
  restZ: number;
}

export interface NavBuoys {
  /** Add to the scene once; holds every marker. */
  object: THREE.Object3D;
  /** Ride the buoys on the water at `time` seconds. Call once per frame. */
  update: (ocean: Ocean, time: number) => void;
  dispose: () => void;
}

// A vertical band pattern painted onto a canvas: `bands` run top → bottom, and the
// cylinder's UV v runs bottom → top with the default texture flip, so band[0] ends
// up at the top of the spar.
const makePattern = (bands: string[]): THREE.CanvasTexture => {
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable for buoy pattern");
  const bandHeight = canvas.height / bands.length;
  bands.forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, i * bandHeight, canvas.width, bandHeight);
  });
  return new THREE.CanvasTexture(canvas);
};

export function createNavBuoys(): NavBuoys {
  const root = new THREE.Group();
  const buoys: Buoy[] = [];

  // --- Lateral marks: two capsule floats. Like the cardinal spars, the body is
  // built ABOVE the group origin so it rides high above the waterline (with just
  // its base dipping under) rather than sitting half-submerged with its centre on
  // the surface — matching how the real buoys show most of their body above water.
  const capsuleGeometry = new THREE.CapsuleGeometry(0.4, 1.2, 8, 16);
  const redMaterial = new THREE.MeshStandardMaterial({ color: 0xcc3333, roughness: 0.4 });
  const greenMaterial = new THREE.MeshStandardMaterial({ color: 0x2fa84f, roughness: 0.4 });
  // Port (red) + starboard (green) are the FOREGROUND pair, set off to either side of the view
  // centre (not dead-centre, and clear of the low camera paths) so the channel between them —
  // and the sun on the horizon beyond — stays open. See the CARDINALS note on the composition.
  const lateralSpecs: { material: THREE.MeshStandardMaterial; restX: number; restZ: number }[] = [
    { material: redMaterial, restX: -3, restZ: -4 },
    { material: greenMaterial, restX: 7, restZ: 2 },
  ];
  for (const spec of lateralSpecs) {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(capsuleGeometry, spec.material);
    // Capsule half-height is ~1.0 (0.6 cylinder half + 0.4 cap); lift it so the
    // base sits ~0.4 m below the origin and the rest stands proud of the surface.
    mesh.position.y = 0.6;
    group.add(mesh);
    root.add(group);
    buoys.push({ object: group, restX: spec.restX, restZ: spec.restZ });
  }

  // --- Cardinal marks: a spar (patterned body) + a two-cone topmark, both built
  // above the group origin so they stay above the waterline the origin rides.
  const sparGeometry = new THREE.CylinderGeometry(0.3, 0.34, 2.2, 16);
  // A thin staff carries the topmark above the body — without it the cones would
  // hang in mid-air, which no real buoy does.
  const mastGeometry = new THREE.CylinderGeometry(0.05, 0.05, 1.3, 8);
  const coneGeometry = new THREE.ConeGeometry(0.28, 0.5, 12);
  const mastMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.7 });
  const coneMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });
  const patternTextures: THREE.CanvasTexture[] = [];
  const sparMaterials: THREE.MeshStandardMaterial[] = [];

  for (const spec of CARDINALS) {
    const group = new THREE.Group();

    const pattern = makePattern(spec.bands);
    patternTextures.push(pattern);
    const sparMaterial = new THREE.MeshStandardMaterial({ map: pattern, roughness: 0.5 });
    sparMaterials.push(sparMaterial);
    const spar = new THREE.Mesh(sparGeometry, sparMaterial);
    spar.position.y = 0.8; // spans ~-0.3 (just below the surface) to ~1.9 above it
    group.add(spar);

    const mast = new THREE.Mesh(mastGeometry, mastMaterial);
    mast.position.y = 2.55; // rises out of the spar top (~1.9) through the topmark
    group.add(mast);

    // Two black cones threaded on the staff; each apex points up or down per the
    // cardinal convention. `down` flips the cone with a π rotation about X.
    const coneY = [2.15, 2.7];
    spec.cones.forEach((dir, i) => {
      const cone = new THREE.Mesh(coneGeometry, coneMaterial);
      cone.position.y = coneY[i];
      if (dir === "down") cone.rotation.x = Math.PI;
      group.add(cone);
    });

    root.add(group);
    buoys.push({ object: group, restX: spec.restX, restZ: spec.restZ });
  }

  // Buoys are opaque solids on open water: they cast onto the sea and onto each other. Applied to
  // the whole root so the spars, masts and topmark cones are all covered without touching materials.
  enableShadows(root);

  return {
    object: root,
    update: (ocean, time) => {
      for (const buoy of buoys) {
        const ride = ocean.sampleParticle(buoy.restX, buoy.restZ, time);
        buoy.object.position.copy(ride.position);
        buoy.object.quaternion.setFromUnitVectors(UP, ride.normal);
      }
    },
    dispose: () => {
      capsuleGeometry.dispose();
      redMaterial.dispose();
      greenMaterial.dispose();
      sparGeometry.dispose();
      mastGeometry.dispose();
      coneGeometry.dispose();
      mastMaterial.dispose();
      coneMaterial.dispose();
      for (const texture of patternTextures) texture.dispose();
      for (const material of sparMaterials) material.dispose();
    },
  };
}
