import * as THREE from "three/webgpu";
import { cameraProjectionMatrix, equirectUV, modelViewMatrix, positionLocal, texture, vec4 } from "three/tsl";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { themeColor } from "@/shared/lib/three/theme-color";
import { characterOrThrow, type Character } from "../characters";
import { Controls, type ControlState } from "../input/controls";
import { piecesOf, SCATTERED, type MapDocument } from "../editor/map";
import type { Placement } from "../town";
import { benchMarks } from "./bench-marks";
import { DebugOverlay } from "./debug-overlay";
import { MapEditor, type EditorListeners } from "./map-editor";
import { buildMerged } from "./merged";
import { buildTown } from "./town";
import { TownLayer } from "./town-layer";
import { STANDING, STEP, stepPlayer, type Move, type Player } from "../player";
import { SEATS, yawOf, type Villager } from "../villagers";
import type { Hand, Weapon } from "../weapons";

/** Where the orbit turns, above the player's feet: about the middle of a character, who stands some 0.7 to 0.85 tall. */
const TARGET_HEIGHT = 0.4;
/** The first view: in front and a little to the side, a touch above the head, the characters facing +z. */
const START_EYE = new THREE.Vector3(0.7, 0.75, 1.6);
/** The grid floor's side, in world units, with a line every unit and a stronger one every five. */
const GRID_SIZE = 40;
const GRID_MAJOR = 5;
/** How far the grid floor lies below y = 0, where the characters and the town's pieces stand: under the lowest ground the kits lay, a path's bed, so the ground covers it. */
const FLOOR_DROP = -0.08;
/**
 * How far round the player the sun casts shadows. It follows them, and only the
 * player casts a shadow, so nothing else moves in and out of the sun's reach.
 */
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
/** How fast the arrow keys swing the camera round the player, and tilt it, in radians a second. */
const TURN_SPEED = 2;
const TILT_SPEED = 1.2;
/** How fast + and − zoom: the camera's distance from the player changes by this factor of e a second, so a zoom feels as fast near as far. */
const ZOOM_SPEED = 1.5;
/**
 * How long, in seconds, the character's drawn height takes to settle (to about a
 * third of the way) after the ground under them steps up or down, so stepping
 * into a path's bed or up a stair reads as a step rather than a jolt; and the
 * camera's, slower, so it follows the ground's rise and fall but not a jump.
 */
const SETTLE_TIME = 0.06;
const CAMERA_SETTLE_TIME = 0.25;
const DOWN = new THREE.Vector3(0, -1, 0);
/** How far above a character's feet the overlay names them: over their head. */
const CHARACTER_LABEL_HEIGHT = 0.95;
/** How far above a piece's top, or a part of the town's, the overlay names it. */
const PIECE_LABEL_GAP = 0.08;
const PLACE_LABEL_GAP = 0.5;

/** Where the player stands, as the overlay reports it: their cell, by its −x, −z corner as the code names cells, and their exact place. */
export interface Whereabouts {
  cell: readonly [number, number];
  at: readonly [number, number];
}

/** Spreads the villagers' idles through the clip, so none breathe in step: the golden ratio's fraction never repeats a phase. */
const IDLE_PHASE = 0.618;

export type Backend = "WebGPU" | "WebGL 2";

/** The parts of the world a tool can leave out of the frame. */
export type Part = "sky" | "town" | "ground" | "villagers";

interface Shown {
  character: string;
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  clips: THREE.AnimationClip[];
  action: THREE.AnimationAction | null;
  playing: string;
}

/**
 * The player's character on a grid floor, playing one of its clips, walked
 * about with WASD (Shift to sprint), with a camera that follows them and
 * orbits and zooms round them, by mouse or arrow keys; the village and its
 * villagers stand round. Plain three.js outside React: the page tells it what
 * to show, and hears which clip plays.
 */
