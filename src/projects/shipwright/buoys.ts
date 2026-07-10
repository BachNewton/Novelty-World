import * as THREE from "three";
import { enableShadows } from "./sky";
import type { Ocean } from "./ocean";
import {
  PHOTOCELL_SWITCH_ON_LUX,
  RHYTHMS,
  SIGNAL_COLORS,
  candelaForNominalRange,
  rhythmAt,
  signalLightIntensity,
  type Rhythm,
  type SignalColor,
} from "./iala";

/**
 * Navigational marks — the decorative / non-simulated half of the HYBRID floating model (see
 * CLAUDE.md "Water architecture"). They ride the water kinematically: each frame we place the buoy on
 * the water particle at its rest (x, z) via `ocean.sampleParticle` (forward Gerstner) and tilt it to
 * the surface normal. No physics engine, no collision.
 *
 * ## They are also the lighting model's second light source
 *
 * Every mark carries a **lantern**: a `PointLight` whose intensity is a real luminous intensity in
 * candela, derived from the mark's charted **nominal range** through Allard's Law (`iala.ts`), and a
 * lens that emits at the matching radiance. The lamps run the real IALA rhythms — a west cardinal
 * really does flash nine times and then wait.
 *
 * This is the only thing in the scene that is not the sun, and that makes it the test the brief asked
 * for: *nothing may assume there is exactly one directional light, and nothing may divide by the sun's
 * intensity.* A buoy lantern at civil twilight is where that claim either holds or visibly does not.
 *
 * Two consequences fall straight out of the physics and are worth stating:
 *
 *  - The global cloud-shadow override in `sky.ts` multiplies **directional** lights only. A lantern
 *    sits under the cloud deck, so a cloud must not shadow it. That is not a special case; it is what
 *    the anchor point of the override already means.
 *  - The exposure meter (`lighting.ts`) does **not** see the lanterns. Correct: they are a few tens of
 *    candela metres from the camera, and the meter reads the sky and the sea. A lamp that could stop
 *    the world down by drifting into frame would be a bug, not a feature.
 *
 * ## Region A
 *
 * Finland is IALA **Region A**: **port is RED, starboard is GREEN**. "Red right returning" is the
 * Region B (American) rule and is wrong here. The topmarks are what a sailor actually reads at
 * distance — a red **can** to port, a green **cone** to starboard, and two black cones on a cardinal
 * whose points tell you which side to pass.
 */

const UP = new THREE.Vector3(0, 1, 0);
const BLACK = "#1a1a1a";
const YELLOW = "#f2c200";
/** IALA lateral red and green as PAINT (a dull pigment), not as the lantern's signal colour. */
const PAINT_RED = "#b02b28";
const PAINT_GREEN = "#1f7a43";

/** Nominal ranges, nautical miles. Minor Baltic channel marks are modest: 2-3 NM lateral, 4-5 cardinal. */
const LATERAL_RANGE_NM = 3;
const CARDINAL_RANGE_NM = 5;

/** The lantern lens: a small emissive dome on the mast head. */
const LENS_RADIUS = 0.09;

type ConeDir = "up" | "down";

interface LanternSpec {
  rhythm: Rhythm;
  color: SignalColor;
  candela: number;
}

interface MarkSpec {
  name: string;
  restX: number;
  restZ: number;
  lantern: LanternSpec;
}

interface CardinalSpec extends MarkSpec {
  /** Body colour bands, top → bottom of the spar. */
  bands: string[];
  /** Topmark cone apex directions, [lower, upper]. */
  cones: [ConeDir, ConeDir];
}

// Positions are a DEMO composition (not true IALA bearings): mid- and background depth along the
// channel toward the sun (az 135), with the two laterals as the foreground pair, so the scene reads
// with depth and an open centre. Body pattern, topmark and LIGHT all follow the standard:
//   N  black/yellow,        cones ▲▲ (up),            VQ            — continuous
//   E  black/yellow/black,  cones ◆ (bases together), VQ(3) 5s
//   S  yellow/black,        cones ▼▼ (down),          VQ(6)+LFl 10s — the long flash is a safety feature
//   W  yellow/black/yellow, cones ✕ (points together),VQ(9) 10s
const cardinalLantern = (rhythm: Rhythm): LanternSpec => ({
  rhythm,
  color: "white", // every cardinal light is white; the RHYTHM carries the information
  candela: candelaForNominalRange(CARDINAL_RANGE_NM),
});

