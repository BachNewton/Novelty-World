import * as THREE from "three";
import { enableShadows } from "./sky";
import { MAIN_PASS_LAYER } from "./layers";
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

/**
 * Beyond this range the pooled lamp light stops emitting (metres).
 *
 * Not a look tweak — it is where the photometry says the lamp stops mattering. Allard's law puts a 5 NM
 * cardinal at 77 cd, and illuminance falls as 1/d²: ~3 lux at 5 m (≈ 12× full moonlight), 0.77 lux at
 * 10 m, 0.031 lux at 50 m — under starlight. And that is the OPTIMISTIC figure: a real lantern is a
 * catadioptric optic that throws its energy at the HORIZON, because light spilled on the water is range
 * it did not get. So past ~40 m the lamp illuminates nothing a camera could see, and the lens (which SSR
 * reflects off the water) is doing all the visible work anyway.
 */
const LAMP_LIGHT_RANGE = 40;

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
  /** The glowing lens — what you SEE, and what SSR reflects off the water. NOT a light source: the
   *  reflection is a ray-march of the scene COLOUR capture, which this mesh is already in. */
  lens: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  spec: LanternSpec;
  /** Peak `PointLight.intensity` per signal colour, precomputed so the frame loop only multiplies. */
  intensity: Record<SignalColor, number>;
  /** Height of the lamp above the buoy's origin — where the pooled light must sit when it snaps here. */
  lampY: number;
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
   *  `ambientLux` drives the photocell: real lanterns are dark all day. `eye` is the viewer's world
   *  position — the pooled lamp light snaps to whichever lit lantern is nearest to it (see `lampLight`). */
  update: (ocean: Ocean, time: number, ambientLux: number, eye: THREE.Vector3) => void;
  /** Force the lamps on regardless of ambient light. Capture tool + GUI only. */
  setPhotocellOverride: (alwaysOn: boolean) => void;
  /** Cost probe: suppress the pooled lamp light while the lenses keep glowing (and SSR keeps reflecting
   *  them off the water). Separates what a lantern ILLUMINATES from what a lantern IS — two things that
   *  switch on together and are easy to mistake for one. Measured at 20 m, suppressing the light changes
   *  0.19 % of pixels; the reflected streaks are pixel-for-pixel unchanged. Not a gameplay setting. */
  setLightsEnabled: (on: boolean) => void;
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
   * A lantern's lens: the LOOK of a lamp you are staring straight at. Its emissive radiance is `I / A`
   * — the same trick the sun's disc uses, so the lens integrates to exactly the intensity the lamp
   * emits, and a 5 cd lamp cannot secretly glow like a 500 cd one.
   *
   * The lens carries no light of its own. **It doesn't need to**: the reflected streak on the water is
   * SSR ray-marching the scene COLOUR capture, which this glowing mesh is already in. The illumination
   * a lamp throws is a separate thing, and it comes from the one pooled `lampLight` below.
   */
  const makeLantern = (spec: LanternSpec, y: number): Lantern => {
    const intensity = Object.fromEntries(
      (Object.keys(SIGNAL_COLORS) as SignalColor[]).map((c) => [
        c,
        signalLightIntensity(spec.candela, c),
      ]),
    ) as Record<SignalColor, number>;

    const material = track(
      new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.25, metalness: 0 }),
    );
    const lens = new THREE.Mesh(lensGeometry, material);
    lens.position.y = y;
    lens.castShadow = false;
    lens.receiveShadow = false;
    return { lens, material, spec, intensity, lampY: y };
  };

  /**
   * ONE pooled lantern light, for ALL the marks — a light SLOT, re-pointed each frame at the nearest
   * lamp that is currently flashing, rather than a fixture bolted to each buoy.
   *
   * Why pool instead of one light per buoy. three compiles the light COUNT into every lit material's
   * program: N point lights in the scene means every fragment of every lit surface runs the point-light
   * BRDF loop N times — and the ocean is a lit surface covering the whole screen. Six per-buoy lanterns
   * cost ~3.6 ms of a ~12 ms GPU frame, and the cost grows with the buoy field. A pooled slot costs the
   * same whether the archipelago has six marks or six hundred.
   *
   * And a count that CHANGES recompiles every material — so the slot is never added or removed while
   * lit; when no lamp is near enough to matter it stays in the graph at zero intensity. The only count
   * change is day↔night (one recompile, at dusk, where one is unavoidable anyway).
   *
   * Why keep a light at all, when the measured difference is 0.19 % of pixels: because that measurement
   * was taken 20 m out. Allard's law puts a 5 NM cardinal at 77 cd, which is ~3 lux at 5 m — about 12×
   * full moonlight. The player will sail right up to these. Far away the lamp is invisibly dim and the
   * lens does all the work; close up the light is real, and this is the range where it is real.
   */
  const lampLight = new THREE.PointLight(0xffffff, 0, 0, 2); // decay 2 = inverse square, i.e. physics
  // three layer-filters lights: without this the lantern would not light the water in the merged main
  // pass, which renders MAIN_PASS_LAYER alone (scene.ts routeMainPass).
  lampLight.layers.enable(MAIN_PASS_LAYER);
  lampLight.castShadow = false; // a lamp on a mast head shadows nothing that matters
  lampLight.visible = false; // dark all day; the photocell brings it up
  root.add(lampLight);

  const addMark = (group: THREE.Group, spec: MarkSpec, lantern: Lantern) => {
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
  // Cost probe (bench `--buoy-lights off`): suppress the pooled lamp light entirely; the lenses keep
  // glowing and SSR keeps reflecting them. Measures what the ILLUMINATION is buying, as opposed to the
  // lamp's visible glow — two things that switch on together and are easy to mistake for one.
  let lightsEnabled = true;

  /** Radiance of a lens emitting `I` over its own projected area. The disc trick, at buoy scale. */
  const lensArea = Math.PI * LENS_RADIUS * LENS_RADIUS;

  /** Sets the LENS's glow only. The illumination is the pooled `lampLight`'s job (see below). */
  const setLens = (lantern: Lantern, lit: SignalColor | undefined) => {
    if (lit === undefined) {
      lantern.material.emissiveIntensity = 0;
      lantern.material.emissive.setRGB(0, 0, 0);
      return;
    }
    // Destructured, not spread: `SIGNAL_COLORS[lit]` is a UNION of five readonly tuples, and TypeScript
    // will not spread a union into a positional signature.
    const [r, g, b] = SIGNAL_COLORS[lit];
    // The lens glows at the radiance its own emission implies. Its core will clip to white at any sane
    // exposure, which is exactly what a lantern looks like when you are staring into it.
    lantern.material.emissive.setRGB(r, g, b, THREE.LinearSRGBColorSpace);
    lantern.material.emissiveIntensity = lantern.intensity[lit] / lensArea;
  };

  const lampWorld = new THREE.Vector3();

  return {
    object: root,
    update: (ocean, time, ambientLux, eye) => {
      const dark = photocellOverride || ambientLux < PHOTOCELL_SWITCH_ON_LUX;

      // The pooled light is in the scene at night and out of it by day. That is the ONLY light-count
      // change (one shader recompile, at dusk, where one is unavoidable anyway) — the flash rhythm must
      // never change the count, or every material would recompile several times a second.
      lampLight.visible = dark && lightsEnabled;

      // Re-point the single slot at the nearest lamp that is actually flashing right now.
      let nearestDist = Infinity;
      let nearest: { lantern: Lantern; color: SignalColor } | undefined;

      for (const buoy of buoys) {
        const ride = ocean.sampleParticle(buoy.restX, buoy.restZ, time);
        buoy.object.position.copy(ride.position);
        buoy.object.quaternion.setFromUnitVectors(UP, ride.normal);

        const phase = dark ? rhythmAt(buoy.lantern.spec.rhythm, time) : undefined;
        const lit = phase === true ? buoy.lantern.spec.color : phase;
        setLens(buoy.lantern, lit);

        if (lit === undefined || !lampLight.visible) continue;
        lampWorld.copy(ride.position).setY(ride.position.y + buoy.lantern.lampY);
        const d = lampWorld.distanceTo(eye);
        if (d < nearestDist) {
          nearestDist = d;
          nearest = { lantern: buoy.lantern, color: lit };
          lampLight.position.copy(lampWorld);
        }
      }

      if (nearest === undefined || nearestDist > LAMP_LIGHT_RANGE) {
        // No lamp near enough to light anything. Keep the slot in the graph — removing it would change
        // the light count and recompile every material — and just stop it emitting.
        lampLight.intensity = 0;
        return;
      }
      const [r, g, b] = SIGNAL_COLORS[nearest.color];
      lampLight.color.setRGB(r, g, b, THREE.LinearSRGBColorSpace);
      // The lamp we snapped to carries its OWN photometry — a 5 NM cardinal is 77 cd, a 3 NM lateral
      // 15 cd. Reading the intensity off any other buoy would silently relight the sea with the wrong lamp.
      lampLight.intensity = nearest.lantern.intensity[nearest.color];
    },
    setPhotocellOverride: (alwaysOn) => {
      photocellOverride = alwaysOn;
    },
    setLightsEnabled: (on) => {
      lightsEnabled = on;
    },
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}
