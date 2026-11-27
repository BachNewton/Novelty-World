import * as THREE from "three/webgpu";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { themeColor } from "@/shared/lib/three/theme-color";
import { ANIMAL_SCALE, ANIMALS, animalOrThrow, type AnimalId } from "../animals";
import { CHARACTERS, characterOrThrow, type CharacterId } from "../characters";
import type { ControlState } from "../input/controls";
import { STANDING } from "../player";
import { WEAPONS, type Hand, type Weapon } from "../weapons";
import { grip } from "./held";
import { PlayerView } from "./player-view";
import { Snapshots } from "./snapshot";

/** What stands on the stage: one of the characters, or one of the animals. */
export type Subject = { kind: "character"; id: CharacterId } | { kind: "animal"; id: AnimalId };

/** A portrait's name: what it shows, so a character, an animal and a weapon never share one. */
export const portraitOf = (kind: Subject["kind"] | "weapon", id: string): string => `${kind}:${id}`;

const urlOf = (subject: Subject): string => (subject.kind === "character" ? characterOrThrow(subject.id) : animalOrThrow(subject.id)).url;

/** The stage's floor: a disc of the world's grass, this wide. */
const STAGE_RADIUS = 0.9;
const STAGE_DEPTH = 0.08;
/** The first view of the stage: in front and a little to the side, a little above, the subject facing +z. */
const START_EYE = new THREE.Vector3(1, 0.6, 2.2);
/** How much of the frame's height a subject fills at first, and the nearest and furthest the camera goes, by the subject's size. */
const FILL = 0.4;
const NEAREST = 0.6;
const FURTHEST = 6;
/**
 * The frame every character is seen in, as tall and as wide as the tallest stands
 * in its clips: a skinned model's bounds are its bind pose's, arms out, so a
 * character is framed by this rather than by its own.
 */
const CHARACTER_FRAME = { height: 0.85, reach: 0.85 };
/** How far round the subject the sun casts shadows on the stage. */
const SHADOW_REACH = 1;

/** The lens the portraits are taken with, and the way it looks from: in front, a little to the subject's left and above, as a portrait is taken. */
const PORTRAIT_FOV = 30;
const PORTRAIT_FROM = new THREE.Vector3(0.45, 0.25, 1).normalize();
/** A character's portrait is head and shoulders: the frame's middle this far above the head's joint, and this tall. */
const HEAD_ABOVE_JOINT = 0.1;
const HEAD_FRAME = 0.42;
/** An animal's or a weapon's portrait is the whole of it, filling this much of the frame. */
const WHOLE_FILL = 0.9;

/**
 * The character and animal viewer's stage: a small scene of its own, a disc of
 * grass under a sun, with one character or animal standing on it, playing any
 * of its clips, a character holding a weapon in either hand, and a camera that
 * orbits and zooms round it. It is drawn in the world's place while the viewer
 * is open, by the same renderer, and is nothing to play while it is shut: the
 * frame loop never touches it, and its camera's controls are off. It also takes
 * the roster's portraits, once each.
 */
export class Stage {
  private readonly scene = new THREE.Scene();
  /** The subject as a player standing still at the stage's middle, so it plays and blends its clips, and is orbited, as a player is. */
  private readonly view: PlayerView;
  private readonly sun = new THREE.DirectionalLight(undefined, 2.2);
  /** The subject asked for last; what stands on the stage once its file has loaded. */
  private asked: Subject | null = null;
  private subject: Subject | null = null;
  /** The weapon asked for last, and in which hand, and its model once loaded. */
  private holding: { weapon: Weapon; hand: Hand } | null = null;
  private held: THREE.Object3D | null = null;
  private size = { width: 0, height: 0 };
  private portraitsTaken: Promise<void> | null = null;
  private disposed = false;
  open = false;