const CARDINALS: CardinalSpec[] = [
  {
    name: "N",
    restX: 2,
    restZ: -14,
    bands: [BLACK, YELLOW],
    cones: ["up", "up"],
    lantern: cardinalLantern(RHYTHMS.cardinalNorth),
  },
  {
    name: "E",
    restX: 14,
    restZ: -6,
    bands: [BLACK, YELLOW, BLACK],
    cones: ["down", "up"],
    lantern: cardinalLantern(RHYTHMS.cardinalEast),
  },
  {
    name: "S",
    restX: 16,
    restZ: -26,
    bands: [YELLOW, BLACK],
    cones: ["down", "down"],
    lantern: cardinalLantern(RHYTHMS.cardinalSouth),
  },
  {
    name: "W",
    restX: -2,
    restZ: -22,
    bands: [YELLOW, BLACK, YELLOW],
    cones: ["up", "down"],
    lantern: cardinalLantern(RHYTHMS.cardinalWest),
  },
];

interface Lantern {
  light: THREE.PointLight;
  lens: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  spec: LanternSpec;
  /** Peak `PointLight.intensity` per signal colour, precomputed so the frame loop only multiplies. */
  intensity: Record<SignalColor, number>;
}

interface Buoy {
  object: THREE.Object3D;
  restX: number;
  restZ: number;
  lantern: Lantern;
}

export interface NavBuoys {
  object: THREE.Object3D;
  /** Ride the buoys on the water at `time` seconds, and run their lamps. Once per frame.
   *  `ambientLux` drives the photocell: real lanterns are dark all day. */
  update: (ocean: Ocean, time: number, ambientLux: number) => void;
  /** Force the lamps on regardless of ambient light. Capture tool + GUI only. */
  setPhotocellOverride: (alwaysOn: boolean) => void;
  dispose: () => void;
}

// A vertical band pattern painted onto a canvas: `bands` run top → bottom, and the cylinder's UV v
// runs bottom → top with the default texture flip, so band[0] ends up at the top of the spar.
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
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; // the swatches above are sRGB hex, not linear
  return texture;
};

