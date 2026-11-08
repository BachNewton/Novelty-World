import { Group, Mesh, MeshBasicNodeMaterial, PlaneGeometry, Sphere, Vector3, type BufferGeometry, type Node } from "three/webgpu";
import { float, positionGeometry, smoothstep, vec2, vec3 } from "three/tsl";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { Rotation, Vector3 as Position } from "../../sim/car-state";
import { buildBikeMesh, type BikeDetail } from "./build";
import { riderLook, type RiderLook } from "./look";
import { bikeGeometry, bikeMaterial, bikeSlots, RIDER_SLOTS, riderTokens } from "./material";
import { poseBike, restMotion, stepMotion, type RideInput, type RideMotion } from "./rig";
import type { BikeSpec } from "./specs";
import "./tokens.css";
import { type Sun } from "../sun";

/*
 * A bike to draw, from a position, a rotation and a `RideInput`: the rig makes
 * the rest. The road is at the root's y = 0, and the lean is about the line of
 * the tyres, so a simulation that keeps the bike upright hands the lean over as
 * a number.
 */

/** A soft patch of shade under the bike, half as wide and long as these, slid to the side it leans. */
export const SHADOW = { strength: 0.5, liftM: 0.02, wideM: 0.38, pastAxleM: 0.55, leanM: 0.7 } as const;
export const shadowLengthM = (spec: BikeSpec) => spec.wheelbaseM / 2 + SHADOW.pastAxleM;
const REACH_M = 2.6;

/** The shadow's quad, flat on the ground, two units across. */
export function shadowQuad(): PlaneGeometry {
  const quad = new PlaneGeometry(2, 2);
  quad.rotateX(-Math.PI / 2);
  return quad;
}

/** The shadow's look: soft from the middle of its quad out. `fade` takes it away, for a crowd's shadows at their reach. */
export function bikeShadowMaterial(fade: Node<"float"> = float(1)) {
  const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  material.name = "bike-shadow";
  const { r, g, b } = themeColor("--color-aland-drive-bike-shadow");
  material.colorNode = vec3(r, g, b);
  const outside = vec2(positionGeometry.x, positionGeometry.z).length();
  material.opacityNode = float(1).sub(smoothstep(float(0.35), float(1), outside)).mul(SHADOW.strength).mul(fade);
  return material;
}

/** The geometry, which any number of cyclists of one spec can share. */
export interface BikeArt {
  spec: BikeSpec;
  geometry: BufferGeometry;
  triangles: number;
  bikeTriangles: number;
  dispose: () => void;
}

export function buildBikeArt(spec: BikeSpec, detail: BikeDetail = "near"): BikeArt {
  const mesh = buildBikeMesh(spec, detail);
  const geometry = bikeGeometry(mesh);
  // The rest pose isn't where the vertices end up: each part's sits at its own pivot.
  geometry.boundingSphere = new Sphere(new Vector3(0, 1, 0), REACH_M);
  return { spec, geometry, triangles: mesh.triangles, bikeTriangles: mesh.bikeTriangles, dispose: () => geometry.dispose() };
}

export interface BikeViewOptions {
  /** Whose colours and hair: the same seed is the same rider. */
  seed?: number;
  /** On or off, whatever the seed says. */
  helmet?: boolean;
  /** False draws the bike alone. */
  rider?: boolean;
  /** Hides the head, body and upper arms, for a camera at the eyes. */
  firstPerson?: boolean;
  hazed?: (color: Node<"vec3">) => Node<"vec3">;
}

export function createBikeModel(art: BikeArt, sun: Sun, options: BikeViewOptions = {}) {
  const { spec } = art;
  const { material, setPose, setSlot } = bikeMaterial({ sun, hazed: options.hazed });

  for (const [slot, tokenName] of bikeSlots(spec)) setSlot(slot, tokenName);

  let look: RiderLook = riderLook(options.seed ?? 0, options.helmet);
  const setLook = (seed: number, helmet = options.helmet) => {
    look = riderLook(seed, helmet);
    riderTokens(look).forEach((tokenName, at) => {
      setSlot(RIDER_SLOTS[at], tokenName);
    });
  };
  setLook(options.seed ?? 0);

  // The bike moves every frame and its shadow leans with it; in the game an object stands still unless it says so (`render/game.ts`).
  const root = new Group();
  root.matrixAutoUpdate = true;
  root.add(new Mesh(art.geometry, material));

  const shadowGeometry = shadowQuad();
  const shadowMaterial = bikeShadowMaterial();
  const shadow = new Mesh(shadowGeometry, shadowMaterial);
  shadow.matrixAutoUpdate = true;
  shadow.scale.set(SHADOW.wideM, 1, shadowLengthM(spec));
  shadow.position.y = SHADOW.liftM;
  root.add(shadow);

  const motion: RideMotion = restMotion();
  const pose = (input: RideInput) => {
    const posed = poseBike(spec, input, motion, { rider: options.rider ?? true, helmet: look.helmet, hair: look.hairStyle, firstPerson: options.firstPerson });
    setPose(posed.matrices);
    shadow.position.x = Math.sin(input.lean) * SHADOW.leanM;
    return posed;
  };

  return {
    /** Everything: add this to the scene. */
    root,
    motion,
    setLook,
    /** Places the bike, moves the cycle on by `seconds` and poses it. The pose it returns has the eyes, in the root's frame. */
    draw(position: Position, rotation: Rotation, input: RideInput, seconds: number) {
      root.position.set(...position);
      root.quaternion.set(...rotation);
      stepMotion(motion, input, spec, seconds);
      return pose(input);
    },
    /** Poses it from `motion` as it stands, for a gallery or a replay. */
    pose,
    dispose() {
      material.dispose();
      shadowGeometry.dispose();
      shadowMaterial.dispose();
    },
  };
}

export type BikeModel = ReturnType<typeof createBikeModel>;