export class CharacterViewer {
  private readonly renderer = new THREE.WebGPURenderer({ antialias: true, trackTimestamp: new URLSearchParams(window.location.search).has("gpu-time") });
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
  /**
   * OrbitControls turns a drag with Shift held into a pan, and with a left button
   * bound to pan, into an orbit. Shift sprints here and panning is off, so each
   * press binds the left button to whichever makes this drag orbit.
   */
  private readonly orbitEvenSprinting = (event: PointerEvent): void => {
    // The map editor binds the buttons its own way while it is open.
    if (this.editor?.active === true) return;
    this.orbit.mouseButtons.LEFT = event.shiftKey ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
  };
  private player: Player = STANDING;
  /** What the player can stand on: the ground's tile in each cell, by the cell, and the grid floor where there are none. */
  private readonly tiles = new Map<string, () => THREE.Object3D>();
  private readonly floor: THREE.Object3D;
  private readonly ray = new THREE.Raycaster();
  /** How far the character is drawn above their feet, which eases to nothing after the ground under them steps. */
  private settle = 0;
  /** The height the camera follows: the ground the player last stood on, eased. */
  private cameraHeight = 0;
  private shown: Shown | null = null;
  /** Each villager's mixer, playing its idle. */
  private readonly idles: THREE.AnimationMixer[] = [];
  /** The villagers standing on the ground, stood again on it once it is laid. */
  private readonly standing: { villager: Villager; root: THREE.Object3D }[] = [];
  /** The weapon asked for last, and in which hand; the character holds it once both have loaded. */
  private holding: { weapon: Weapon; hand: Hand } | null = null;
  /** The weapon in the hand now, once its file has loaded. */
  private held: THREE.Object3D | null = null;
  private drawable = false;
  private disposed = false;
  private readonly overlay = new DebugOverlay();
  /** The map's editor, once the map is drawn. */
  private editor: MapEditor | null = null;
  private layer: TownLayer | null = null;
  /** The world's parts, each as the objects it adds to the scene, for tools to leave out one at a time. */
  private readonly parts = new Map<Part, THREE.Object3D[]>();
  /** Whether the debug overlay is open, toggled by its key. */
  private overlayOpen = false;
  /** What the overlay last reported, so it reports only a change. */
  private reported = "";

