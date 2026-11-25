import * as THREE from "three/webgpu";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { Character } from "../characters";

/** Where the orbit turns: about the middle of a character, who stands some 0.7 to 0.85 tall. */
const TARGET = new THREE.Vector3(0, 0.4, 0);
/** The first view: in front and a little to the side, a touch above the head, the characters facing +z. */
const START_EYE = new THREE.Vector3(0.7, 0.75, 1.6);
/** How far the stage's floor reaches round the character, and so the sun's shadows. */
const FLOOR_RADIUS = 1.2;
/** The longest step the clock takes, so a tab coming back from the background doesn't jump an animation. */
const MAX_STEP = 0.1;

export type Backend = "WebGPU" | "WebGL 2";

interface Shown {
  character: string;
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  clips: THREE.AnimationClip[];
  playing: string;
}

/**
 * One character at a time on a plain round floor, playing one of its clips,
 * with a camera that orbits and zooms round it. Plain three.js outside React:
 * the page tells it what to show.
 */
export class CharacterViewer {
  private readonly renderer = new THREE.WebGPURenderer({ antialias: true });
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.05, 30);
  private readonly controls: OrbitControls;
  private readonly timer = new THREE.Timer();
  private readonly loader = new GLTFLoader();
  private readonly files = new Map<string, Promise<GLTF>>();
  private readonly resize: ResizeObserver;
  private shown: Shown | null = null;
  /** The character asked for last: a load that finishes after a later pick is not shown. */
  private wanted: string | null = null;
  private drawable = false;
  private disposed = false;

  constructor(
    private readonly container: HTMLElement,
    onDeviceLost: (message: string) => void,
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
    const sun = new THREE.DirectionalLight(undefined, 2.2);
    sun.position.set(1.5, 3, 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -FLOOR_RADIUS, right: FLOOR_RADIUS, top: FLOOR_RADIUS, bottom: -FLOOR_RADIUS, near: 0.5, far: 8 });
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(FLOOR_RADIUS, 64),
      new THREE.MeshStandardMaterial({ color: themeColor("--color-surface-tertiary") }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    this.camera.position.copy(START_EYE);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(TARGET);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.minDistance = 0.4;
    this.controls.maxDistance = 6;
    // Never below the floor.
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02;
    this.controls.update();

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
   * that name. Resolves with its clips' names and the one playing, or null
   * when a later pick (or closing the viewer) overtook it.
   */
  async show(character: Character, clip: string): Promise<{ clips: string[]; playing: string } | null> {
    this.wanted = character.id;
    const gltf = await this.fileOf(character);
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
      playing: "",
    };
    this.shown = shown;
    this.playOn(shown, names.includes(clip) ? clip : names[0]);
    return { clips: names, playing: shown.playing };
  }

  /** Play one of the shown character's clips, looping, from its start. */
  play(clip: string): void {
    if (this.shown === null) throw new Error("adventure: no character is shown");
    if (this.shown.playing !== clip) this.playOn(this.shown, clip);
  }

  private playOn(shown: Shown, name: string): void {
    const clip = THREE.AnimationClip.findByName(shown.clips, name);
    if (clip === null) throw new Error(`adventure: ${shown.character} has no clip ${name}`);
    shown.mixer.stopAllAction();
    shown.mixer.clipAction(clip).play();
    shown.playing = name;
  }

  private hide(): void {
    if (this.shown === null) return;
    this.shown.mixer.stopAllAction();
    this.shown.mixer.uncacheRoot(this.shown.root);
    this.scene.remove(this.shown.root);
    this.shown = null;
  }

  /** Each character's file, loaded once: a character shown again reuses its scene. */
  private fileOf(character: Character): Promise<GLTF> {
    let file = this.files.get(character.id);
    if (file === undefined) {
      file = this.loader.loadAsync(character.url);
      this.files.set(character.id, file);
    }
    return file;
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
    this.shown?.mixer.update(Math.min(this.timer.getDelta(), MAX_STEP));
    this.controls.update();
    if (this.drawable) this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.resize.disconnect();
    this.controls.dispose();
    this.timer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