  constructor(
    private readonly renderer: THREE.WebGPURenderer,
    private readonly fileOf: (url: string) => Promise<GLTF>,
  ) {
    this.scene.add(new THREE.HemisphereLight(undefined, themeColor("--color-surface-elevated"), 1.6));
    this.sun.position.set(1.5, 3, 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, { left: -SHADOW_REACH, right: SHADOW_REACH, top: SHADOW_REACH, bottom: -SHADOW_REACH, near: 0.5, far: 8 });
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun, this.sun.target);
    const floor = new THREE.Mesh(
      new THREE.CylinderGeometry(STAGE_RADIUS, STAGE_RADIUS, STAGE_DEPTH, 64),
      new THREE.MeshStandardMaterial({ color: themeColor("--color-adventure-grass") }),
    );
    floor.position.y = -STAGE_DEPTH / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.view = new PlayerView(STANDING, START_EYE, renderer.domElement);
    this.view.orbit.enabled = false;
  }

  /** Open the viewer, its camera's controls with it, or shut it. */
  setOpen(open: boolean): void {
    this.open = open;
    this.view.orbit.enabled = open;
  }

  /**
   * Stand a character or an animal on the stage playing `clip`, or its idle
   * when it has no clip of that name, a character holding what was asked for.
   * Resolves with its clips' names and the one playing, or null when another
   * was asked for first.
   */
  async show(subject: Subject, clip: string): Promise<{ clips: string[]; playing: string } | null> {
    this.asked = subject;
    const gltf = await this.fileOf(urlOf(subject));
    if (this.disposed || this.asked !== subject) return null;
    const root = clone(gltf.scene);
    root.traverse((child) => {
      if (child instanceof THREE.Mesh) child.castShadow = true;
    });
    // At the size it stands in the world, as the pack is drawn there.
    if (subject.kind === "animal") root.scale.setScalar(ANIMAL_SCALE);
    const before = this.view.shown;
    before?.mixer.stopAllAction();
    before?.root.removeFromParent();
    this.scene.add(root);
    const names = gltf.animations.map((c) => c.name);
    this.view.show({ character: subject.id, root, mixer: new THREE.AnimationMixer(root), clips: gltf.animations, action: null, playing: "" }, names.includes(clip) ? clip : "idle");
    this.subject = subject;
    this.attachHeld();
    this.aim(subject.kind === "character" ? CHARACTER_FRAME : sizeOf(root));
    return { clips: names, playing: this.view.shown?.playing ?? clip };
  }

  /** Play one of the subject's clips, looping, blended from the last. */
  play(clip: string): void {
    this.view.playOn(clip, true);
  }

  /** Put a weapon in one of a character's hands on the stage, or none in either. */
  async hold(weapon: Weapon | null, hand: Hand): Promise<void> {
    const holding = weapon === null ? null : { weapon, hand };
    this.holding = holding;
    if (holding === null) {
      this.detachHeld();
      return;
    }
    const gltf = await this.fileOf(holding.weapon.url);
    if (this.disposed || this.holding !== holding) return;
    this.detachHeld();
    this.held = gltf.scene.clone();
    this.held.traverse((child) => {
      if (child instanceof THREE.Mesh) child.castShadow = true;
    });
    this.attachHeld();
  }

  private attachHeld(): void {
    const shown = this.view.shown;
    if (this.held === null || this.holding === null || shown === null || this.subject?.kind !== "character") return;
    grip(shown.root, this.held, this.holding.weapon, this.holding.hand);
  }

  private detachHeld(): void {
    this.held?.removeFromParent();
    this.held = null;
  }

  /** Aim the camera at a subject of a size just stood on the stage, from the way it looked before, near enough that it fills the frame as much for a bee as for a giraffe. */
  private aim({ height, reach }: { height: number; reach: number }): void {
    const { orbit, camera } = this.view;
    const way = camera.position.clone().sub(orbit.target).normalize();
    const distance = height / FILL / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    orbit.minDistance = reach * NEAREST;
    orbit.maxDistance = reach * FURTHEST;
    orbit.target.set(0, height / 2, 0);
    camera.position.copy(orbit.target).addScaledVector(way, distance);
    orbit.update();
  }

  /** A frame of the viewer: the camera turned, tilted and zoomed as the controls ask, and the clip played on. */
  frame(asked: ControlState, dt: number): void {
    this.view.turnCamera(asked, dt);
    this.view.shown?.mixer.update(dt);
    this.view.orbit.update();
  }

  /** Draw the stage over the whole canvas. */
  draw(): void {
    const { clientWidth: width, clientHeight: height } = this.renderer.domElement;
    if (width !== this.size.width || height !== this.size.height) {
      this.size = { width, height };
      this.view.fit(width, height);
    }
    this.renderer.render(this.scene, this.view.camera);
  }

  /**
   * Take every character's, animal's and weapon's portrait, telling each as it
   * is made: drawn once, on the renderer, into an offscreen target of the
   * format the screen is drawn through, read back and kept as an image. Taken
   * once; asked again, it is the same promise.
   */
  portraits(taken: (name: string, url: string) => void): Promise<void> {
    this.portraitsTaken ??= this.takePortraits(taken);
    return this.portraitsTaken;
  }

  private async takePortraits(taken: (name: string, url: string) => void): Promise<void> {
    const snapshots = new Snapshots(this.renderer, PORTRAIT_FOV);
    const sitters = [
      ...CHARACTERS.map((c) => ({ name: portraitOf("character", c.id), url: c.url, kind: "character" as const })),
      ...ANIMALS.map((a) => ({ name: portraitOf("animal", a.id), url: a.url, kind: "animal" as const })),
      ...WEAPONS.map((w) => ({ name: portraitOf("weapon", w.id), url: w.url, kind: "weapon" as const })),
    ];
    try {
      for (const sitter of sitters) {
        const gltf = await this.fileOf(sitter.url);
        if (this.disposed) return;
        const root = clone(gltf.scene);
        // Posed in the first frame of its idle, a character's arms down rather than out as it rests in the file.
        const idle = THREE.AnimationClip.findByName(gltf.animations, "idle");
        if (idle !== null) new THREE.AnimationMixer(root).clipAction(idle).play().getMixer().update(0);
        const portrait = await snapshots.take(root, (camera) => {
          if (sitter.kind === "character") aimAtHead(camera, root);
          else aimAtWhole(camera, root, sitter.kind === "weapon");
        });
        taken(sitter.name, portrait);
      }
    } finally {
      snapshots.dispose();
    }
  }

  dispose(): void {
    this.disposed = true;
    this.view.dispose();
  }
}