  constructor(
    private readonly container: HTMLElement,
    onDeviceLost: (message: string) => void,
    /** Told whenever the clip playing changes by itself: the player set off, or stopped. */
    private readonly onPlaying: (clip: string) => void,
    /** Told where the player stands while the overlay is open, and null when it closes. */
    private readonly onWhereabouts: (where: Whereabouts | null) => void,
  ) {
    this.renderer.setPixelRatio(pixelRatio());
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
    floor.position.y = FLOOR_DROP;
    floor.receiveShadow = true;
    const minor = themeColor("--color-border-hover");
    const major = themeColor("--color-text-muted");
    const lines = new THREE.GridHelper(GRID_SIZE, GRID_SIZE, minor, minor);
    const majorLines = new THREE.GridHelper(GRID_SIZE, GRID_SIZE / GRID_MAJOR, major, major);
    // Lifted off the floor, so the lines don't fight it for depth, and still under the pieces.
    lines.position.y = FLOOR_DROP + 0.002;
    majorLines.position.y = FLOOR_DROP + 0.003;
    this.scene.add(floor, lines, majorLines, this.overlay.group);
    this.floor = floor;

    this.camera.position.copy(START_EYE);
    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbit.target.set(0, TARGET_HEIGHT, 0);
    this.orbit.enablePan = false;
    this.orbit.enableDamping = true;
    this.orbit.minDistance = 0.4;
    this.orbit.maxDistance = 12;
    // Never below the floor.
    this.orbit.maxPolarAngle = Math.PI / 2 - 0.02;
    this.orbit.update();
    this.placeSun();
    // Before the orbit's own listener on the canvas, which reads the binding.
    container.addEventListener("pointerdown", this.orbitEvenSprinting, { capture: true });

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

  /** For tools: what the last frame drew, counted: draw calls and triangles, and the objects and meshes the scene holds, which every frame walks. */
  drawn(): { calls: number; triangles: number; objects: number; meshes: number } {
    const { drawCalls, triangles } = this.renderer.info.render;
    let objects = 0;
    let meshes = 0;
    this.scene.traverse((object) => {
      objects++;
      if (object instanceof THREE.Mesh) meshes++;
    });
    return { calls: drawCalls, triangles, objects, meshes };
  }

  /**
   * For tools: leave a part of the world out of the frame, or put it back, so a
   * profile prices each part by what the frame costs without it; `resolution`
   * halves the pixel ratio instead, which tells whether the frame is bound by
   * the pixels it shades.
   */
  leaveOut(part: Part | "resolution", out: boolean): void {
    if (part === "resolution") {
      this.renderer.setPixelRatio(pixelRatio() * (out ? 0.5 : 1));
      return;
    }
    for (const object of this.parts.get(part) ?? []) {
      if (out) object.removeFromParent();
      else this.scene.add(object);
    }
  }

  /** For tools: the parts of the world in place so far, each once its files have loaded. */
  loaded(): Part[] {
    return [...this.parts.keys()];
  }

  /** For tools: the GPU's time, in milliseconds, for the frames drawn since it was last asked, when the page opened with `?gpu-time`. */
  async gpuTime(): Promise<number> {
    return (await this.renderer.resolveTimestampsAsync(THREE.TimestampQuery.RENDER)) ?? 0;
  }

  /** For tools: put the camera at `eye`, looking at `at`, as an orbit the player can carry on from. */
  lookFrom(eye: readonly [number, number, number], at: readonly [number, number, number]): void {
    this.camera.position.set(...eye);
    this.orbit.target.set(...at);
    this.orbit.update();
  }

  /** Place a kit's pieces on the grid as its piece bench, once their files have loaded: each piece named, with its axes shown. */
  async placeBench(placements: readonly Placement[]): Promise<void> {
    const bench = await buildTown(placements, (url) => this.fileOf(url));
    if (this.disposed) return;
    this.scene.add(bench, benchMarks(placements, bench));
  }

  /**
   * Draw the map's pieces on the grid, once their files have loaded, merged
   * by chunk, and give the overlay each piece's name and each part of the
   * town's, over all its pieces. Resolves with the map's editor, which
   * redraws only what an edit changes, or null when the viewer closed first.
   */
  async placeTown(map: MapDocument, listeners: Omit<EditorListeners, "shown">): Promise<MapEditor | null> {
    const layer = new TownLayer((url) => this.fileOf(url));
    await layer.show(piecesOf(map));
    if (this.disposed) return null;
    this.layer = layer;
    this.scene.add(layer.group);
    this.parts.set("town", [layer.group]);
    this.labelTown(map);
    this.editor = new MapEditor(map, layer, this.scene, this.camera, this.orbit, this.renderer.domElement, {
      ...listeners,
      shown: (shown) => this.labelTown(shown),
    });
    return this.editor;
  }

  /** Go into the map editor, or back out to play. */
  edit(on: boolean): void {
    if (this.editor === null) throw new Error("adventure: the map isn't drawn yet");
    this.editor.setActive(on, new THREE.Vector3(this.player.x, 0, this.player.z));
  }

  /** Name each piece of the map in the overlay, and each part of the town over all of its pieces. */
  private labelTown(map: MapDocument): void {
    const layer = this.layer;
    if (layer === null) throw new Error("adventure: the map isn't drawn yet");
    this.overlay.forget(["piece", "place"]);
    for (const place of map.places) {
      const box = new THREE.Box3();
      for (const placement of place.placements) {
        const bounds = layer.shownBoundsOf(placement);
        if (bounds === undefined) throw new Error(`adventure: ${place.name} has a piece that isn't drawn`);
        box.union(bounds);
        const at = over(bounds, PIECE_LABEL_GAP);
        this.overlay.add("piece", placement.piece, () => at);
      }
      if (SCATTERED.has(place.name) || place.placements.length === 0) continue;
      const at = over(box, PLACE_LABEL_GAP);
      this.overlay.add("place", place.name, () => at);
    }
  }

  /**
   * Wrap a sky round the world, once its image has loaded: one panorama, 2:1,
   * as the skybox pack ships its skies. It is drawn after everything solid, at
   * the far plane, so only the pixels nothing else covers are shaded with it.
   * The scene's own background would be drawn first, under everything, every
   * pixel of every frame.
   */
  async showSky(url: string): Promise<void> {
    const sky = await new THREE.TextureLoader().loadAsync(url);
    if (this.disposed) return;
    sky.colorSpace = THREE.SRGBColorSpace;
    // Seen through a narrow lens the panorama is only ever magnified, so it needs no mipmaps, whose level jumps at its seam.
    sky.generateMipmaps = false;
    sky.minFilter = THREE.LinearFilter;
    const material = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, fog: false });
    material.colorNode = texture(sky, equirectUV(positionLocal.normalize()));
    // Turned with the camera but never moved, and pushed to the far plane, where it passes the depth test only where nothing was drawn.
    const clip = cameraProjectionMatrix.mul(vec4(modelViewMatrix.mul(vec4(positionLocal, 0)).xyz, 1));
    material.vertexNode = clip.setZ(clip.w);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), material);
    dome.frustumCulled = false;
    dome.renderOrder = 1;
    this.scene.add(dome);
    this.parts.set("sky", [dome]);
  }

  /** Lay the ground's tiles, which the player walks on, once their files have loaded: merged, as the town is. */
  async placeGround(tiles: readonly Placement[]): Promise<void> {
    const ground = await buildMerged(tiles, (url) => this.fileOf(url));
    if (this.disposed) return;
    this.scene.add(ground.group);
    this.parts.set("ground", [ground.group]);
    tiles.forEach((tile, i) => {
      let solid: THREE.Object3D | undefined;
      this.tiles.set(cellKey(tile.x, tile.z), () => (solid ??= ground.solid(i)));
    });
    this.standVillagers();
  }

  /**
   * Put each villager in its place once its file has loaded, standing idle on
   * the ground or sitting on its seat. They cast no shadow: only the player does.
   */
  async placeVillagers(villagers: readonly Villager[]): Promise<void> {
    const files = await Promise.all(villagers.map((v) => this.fileOf(characterOrThrow(v.character).url)));
    if (this.disposed) return;
    villagers.forEach((villager, i) => {
      const gltf = files[i];
      const name = villager.sits === undefined ? "idle" : "sit";
      const clip = THREE.AnimationClip.findByName(gltf.animations, name);
      if (clip === null) throw new Error(`adventure: ${villager.character} has no ${name}`);
      const root = clone(gltf.scene);
      root.position.set(villager.x, 0, villager.z);
      root.rotation.y = yawOf(villager);
      const mixer = new THREE.AnimationMixer(root);
      mixer.clipAction(clip).play();
      mixer.setTime(((i * IDLE_PHASE) % 1) * clip.duration);
      this.idles.push(mixer);
      if (villager.sits === undefined) this.standing.push({ villager, root });
      else seat(root, new THREE.Vector3(villager.x, SEATS[villager.sits], villager.z));
      this.scene.add(root);
      this.parts.set("villagers", [...(this.parts.get("villagers") ?? []), root]);
      this.overlay.add("character", villager.character, () => root.position.clone().setY(root.position.y + CHARACTER_LABEL_HEIGHT));
    });
    this.standVillagers();
  }

  /** Stand each standing villager on the ground under them, or the grid floor before the ground is laid. */
  private standVillagers(): void {
    for (const { villager, root } of this.standing) root.position.y = this.floorBelow(villager.x, villager.z, STEP) ?? 0;
  }

  /**
   * Show the player's character playing `clip`, or its first clip when it has
   * no clip of that name. Resolves with its clips' names and the one playing,
   * or null when the viewer closed first.
   */
  async show(character: Character, clip: string): Promise<{ clips: string[]; playing: string } | null> {
    const gltf = await this.fileOf(character.url);
    if (this.disposed) return null;
    if (gltf.animations.length === 0) throw new Error(`adventure: ${character.id} has no animations`);

    gltf.scene.traverse((child) => {
      if (child instanceof THREE.Mesh) child.castShadow = true;
    });
    this.scene.add(gltf.scene);
    this.overlay.add("character", `${character.id} (you)`, () => new THREE.Vector3(this.player.x, this.player.y + this.settle + CHARACTER_LABEL_HEIGHT, this.player.z));
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

  /** Put a weapon in one of the player's hands, or none in either. */
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

  /** A file, loaded once: a character, weapon or town piece shown again reuses its scene. */
  private fileOf(url: string): Promise<GLTF> {
    let file = this.files.get(url);
    if (file === undefined) {
      file = this.loader.loadAsync(url);
      this.files.set(url, file);
    }
    return file;
  }

  /** Swing the camera round the player, tilt it and zoom it, as the arrow keys and + and − ask: right looks further right, up looks up. */
  private turnCamera({ turn, tilt, zoom }: ControlState, dt: number): void {
    if (turn === 0 && tilt === 0 && zoom === 0) return;
    const offset = this.camera.position.clone().sub(this.orbit.target);
    const view = new THREE.Spherical().setFromVector3(offset);
    view.theta -= turn * TURN_SPEED * dt;
    view.phi = THREE.MathUtils.clamp(view.phi + tilt * TILT_SPEED * dt, this.orbit.minPolarAngle, this.orbit.maxPolarAngle);
    view.radius = THREE.MathUtils.clamp(view.radius * Math.exp(-zoom * ZOOM_SPEED * dt), this.orbit.minDistance, this.orbit.maxDistance);
    view.makeSafe();
    this.camera.position.copy(this.orbit.target).add(offset.setFromSpherical(view));
  }

  /** What the controls ask for, turned from the camera's view onto the ground: ahead goes away from the camera. */
  private move({ ahead, right, sprint, jump }: ControlState): Move {
    if (ahead === 0 && right === 0) return { x: 0, z: 0, sprint, jump };
    const look = this.camera.getWorldDirection(new THREE.Vector3());
    const forward = new THREE.Vector2(look.x, look.z).normalize();
    // Right of the view, on the ground: the forward direction turned a quarter clockwise seen from above.
    return { x: forward.x * ahead - forward.y * right, z: forward.y * ahead + forward.x * right, sprint, jump };
  }

  /** The height of the highest walkable surface under a point, no higher than `top`. */
  private readonly floorBelow = (x: number, z: number, top: number): number | null => {
    this.ray.set(new THREE.Vector3(x, top, z), DOWN);
    // Tiles fill their cells, so a ray straight down meets only its own cell's, never one of the ground's other instances.
    const tile = this.tiles.get(cellKey(Math.floor(x), Math.floor(z)));
    return this.ray.intersectObjects(tile === undefined ? [this.floor] : [tile(), this.floor])[0]?.point.y ?? null;
  };

  private walk(asked: ControlState, dt: number): void {
    const before = this.player;
    this.player = stepPlayer(before, this.move(asked), dt, GRID_SIZE / 2 - 0.5, this.floorBelow);
    // A step of the ground under them is drawn as a settle, never a jump of the whole character.
    if (!before.airborne && !this.player.airborne) this.settle += before.y - this.player.y;
    this.settle *= Math.exp(-dt / SETTLE_TIME);
    const standing = this.player.airborne ? this.cameraHeight : this.player.y;
    const rise = (standing - this.cameraHeight) * (1 - Math.exp(-dt / CAMERA_SETTLE_TIME));
    this.cameraHeight += rise;
    const shift = new THREE.Vector3(this.player.x - before.x, rise, this.player.z - before.z);
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
    this.shown.root.position.set(this.player.x, this.player.y + this.settle, this.player.z);
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

  /** Tell the page where the player stands while the overlay is open, to a hundredth, only when that changes. */
  private report(open: boolean): void {
    const where: Whereabouts | null = open
      ? { cell: [Math.floor(this.player.x), Math.floor(this.player.z)], at: [round(this.player.x), round(this.player.z)] }
      : null;
    const said = JSON.stringify(where);
    if (said === this.reported) return;
    this.reported = said;
    this.onWhereabouts(where);
  }

  private frame(time: number): void {
    this.timer.update(time);
    const dt = Math.min(this.timer.getDelta(), MAX_STEP);
    const asked = this.controls.read();
    // Before the walk, so the keys walk the way the camera now looks.
    this.turnCamera(asked, dt);
    const editing = this.editor?.active === true;
    if (editing) this.editor?.frame(asked, dt);
    else this.walk(asked, dt);
    if (asked.overlay) this.overlayOpen = !this.overlayOpen;
    // Round what the camera looks at while editing, round the player in play.
    const [x, z] = editing ? [this.orbit.target.x, this.orbit.target.z] : [this.player.x, this.player.z];
    this.overlay.update(this.overlayOpen, x, z, this.camera.position);
    this.report(this.overlayOpen);
    this.shown?.mixer.update(dt);
    for (const idle of this.idles) idle.update(dt);
    this.orbit.update();
    if (this.drawable) this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.editor?.dispose();
    this.resize.disconnect();
    this.container.removeEventListener("pointerdown", this.orbitEvenSprinting, { capture: true });
    this.controls.dispose();
    this.orbit.dispose();
    this.timer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

/**
 * Where a sitter's hips, the joint their legs swing from, go on a seat: this far
 * ahead of its middle, and this far above its top. The sitting clip swings the
 * legs forward but leaves the thighs sloping down, and the leg blocks reach
 * below the hips, so no height rests both body and thighs on a seat as made:
 * these were chosen by eye across every character, the body a little above the
 * seat and the thighs a little into it.
 */
const SEAT_FORWARD = 0.045;
const SEAT_LIFT = 0.067;

/** Sit a posed character on a seat whose top's middle is at a point, facing the way they look. */
function seat(root: THREE.Object3D, middle: THREE.Vector3): void {
  root.updateMatrixWorld(true);
  const hips = new THREE.Vector3();
  for (const side of ["leg-left", "leg-right"]) {
    const leg = root.getObjectByName(side);
    if (leg === undefined) throw new Error(`adventure: a character has no ${side}`);
    hips.add(leg.getWorldPosition(new THREE.Vector3()).multiplyScalar(0.5));
  }
  const ahead = new THREE.Vector3(Math.sin(root.rotation.y), 0, Math.cos(root.rotation.y));
  const at = middle.clone().addScaledVector(ahead, SEAT_FORWARD).add(new THREE.Vector3(0, SEAT_LIFT, 0));
  root.position.add(at.sub(hips));
}

/** The renderer's pixel ratio: the screen's, but no more than 2. */
const pixelRatio = (): number => Math.min(window.devicePixelRatio, 2);

/** The point a little above the middle of a box's top. */
function over(box: THREE.Box3, gap: number): THREE.Vector3 {
  const centre = box.getCenter(new THREE.Vector3());
  return centre.setY(box.max.y + gap);
}

const cellKey = (x: number, z: number): string => `${x},${z}`;

const round = (value: number): number => Math.round(value * 100) / 100;
