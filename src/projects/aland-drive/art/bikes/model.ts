import { Group, Mesh, MeshBasicNodeMaterial, PlaneGeometry, Sphere, Vector3, type BufferGeometry, type Node } from "three/webgpu";
import { float, positionGeometry, smoothstep, vec2, vec3 } from "three/tsl";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { Rotation, Vector3 as Position } from "../../sim/car-state";
import { buildBikeMesh, type BikeDetail } from "./build";
import { riderLook, type RiderLook } from "./look";
import { bikeGeometry, bikeMaterial } from "./material";
import { poseBike, restMotion, stepMotion, type RideInput, type RideMotion } from "./rig";
import type { BikeSpec } from "./specs";
import "./tokens.css";

/*
 * A bike to draw, from a position, a rotation and a `RideInput`: the rig makes
 * the rest. The road is at the root's y = 0, and the lean is about the line of
 * the tyres, so a simulation that keeps the bike upright hands the lean over as
 * a number.
 */

const SHADOW_STRENGTH = 0.5;
const SHADOW_LIFT_M = 0.02;
const SHADOW_WIDE_M = 0.38;
const SHADOW_PAST_AXLE_M = 0.55;
const SHADOW_LEAN_M = 0.7;
const REACH_M = 2.6;

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
  /** Hides the head and body, for a camera at the eyes. */
  firstPerson?: boolean;
  hazed?: (color: Node<"vec3">) => Node<"vec3">;
}

export function createBikeModel(art: BikeArt, sun: { azimuthDeg: number; elevationDeg: number }, options: BikeViewOptions = {}) {
  const { spec } = art;
  const { material, setPose, setSlot } = bikeMaterial({ sun, hazed: options.hazed });

  setSlot("frame", spec.paint);
  setSlot("accent", spec.accent);
  setSlot("tyre", "bike-tyre");
  setSlot("metal", "bike-metal");
  setSlot("dark", "bike-dark");
  setSlot("saddle", "bike-saddle");
  setSlot("bag", "bike-bag");
  setSlot("basket", "bike-basket");
  setSlot("lamp", "bike-lamp");

  let look: RiderLook = riderLook(options.seed ?? 0, options.helmet);
  const setLook = (seed: number, helmet = options.helmet) => {
    look = riderLook(seed, helmet);
    setSlot("skin", look.skin);
    setSlot("hair", look.hair);
    setSlot("top", look.top);
    setSlot("bottom", look.bottom);
    setSlot("shoe", look.shoe);
    setSlot("helmet", look.helmetColour);
  };
  setLook(options.seed ?? 0);

  const root = new Group();
  root.add(new Mesh(art.geometry, material));

  const shadowGeometry = new PlaneGeometry(2, 2);
  shadowGeometry.rotateX(-Math.PI / 2);
  const shadowMaterial = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  const { r, g, b } = themeColor("--color-aland-drive-bike-shadow");
  shadowMaterial.colorNode = vec3(r, g, b);
  const outside = vec2(positionGeometry.x, positionGeometry.z).length();
  shadowMaterial.opacityNode = float(1).sub(smoothstep(float(0.35), float(1), outside)).mul(SHADOW_STRENGTH);
  const shadow = new Mesh(shadowGeometry, shadowMaterial);
  shadow.scale.set(SHADOW_WIDE_M, 1, spec.wheelbaseM / 2 + SHADOW_PAST_AXLE_M);
  shadow.position.y = SHADOW_LIFT_M;
  root.add(shadow);

  const motion: RideMotion = restMotion();
  const pose = (input: RideInput) => {
    const posed = poseBike(spec, input, motion, { rider: options.rider ?? true, helmet: look.helmet, hair: look.hairStyle, firstPerson: options.firstPerson });
    setPose(posed.matrices);
    shadow.position.x = Math.sin(input.lean) * SHADOW_LEAN_M;
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
