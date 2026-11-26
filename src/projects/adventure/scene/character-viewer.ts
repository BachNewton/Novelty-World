import * as THREE from "three/webgpu";
import { cameraProjectionMatrix, equirectUV, modelViewMatrix, positionLocal, texture, vec4 } from "three/tsl";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { themeColor } from "@/shared/lib/three/theme-color";
import { characterOrThrow, type Character, type CharacterId } from "../characters";
import { Controls } from "../input/controls";
import { playerOf, type Lineup } from "../input/lineup";
import { piecesOf, SCATTERED, type MapDocument } from "../editor/map";
import { GROUND } from "../ground";
import type { Placement } from "../town";
import { benchMarks } from "./bench-marks";
import { DebugOverlay } from "./debug-overlay";
import { MapEditor, type EditorListeners } from "./map-editor";
import { buildMerged } from "./merged";
import { PlayerView, TARGET_HEIGHT, type Shown } from "./player-view";
import { buildTown } from "./town";
import { TownLayer } from "./town-layer";
import { STANDING, STEP } from "../player";
import { SECOND_PLAYER_CHARACTER, SEATS, yawOf, type Villager } from "../villagers";
import type { Hand, Weapon } from "../weapons";

/** The first view, from where the orbit turns: in front and a little to the side, a touch above the head, the characters facing +z. */
const START_EYE = new THREE.Vector3(0.7, 0.75 - TARGET_HEIGHT, 1.6);
/** How far to the first player's right, as their camera sees it, a second player joins them. */
const JOIN_BESIDE = 0.8;
/** The grid floor's side, in world units, with a line every unit and a stronger one every five. */
const GRID_SIZE = GROUND.max - GROUND.min + 1;
const GRID_MAJOR = 5;
/** How far the grid floor lies below y = 0, where the characters and the town's pieces stand: under the lowest ground the kits lay, a path's bed, so the ground covers it. */
const FLOOR_DROP = -0.08;
/**
 * How far round the player the sun casts shadows. It follows them, and only the
 * players cast shadows, so nothing else moves in and out of the sun's reach.
 * With two players it is moved to each one's before their half is drawn: a
 * shadow box each, at the cost of the shadow map drawn again, which holds only
 * the players.
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
const DOWN = new THREE.Vector3(0, -1, 0);
/**
 * The placed pieces made to be stood on: the town's paving, every flight of
 * stairs, its solid blocks (a plinth, a terrace's bed, a rampart's walk) and
 * its plank floors; and the country's ground raised on a rise, its cliff
 * blocks and steps, its bridges, boardwalks, stepping stones and flags.
 */
const STOOD_ON = /^(road|stairs|planks|wall-block|wall-wood-block|ground_|cliff_block|cliff_steps|bridge_|path_|platform_)/;
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

/**
 * The player's character on a grid floor, playing one of its clips, walked
 * about with WASD or a pad's left stick (Shift, or the stick clicked in, to sprint), with a
 * camera that follows them and orbits and zooms round them, by mouse, arrow
 * keys or the right stick; the village and its villagers stand round. A second
 * player can join on an input of their own, and the screen splits left and
 * right, a camera each. Plain three.js outside React: the page tells it what
 * to show, and hears which clip plays and who plays with what.
 */