export function createNavBuoys(): NavBuoys {
  const root = new THREE.Group();
  const buoys: Buoy[] = [];
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(x: T): T => {
    disposables.push(x);
    return x;
  };

  // Marine polyurethane paint over rotomoulded polyethylene: semi-gloss when new, weathering chalky.
  // Semi-gloss is the honest default for a maintained channel mark.
  const paint = (color: string) =>
    track(new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0 }));

  const lensGeometry = track(new THREE.SphereGeometry(LENS_RADIUS, 16, 12));

  /**
   * A lantern. The `PointLight` carries the photometry; the lens carries the LOOK of a lamp you are
   * staring straight at. Its emissive radiance is `I / A` — the same trick the sun's disc uses, so the
   * lens integrates to exactly the intensity the light emits, and a 5 cd lamp cannot secretly glow
   * like a 500 cd one.
   */
  const makeLantern = (spec: LanternSpec, y: number): Lantern => {
    const intensity = Object.fromEntries(
      (Object.keys(SIGNAL_COLORS) as SignalColor[]).map((c) => [
        c,
        signalLightIntensity(spec.candela, c),
      ]),
    ) as Record<SignalColor, number>;

    const light = new THREE.PointLight(0xffffff, 0, 0, 2); // decay 2 = inverse square, i.e. physics
    light.position.y = y;
    light.castShadow = false; // a lamp on a mast head shadows nothing that matters, and six shadow
    // maps for six buoys would cost more than the entire sky
    const material = track(
      new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.25, metalness: 0 }),
    );
    const lens = new THREE.Mesh(lensGeometry, material);
    lens.position.y = y;
    lens.castShadow = false;
    lens.receiveShadow = false;
    return { light, lens, material, spec, intensity };
  };

  const addMark = (group: THREE.Group, spec: MarkSpec, lantern: Lantern) => {
    group.add(lantern.light);
    group.add(lantern.lens);
    root.add(group);
    buoys.push({ object: group, restX: spec.restX, restZ: spec.restZ, lantern });
  };

  // --- Lateral marks. Region A: red = port, green = starboard. The topmark is the thing a sailor
  // reads at distance: a red CAN to port, a green CONE (point up) to starboard.
  const capsuleGeometry = track(new THREE.CapsuleGeometry(0.4, 1.2, 8, 16));
  const canGeometry = track(new THREE.CylinderGeometry(0.22, 0.22, 0.42, 14));
  const topConeGeometry = track(new THREE.ConeGeometry(0.24, 0.46, 14));
  const lateralMastGeometry = track(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 8));
  const mastMaterial = paint("#2a2a2a");

  const laterals = [
    {
      name: "port",
      restX: -3,
      restZ: -4,
      color: PAINT_RED,
      topmark: "can" as const,
      lantern: {
        rhythm: RHYTHMS.portFlashing,
        color: "red" as SignalColor,
        candela: candelaForNominalRange(LATERAL_RANGE_NM),
      },
    },
    {
      name: "starboard",
      restX: 7,
      restZ: 2,
      color: PAINT_GREEN,
      topmark: "cone" as const,
      lantern: {
        rhythm: RHYTHMS.starboardFlashing,
        color: "green" as SignalColor,
        candela: candelaForNominalRange(LATERAL_RANGE_NM),
      },
    },
  ];

  for (const spec of laterals) {
    const group = new THREE.Group();
    const bodyMaterial = paint(spec.color);
    const body = new THREE.Mesh(capsuleGeometry, bodyMaterial);
    body.position.y = 0.6; // base ~0.4 m under, the rest proud of the surface
    group.add(body);

    const mast = new THREE.Mesh(lateralMastGeometry, mastMaterial);
    mast.position.y = 2.05;
    group.add(mast);

    // The topmark is painted the SAME colour as the body, which is what makes it legible against sky.
    const topmark = new THREE.Mesh(
      spec.topmark === "can" ? canGeometry : topConeGeometry,
      bodyMaterial,
    );
    topmark.position.y = 1.95;
    group.add(topmark);

    addMark(group, spec, makeLantern(spec.lantern, 2.62));
  }

  // --- Cardinal marks: a patterned spar + the two-cone topmark, both above the origin the buoy rides.
  const sparGeometry = track(new THREE.CylinderGeometry(0.3, 0.34, 2.2, 16));
  const mastGeometry = track(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 8));
  const coneGeometry = track(new THREE.ConeGeometry(0.28, 0.5, 12));
  const coneMaterial = paint("#111111");

  for (const spec of CARDINALS) {
    const group = new THREE.Group();

    const pattern = track(makePattern(spec.bands));
    const sparMaterial = track(
      new THREE.MeshStandardMaterial({ map: pattern, roughness: 0.45, metalness: 0 }),
    );
    const spar = new THREE.Mesh(sparGeometry, sparMaterial);
    spar.position.y = 0.8;
    group.add(spar);

    const mast = new THREE.Mesh(mastGeometry, mastMaterial);
    mast.position.y = 2.55;
    group.add(mast);

    const coneY = [2.15, 2.7];
    spec.cones.forEach((dir, i) => {
      const cone = new THREE.Mesh(coneGeometry, coneMaterial);
      cone.position.y = coneY[i];
      if (dir === "down") cone.rotation.x = Math.PI;
      group.add(cone);
    });

    addMark(group, spec, makeLantern(spec.lantern, 3.25));
  }

  // Buoys are opaque solids on open water: they cast onto the sea and onto each other.
  enableShadows(root);

  let photocellOverride = false;

  /** Radiance of a lens emitting `I` over its own projected area. The disc trick, at buoy scale. */
  const lensArea = Math.PI * LENS_RADIUS * LENS_RADIUS;

  const setLamp = (lantern: Lantern, lit: SignalColor | undefined) => {
    if (lit === undefined) {
      lantern.light.intensity = 0;
      lantern.material.emissiveIntensity = 0;
      lantern.material.emissive.setRGB(0, 0, 0);
      return;
    }
    // Destructured, not spread: `SIGNAL_COLORS[lit]` is a UNION of five readonly tuples, and TypeScript
    // will not spread a union into a positional signature.
    const [r, g, b] = SIGNAL_COLORS[lit];
    lantern.light.color.setRGB(r, g, b, THREE.LinearSRGBColorSpace);
    lantern.light.intensity = lantern.intensity[lit];
    // The lens glows at the radiance its own emission implies. Its core will clip to white at any sane
    // exposure, which is exactly what a lantern looks like when you are staring into it.
    lantern.material.emissive.setRGB(r, g, b, THREE.LinearSRGBColorSpace);
    lantern.material.emissiveIntensity = lantern.intensity[lit] / lensArea;
  };

  return {
    object: root,
    update: (ocean, time, ambientLux) => {
      const dark = photocellOverride || ambientLux < PHOTOCELL_SWITCH_ON_LUX;
      for (const buoy of buoys) {
        const ride = ocean.sampleParticle(buoy.restX, buoy.restZ, time);
        buoy.object.position.copy(ride.position);
        buoy.object.quaternion.setFromUnitVectors(UP, ride.normal);

        const phase = dark ? rhythmAt(buoy.lantern.spec.rhythm, time) : undefined;
        setLamp(buoy.lantern, phase === true ? buoy.lantern.spec.color : phase);
      }
    },
    setPhotocellOverride: (alwaysOn) => {
      photocellOverride = alwaysOn;
    },
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}