/** A rigid model's size: its height, and its longest side. */
function sizeOf(root: THREE.Object3D): { height: number; reach: number } {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const height = box.max.y - box.min.y;
  return { height, reach: Math.max(height, box.max.x - box.min.x, box.max.z - box.min.z) };
}

/** Aim a portrait's camera at a posed character's head and shoulders, by its head's joint, which every character shares. */
function aimAtHead(camera: THREE.PerspectiveCamera, root: THREE.Object3D): void {
  const head = root.getObjectByName("head");
  if (head === undefined) throw new Error(`adventure: ${root.name} has no head`);
  const at = head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, HEAD_ABOVE_JOINT, 0));
  const distance = HEAD_FRAME / 2 / Math.tan(THREE.MathUtils.degToRad(PORTRAIT_FOV) / 2);
  camera.position.copy(at).addScaledVector(PORTRAIT_FROM, distance);
  camera.lookAt(at);
}

/** Aim a portrait's camera at the whole of a model: an animal from the front, a weapon side on. */
function aimAtWhole(camera: THREE.PerspectiveCamera, root: THREE.Object3D, sideOn: boolean): void {
  const sphere = new THREE.Box3().setFromObject(root).getBoundingSphere(new THREE.Sphere());
  const from = sideOn ? new THREE.Vector3(1, 0.2, 0.25).normalize() : PORTRAIT_FROM;
  const distance = sphere.radius / WHOLE_FILL / Math.sin(THREE.MathUtils.degToRad(PORTRAIT_FOV) / 2);
  camera.position.copy(sphere.center).addScaledVector(from, distance);
  camera.lookAt(sphere.center);
}