export class CharacterViewer {
  private readonly renderer = new THREE.WebGPURenderer({ antialias: true, trackTimestamp: new URLSearchParams(window.location.search).has("gpu-time") });
  private readonly scene = new THREE.Scene();
  /** The players, each with their camera: the first always, the second while one plays, drawn on the right half. */
  private readonly views: PlayerView[];
  private readonly sun = new THREE.DirectionalLight(undefined, 2.2);
  private readonly controls: Controls;
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
    for (const view of this.views) view.orbit.mouseButtons.LEFT = event.shiftKey ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
  };
  /** Who plays with what: the mouse turns the camera of whoever holds the keyboard. */
  private lineup: Lineup;
  /** What the player can stand on: the ground's tile in each cell, by the cell, and the grid floor where there are none. */
  private readonly tiles = new Map<string, () => THREE.Object3D>();
  /** The town's pieces made to be stood on, by each cell they reach into: paving, stairs, blocks and planks. */
  private readonly underfoot = new Map<string, (() => THREE.Object3D)[]>();
  private readonly floor: THREE.Object3D;
  private readonly ray = new THREE.Raycaster();
  /** Each villager's mixer, playing its idle. */
  private readonly idles: THREE.AnimationMixer[] = [];
  /** The villagers standing on the ground, stood again on it once it is laid. */
  private readonly standing: { villager: Villager; root: THREE.Object3D }[] = [];
  /** Each villager by their character, so the one a second player plays as steps out of the village while they play. */
  private readonly villagers = new Map<CharacterId, THREE.Object3D>();
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
  /** Whether the second player's name has been given to the overlay: once, the first time one joins. */
  private secondNamed = false;
  /** Whether the debug overlay is open, toggled by its key. */
  private overlayOpen = false;
  /** What the overlay last reported, so it reports only a change. */
  private reported = "";

  constructor(
    private readonly container: HTMLElement,
    /** Told when the GPU's device is lost, or a file for a second player fails to load. */
    private readonly onFailure: (message: string) => void,
    /** Told whenever the first player's clip changes by itself: they set off, or stopped. */
    private readonly onPlaying: (clip: string) => void,
    /** Told where each player stands while the overlay is open, and null when it closes. */
    private readonly onWhereabouts: (where: Whereabouts[] | null) => void,
    /** Told who plays with what whenever that changes: a second player joined or left, or the first turned to another input. */
    onLineup: (lineup: Lineup) => void,
  ) {
    this.controls = new Controls((lineup) => {
      this.lineup = lineup;
      onLineup(lineup);
    });
    this.lineup = this.controls.current;
    this.renderer.setPixelRatio(pixelRatio());
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.onDeviceLost = (info) => {
      this.renderer.setAnimationLoop(null);
      onFailure(`${info.api} device lost: ${info.message}`);
    };
    this.renderer.domElement.className = "block h-full w-full";
    container.appendChild(this.renderer.domElement);

    // The renderer's clear colour rather than the scene's background, which would clear the whole canvas before each half is drawn.
    this.renderer.setClearColor(themeColor("--color-surface-secondary"));
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

    this.views = [new PlayerView(STANDING, START_EYE, this.renderer.domElement)];
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

  /** For tools: put a player's camera (the first's unless told) at `eye`, looking at `at`, as an orbit they can carry on from. */
  lookFrom(eye: readonly [number, number, number], at: readonly [number, number, number], player = 0): void {
    const view = this.views[player] as PlayerView | undefined;
    if (view === undefined) throw new Error(`adventure: no player ${player + 1}`);
    view.lookFrom(eye, at);
  }

  /** For tools: how many play, each drawn on their own part of the screen. */
  players(): number {
    return this.views.length;
  }

  /** Place a kit's pieces on the grid as its piece bench, once their files have loaded: each piece named, with its axes shown. */
  async placeBench(placements: readonly Placement[]): Promise<void> {
    const bench = await buildTown(placements, (url) => this.fileOf(url));
    if (this.disposed) return;
    const marks = benchMarks(placements, bench);
    this.scene.add(bench, marks);
    // It stands in the town's place.
    this.parts.set("town", [bench, marks]);
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
    this.editor = new MapEditor(map, layer, this.scene, this.views[0].camera, this.views[0].orbit, this.renderer.domElement, {
      ...listeners,
      shown: (shown) => this.labelTown(shown),
    });
    return this.editor;
  }

  /** Go into the map editor, or back out to play. */
  edit(on: boolean): void {
    if (this.editor === null) throw new Error("adventure: the map isn't drawn yet");
    const { player } = this.views[0];
    this.editor.setActive(on, new THREE.Vector3(player.x, 0, player.z));
    // The editor works on the first player's camera, over the whole canvas.
    this.fit();
  }

  /**
   * Name each piece of the map in the overlay, and each part of the town over
   * all of its pieces; and find again what can be stood on, by the cells each
   * piece reaches into: a flight of stairs or a bend in the road reaches past
   * its own.
   */
  private labelTown(map: MapDocument): void {
    const layer = this.layer;
    if (layer === null) throw new Error("adventure: the map isn't drawn yet");
    this.overlay.forget(["piece", "place"]);
    this.underfoot.clear();
    for (const place of map.places) {
      const box = new THREE.Box3();
      for (const placement of place.placements) {
        const bounds = layer.shownBoundsOf(placement);
        if (bounds === undefined) throw new Error(`adventure: ${place.name} has a piece that isn't drawn`);
        box.union(bounds);
        const at = over(bounds, PIECE_LABEL_GAP);
        this.overlay.add("piece", placement.piece, () => at);
        if (!STOOD_ON.test(placement.piece)) continue;
        // Made as a ray's target only when one is first cast at it.
        const target = (): THREE.Object3D => layer.solidOf(placement);
        for (let x = Math.floor(bounds.min.x); x < bounds.max.x; x++) {
          for (let z = Math.floor(bounds.min.z); z < bounds.max.z; z++) {
            const key = cellKey(x, z);
            this.underfoot.set(key, [...(this.underfoot.get(key) ?? []), target]);
          }
        }
      }
      if (SCATTERED.has(place.name) || place.placements.length === 0) continue;
      const at = over(box, PLACE_LABEL_GAP);
      this.overlay.add("place", place.name, () => at);
    }
    this.standVillagers();
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
      this.villagers.set(villager.character, root);
      // Out of the village while a second player plays as them.
      root.visible = villager.character !== SECOND_PLAYER_CHARACTER || this.views.length === 1;
      this.parts.set("villagers", [...(this.parts.get("villagers") ?? []), root]);
      this.overlay.add("character", villager.character, () => root.position.clone().setY(root.position.y + CHARACTER_LABEL_HEIGHT), () => root.visible);
    });
    this.standVillagers();
  }

  /** Stand each standing villager on the ground under them, or the grid floor before the ground is laid. */
  private standVillagers(): void {
    for (const { villager, root } of this.standing) root.position.y = this.floorBelow(villager.x, villager.z, STEP) ?? 0;
  }

  /**
   * Show the first player's character playing `clip`, or its first clip when it has
   * no clip of that name. Resolves with its clips' names and the one playing,
   * or null when the viewer closed first.
   */
  async show(character: Character, clip: string): Promise<{ clips: string[]; playing: string } | null> {
    const gltf = await this.fileOf(character.url);
    if (this.disposed) return null;
    const first = this.views[0];
    const shown = this.shownOf(character.id, gltf, gltf.scene);
    first.show(shown, clip);
    this.overlay.add("character", `${character.id} (player 1)`, () => labelOver(first));
    this.attachHeld();
    return { clips: shown.clips.map((c) => c.name), playing: shown.playing };
  }

  /** Play one of the first player's clips, looping, from its start, until they set off or stop. */
  play(clip: string): void {
    this.views[0].playOn(clip, true);
  }

  /** A character added to the scene to play as, casting the players' shadow. */
  private shownOf(character: CharacterId, gltf: GLTF, root: THREE.Object3D): Shown {
    if (gltf.animations.length === 0) throw new Error(`adventure: ${character} has no animations`);
    root.traverse((child) => {
      if (child instanceof THREE.Mesh) child.castShadow = true;
    });
    this.scene.add(root);
    return { character, root, mixer: new THREE.AnimationMixer(root), clips: gltf.animations, action: null, playing: "" };
  }

  /**
   * A second player joins beside the first, to their right as the first's
   * camera sees it (or where the first stands, where that is no ground to step
   * onto), with a camera looking the same way, and the villager whose character
   * they play steps out of the village while they play.
   */
  private join(): void {
    const first = this.views[0];
    const eye = first.eye();
    const right = new THREE.Vector2(eye.z, -eye.x).normalize().multiplyScalar(JOIN_BESIDE);
    const { x, y, z, yaw } = first.player;
    const beside = this.floorBelow(x + right.x, z + right.y, y + STEP);
    const at = beside !== null && beside >= y - STEP ? { x: x + right.x, z: z + right.y, y: beside } : { x, z, y };
    const second = new PlayerView({ ...STANDING, ...at, yaw }, eye, this.renderer.domElement);
    this.views.push(second);
    this.fit();
    if (!this.secondNamed) {
      this.secondNamed = true;
      this.overlay.add("character", `${SECOND_PLAYER_CHARACTER} (player 2)`, () => labelOver(this.views[1] ?? first), () => this.views.length > 1);
    }
    const villager = this.villagers.get(SECOND_PLAYER_CHARACTER);
    if (villager !== undefined) villager.visible = false;
    this.fileOf(characterOrThrow(SECOND_PLAYER_CHARACTER).url).then(
      (gltf) => {
        if (this.disposed || this.views[1] !== second) return;
        second.show(this.shownOf(SECOND_PLAYER_CHARACTER, gltf, clone(gltf.scene)), "idle");
      },
      (error: unknown) => this.onFailure(String(error)),
    );
  }

  /** The second player leaves, and the villager they played is back in their place. */
  private leave(): void {
    const second = this.views.pop();
    if (second === undefined) return;
    second.shown?.mixer.stopAllAction();
    second.shown?.root.removeFromParent();
    second.dispose();
    const villager = this.villagers.get(SECOND_PLAYER_CHARACTER);
    if (villager !== undefined) villager.visible = true;
    this.fit();
  }

  /** Put a weapon in one of the first player's hands, or none in either. */
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
    const shown = this.views[0].shown;
    if (this.held === null || this.holding === null || shown === null) return;
    const arm = shown.root.getObjectByName(`arm-${this.holding.hand}`);
    if (arm === undefined) throw new Error(`adventure: ${shown.character} has no arm-${this.holding.hand}`);
    const [x, y, z] = this.holding.weapon.grip;
    this.held.position.copy(GRIP).sub(new THREE.Vector3(x, y, z));
    if (this.holding.hand === "left") this.held.position.x = -GRIP.x - x;
    arm.add(this.held);
  }

  private detachHeld(): void {
    this.held?.removeFromParent();
    this.held = null;
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

  /** The height of the highest walkable surface under a point, no higher than `top`. */
  private readonly floorBelow = (x: number, z: number, top: number): number | null => {
    this.ray.set(new THREE.Vector3(x, top, z), DOWN);
    // Tiles fill their cells, so a ray straight down meets only its own cell's, never one of the ground's other instances; the town's pieces are found by the cells they reach into.
    const key = cellKey(Math.floor(x), Math.floor(z));
    const tile = this.tiles.get(key);
    const targets = [...(tile === undefined ? [] : [tile()]), ...(this.underfoot.get(key) ?? []).map((target) => target()), this.floor];
    return this.ray.intersectObjects(targets)[0]?.point.y ?? null;
  };

  /** Move the sun's shadow box to a player. */
  private placeSun({ player }: PlayerView): void {
    this.sun.target.position.set(player.x, 0, player.z);
    this.sun.position.copy(this.sun.target.position).add(SUN_OFFSET);
  }

  private fit(): void {
    const { clientWidth: width, clientHeight: height } = this.container;
    // A hidden container has no size, and a canvas without one is no surface to draw on.
    this.drawable = width > 0 && height > 0;
    if (!this.drawable) return;
    this.renderer.setSize(width, height, false);
    const shown = this.shownViews();
    for (const view of shown) view.fit(width / shown.length, height);
  }

  /** Tell the page where each player stands while the overlay is open, to a hundredth, only when that changes. */
  private report(open: boolean): void {
    const where: Whereabouts[] | null = open
      ? this.views.map(({ player }) => ({ cell: [Math.floor(player.x), Math.floor(player.z)], at: [round(player.x), round(player.z)] }))
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
    const editing = this.editor?.active === true;
    if (editing) {
      // Who joins or leaves while the map is edited does so once it closes.
      this.views[0].turnCamera(asked[0], dt);
      this.editor?.frame(asked[0], dt);
    } else {
      if (asked.length > this.views.length) this.join();
      else if (asked.length < this.views.length) this.leave();
      const reach = GRID_SIZE / 2 - 0.5;
      this.views.forEach((view, i) => {
        // The mouse turns the camera of whoever holds the keyboard.
        view.orbit.enabled = playerOf(this.lineup, "keys") === i;
        // Before the walk, so the keys walk the way the camera now looks.
        view.turnCamera(asked[i], dt);
        const changed = view.walk(asked[i], dt, reach, this.floorBelow);
        if (changed && i === 0 && view.shown !== null) this.onPlaying(view.shown.playing);
        view.shown?.mixer.update(dt);
        view.orbit.update();
      });
    }
    if (asked.some((player) => player.overlay)) this.overlayOpen = !this.overlayOpen;
    this.report(this.overlayOpen);
    for (const idle of this.idles) idle.update(dt);
    if (this.drawable) this.draw();
  }

  /**
   * Draw each player's view: alone, the whole canvas; two, a half each, left
   * and right. Each half is drawn with its own player's shadow box and overlay.
   * The first half's clear clears the whole canvas, as a WebGPU pass clears its
   * whole target whatever its viewport, so the second draws without one.
   */
  private draw(): void {
    const shown = this.shownViews();
    if (shown.length === 1) {
      this.drawView(shown[0]);
      return;
    }
    const { clientWidth: width, clientHeight: height } = this.container;
    const half = width / 2;
    this.views.forEach((view, i) => {
      this.renderer.setViewport(i * half, 0, half, height);
      this.renderer.autoClear = i === 0;
      this.drawView(view);
    });
    this.renderer.autoClear = true;
    this.renderer.setViewport(0, 0, width, height);
  }

  /** The players' views on the screen: the first alone while the map is edited, on its camera. */
  private shownViews(): PlayerView[] {
    return this.editor?.active === true ? [this.views[0]] : this.views;
  }

  private drawView(view: PlayerView): void {
    this.placeSun(view);
    // Round what the camera looks at while the map is edited, round the player in play.
    const [x, z] = this.editor?.active === true ? [view.orbit.target.x, view.orbit.target.z] : [view.player.x, view.player.z];
    this.overlay.update(this.overlayOpen, x, z, view.camera.position);
    this.renderer.render(this.scene, view.camera);
  }

  dispose(): void {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.editor?.dispose();
    this.resize.disconnect();
    this.container.removeEventListener("pointerdown", this.orbitEvenSprinting, { capture: true });
    this.controls.dispose();
    for (const view of this.views) view.dispose();
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

/** Where the overlay names a player: over their head. */
function labelOver(view: PlayerView): THREE.Vector3 {
  const at = view.drawnAt();
  return at.setY(at.y + CHARACTER_LABEL_HEIGHT);
}
