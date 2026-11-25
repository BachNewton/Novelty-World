import * as THREE from "three/webgpu";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { Character } from "../characters";
import { Controls } from "../input/controls";
import { STANDING, stepPlayer, type Move, type Player } from "../player";
import type { Hand, Weapon } from "../weapons";

/** Where the orbit turns, above the player's feet: about the middle of a character, who stands some 0.7 to 0.85 tall. */
const TARGET_HEIGHT = 0.4;
/** The first view: in front and a little to the side, a touch above the head, the characters facing +z. */
const START_EYE = new THREE.Vector3(0.7, 0.75, 1.6);
/** The grid floor's side, in world units, with a line every unit and a stronger one every five. */
const GRID_SIZE = 40;
const GRID_MAJOR = 5;
/** How far round the player the sun casts shadows; it follows them, so this needn't cover the floor. */
const SHADOW_REACH = 2;
/** The sun's place relative to the player. */
const SUN_OFFSET = new THREE.Vector3(1.5, 3, 2);
/**
 * Where a weapon's grip sits in its hand, in the frame of the arm's joint at the shoulder:
 * out along the arm for the right one (the left mirrors it). Its arms are rigid, so one
 * place fits every character; each weapon says which of its own points goes there.
 */
const GRIP = new THREE.Vector3(-0.25, 0.02, 0.03);
/** The longest step the clock takes, so a tab coming back from the background doesn't jump an animation. */
const MAX_STEP = 0.1;
/** How long one clip blends into the next, in seconds: a cut from one pose to another shows as a pop. */
const FADE = 0.15;

export type Backend = "WebGPU" | "WebGL 2";

interface Shown {
  character: string;
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  clips: THREE.AnimationClip[];
  action: THREE.AnimationAction | null;
  playing: string;
}

/**
 * One character at a time on a grid floor, playing one of its clips, walked
 * about with WASD (Shift to sprint), with a camera that follows them and
 * orbits and zooms round them. Plain three.js outside React: the page tells
 * it what to show, and hears which clip plays.
 */
export class CharacterViewer {
  private readonly renderer = new THREE.WebGPURenderer({ antialias: true });
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.05, 60);
  private readonly orbit: OrbitControls;
  private readonly sun = new THREE.DirectionalLight(undefined, 2.2);
  private readonly controls = new Controls();
  private readonly timer = new THREE.Timer();
  private readonly loader = new GLTFLoader();
  /** Every file loaded, by its address: each loads once. */
  private readonly files = new Map<string, Promise<GLTF>>();
  private readonly resize: ResizeObserver;
  private player: Player = STANDING;
  private shown: Shown | null = null;
  /** The character asked for last: a load that finishes after a later pick is not shown. */
  private wanted: string | null = null;
  /** The weapon asked for last, and in which hand; a character shown later holds it too. */
  private holding: { weapon: Weapon; hand: Hand } | null = null;
  /** The weapon in the hand now, once its file has loaded. */
  private held: THREE.Object3D | null = null;
  private drawable = false;
  private disposed = false;

  constructor(
    private readonly container: HTMLElement,
    onDeviceLost: (message: string) => void,
    /** Told whenever the clip playing changes by itself: the player set off, or stopped. */
    private readonly onPlaying: (clip: string) => void,
  ) {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.onDeviceLost = (info) => {
      this.renderer.setAnimationLoop(null);
      onDeviceLost(`${info.api} device lost: ${info.message}`);
    };
    this.renderer.domElement.className = "block h-full w-full";
    container.appendChild(this.renderer.domElement);

    this.scene.background = themeColor("--color-surface-secondary");
    this.scene.add(new THREE.HemisphereLight(undefined, themeColor("--color-surface-elevated"), 1.6));
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, { left: -SHADOW_REACH, right: SHADOW_REACH, top: SHADOW_REACH, bottom: -SHADOW_REACH, near: 0.5, far: 8 });
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun, this.sun.target);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE),
      new THREE.MeshStandardMaterial({ color: themeColor("--color-surface-tertiary") }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    const minor = themeColor("--color-border-hover");
    const major = themeColor("--color-text-muted");
    const lines = new THREE.GridHelper(GRID_SIZE, GRID_SIZE, minor, minor);
    const majorLines = new THREE.GridHelper(GRID_SIZE, GRID_SIZE / GRID_MAJOR, major, major);
    // Lifted off the floor, so the lines don't fight it for depth.
    lines.position.y = 0.002;
    majorLines.position.y = 0.003;
    this.scene.add(floor, lines, majorLines);

    this.camera.position.copy(START_EYE);
    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbit.target.set(0, TARGET_HEIGHT, 0);
    this.orbit.enablePan = false;
    this.orbit.enableDamping = true;
    this.orbit.minDistance = 0.4;
    this.orbit.maxDistance = 6;
    // Never below the floor.
    this.orbit.maxPolarAngle = Math.PI / 2 - 0.02;
    this.orbit.update();
    this.placeSun();

    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(container);
    this.fit();
  }

  /** Start drawing, once the GPU is ready. Says which backend the renderer got: WebGPU, or its WebGL 2 fallback. */
  async start(): Promise<Backend | null> {
    await this.renderer.init();
    if (this.disposed) return null;
    this.timer.connect(document);
    this.renderer.setAnimationLoop((time) => this.frame(time));
    return "isWebGPUBackend" in this.renderer.backend ? "WebGPU" : "WebGL 2";
  }

  /**
   * Show a character playing `clip`, or its first clip when it has no clip of
   * that name, where the player stands. Resolves with its clips' names and the
   * one playing, or null when a later pick (or closing the viewer) overtook it.
   */
  async show(character: Character, clip: string): Promise<{ clips: string[]; playing: string } | null> {
    this.wanted = character.id;
    const gltf = await this.fileOf(character.url);
    if (this.disposed || this.wanted !== character.id) return null;
    if (gltf.animations.length === 0) throw new Error(`adventure: ${character.id} has no animations`);

    this.hide();
    gltf.scene.traverse((child) => {
      if (child instanceof THREE.Mesh) child.castShadow = true;
    });
    this.scene.add(gltf.scene);
    const names = gltf.animations.map((c) => c.name);
    const shown: Shown = {
      character: character.id,
      root: gltf.scene,
      mixer: new THREE.AnimationMixer(gltf.scene),
      clips: gltf.animations,
      action: null,
      playing: "",
    };
    this.shown = shown;
    this.placeCharacter();
    this.attachHeld();
    const moving = this.player.gait !== "idle";
    this.playOn(shown, moving ? this.player.gait : names.includes(clip) ? clip : names[0], false);
    return { clips: names, playing: shown.playing };
  }

  /** Play one of the shown character's clips, looping, from its start, until the player sets off or stops. */
  play(clip: string): void {
    if (this.shown === null) throw new Error("adventure: no character is shown");
    this.playOn(this.shown, clip, true);
  }

  /** Put a weapon in one of the shown character's hands, or none in either. */
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
    this.held = gltf.scene;
    this.held.traverse((child) => {
      if (child instanceof THREE.Mesh) child.castShadow = true;
    });
    this.attachHeld();
  }

  /** Parent the held weapon to the hand's arm joint, so it follows every clip. */
  private attachHeld(): void {
    if (this.held === null || this.holding === null || this.shown === null) return;
    const arm = this.shown.root.getObjectByName(`arm-${this.holding.hand}`);
    if (arm === undefined) throw new Error(`adventure: ${this.shown.character} has no arm-${this.holding.hand}`);
    const [x, y, z] = this.holding.weapon.grip;
    this.held.position.copy(GRIP).sub(new THREE.Vector3(x, y, z));
    if (this.holding.hand === "left") this.held.position.x = -GRIP.x - x;
    arm.add(this.held);
  }

  private detachHeld(): void {
    this.held?.removeFromParent();
    this.held = null;
  }

  /** Blend into a clip from whatever played before, or cut to it when `fade` is off (a character just shown). */
  private playOn(shown: Shown, name: string, fade: boolean): void {
    const clip = THREE.AnimationClip.findByName(shown.clips, name);
    if (clip === null) throw new Error(`adventure: ${shown.character} has no clip ${name}`);
    const next = shown.mixer.clipAction(clip);
    if (next === shown.action) return;
    if (shown.action === null || !fade) shown.mixer.stopAllAction();
    next.reset().setEffectiveWeight(1).play();
    if (shown.action !== null && fade) shown.action.crossFadeTo(next, FADE, false);
    shown.action = next;
    shown.playing = name;
  }

  private hide(): void {
    if (this.shown === null) return;
    this.shown.mixer.stopAllAction();
    this.shown.mixer.uncacheRoot(this.shown.root);
    this.scene.remove(this.shown.root);
    this.shown = null;
  }

  /** A file, loaded once: a character or weapon shown again reuses its scene. */
  private fileOf(url: string): Promise<GLTF> {
    let file = this.files.get(url);
    if (file === undefined) {
      file = this.loader.loadAsync(url);
      this.files.set(url, file);
    }
    return file;
  }

  /** What the controls ask for, turned from the camera's view onto the ground: ahead goes away from the camera. */
  private move(): Move {
    const { ahead, right, sprint } = this.controls.read();
    if (ahead === 0 && right === 0) return { x: 0, z: 0, sprint };
    const look = this.camera.getWorldDirection(new THREE.Vector3());
    const forward = new THREE.Vector2(look.x, look.z).normalize();
    // Right of the view, on the ground: the forward direction turned a quarter clockwise seen from above.
    return { x: forward.x * ahead - forward.y * right, z: forward.y * ahead + forward.x * right, sprint };
  }

  private walk(dt: number): void {
    const before = this.player;
    this.player = stepPlayer(before, this.move(), dt, GRID_SIZE / 2 - 0.5);
    const shift = new THREE.Vector3(this.player.x - before.x, 0, this.player.z - before.z);
    this.camera.position.add(shift);
    this.orbit.target.add(shift);
    this.placeCharacter();
    this.placeSun();
    if (this.player.gait !== before.gait && this.shown !== null) {
      // The gaits are named for the clips that show them.
      this.playOn(this.shown, this.player.gait, true);
      this.onPlaying(this.shown.playing);
    }
  }

  private placeCharacter(): void {
    if (this.shown === null) return;
    this.shown.root.position.set(this.player.x, 0, this.player.z);
    this.shown.root.rotation.y = this.player.yaw;
  }

  private placeSun(): void {
    this.sun.target.position.set(this.player.x, 0, this.player.z);
    this.sun.position.copy(this.sun.target.position).add(SUN_OFFSET);
  }

  private fit(): void {
    const { clientWidth: width, clientHeight: height } = this.container;
    // A hidden container has no size, and a canvas without one is no surface to draw on.
    this.drawable = width > 0 && height > 0;
    if (!this.drawable) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private frame(time: number): void {
    this.timer.update(time);
    const dt = Math.min(this.timer.getDelta(), MAX_STEP);
    this.walk(dt);
    this.shown?.mixer.update(dt);
    this.orbit.update();
    if (this.drawable) this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.resize.disconnect();
    this.controls.dispose();
    this.orbit.dispose();
    this.timer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
