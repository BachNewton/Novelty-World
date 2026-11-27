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
import { grip } from "./held";
import { GroundTiles } from "./ground-tiles";
import { MapEditor, type EditorListeners } from "./map-editor";
import { PlayerView, TARGET_HEIGHT, type Shown } from "./player-view";
import { Stage } from "./stage";
import { Thumbnails } from "./thumbnails";
import { buildTown } from "./town";
import { TownLayer } from "./town-layer";
import { STANDING, STEP } from "../player";
import { PLAYER_CHARACTER, SEATS, secondPlayerOf, yawOf, type Villager } from "../villagers";
import { ANIMAL_SCALE, animalOrThrow } from "../animals";
import type { Beast } from "../fauna";
import type { Hand, Weapon } from "../weapons";

/** The first view, from where the orbit turns: in front and a little to the side, a touch above the head, the characters facing +z. */
const START_EYE = new THREE.Vector3(0.7, 0.75 - TARGET_HEIGHT, 1.6);
/** How far to the first player's right, as their camera sees it, a second player joins them. */
const JOIN_BESIDE = 0.8;
/** The world's side, in cells: how far the players can walk. */
const GRID_SIZE = GROUND.max - GROUND.min + 1;
/** The piece bench's grid floor: a line every unit and a stronger one every five, a little below y = 0, where the pieces stand. */
const GRID_MAJOR = 5;
const FLOOR_DROP = -0.08;
/**
 * How far round a player the sun casts shadows. Its box follows the player a
 * view is drawn round, moved before each view is drawn, and only the players
 * cast shadows, so nothing else moves in and out of the sun's reach.
 */
const SHADOW_REACH = 2;
/**
 * How near the other player must be for a view's shadow box to hold them too,
 * when they are in its sight: nearer, their shadow is seen, and the box grows to
 * hold both; further, they are small enough in the view that their shadow
 * isn't missed, and the box stays round its own player alone, as sharp as one
 * player's.
 */
const SHADOW_SEEN = 8;
/** The sun's place relative to the players its box holds: over one, or over the middle of two, moved back along its light as far as they are apart. */
const SUN_OFFSET = new THREE.Vector3(1.5, 3, 2);
/** How far along the sun's light its shadow box reaches round one player; it deepens with the box when it holds two. */
const SHADOW_NEAR = 0.5;
const SHADOW_FAR = 8;
/** The round a player stands in, for whether a view sees them: a character's height. */
const PLAYER_BOUND = new THREE.Sphere(new THREE.Vector3(), 0.85);
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
/** How far above an animal's head the overlay names it. */
const ANIMAL_LABEL_GAP = 0.15;
/** How high above the grid the ground under an animal is looked for: over the country's highest rise, since an animal may stand up on one, and nothing walkable hangs over where one stands. */
const ANIMAL_REACH = 3;
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
export type Part = "sky" | "town" | "ground" | "villagers" | "animals";

/**
 * The player's character on the world's ground, playing one of its clips, walked
 * about with WASD or a pad's left stick (Shift, or the stick clicked in, to sprint), with a
 * camera that follows them and orbits and zooms round them, by mouse, arrow
 * keys or the right stick; the village and its villagers stand round. A second
 * player can join on an input of their own, and the screen splits left and
 * right, a camera each. Plain three.js outside React: the page tells it what
 * to show, and hears who plays with what.
 */
export class CharacterViewer {
  private readonly renderer = new THREE.WebGPURenderer({ antialias: true, trackTimestamp: new URLSearchParams(window.location.search).has("gpu-time") });
  private readonly scene = new THREE.Scene();
  /** The players, each with their camera: the first always, the second while one plays, drawn on the right half. */
  private readonly views: PlayerView[];
  /** The sun, its shadow box moved round each view's player before that view is drawn. */
  private readonly sun = sunlight();
  /** What a view's camera sees, for whether it sees the other player. */
  private readonly sight = new THREE.Frustum();
  private readonly sightMatrix = new THREE.Matrix4();
  private readonly controls: Controls;
  private readonly timer = new THREE.Timer();
  private readonly loader = new GLTFLoader();
  /** Every file loaded, by its address: each loads once. */
  private readonly files = new Map<string, Promise<GLTF>>();
  private readonly resize: ResizeObserver;
  /**
   * OrbitControls turns a drag with Shift held from an orbit into a pan, and
   * from a pan into an orbit. Here Shift only ever means faster (a sprint, or
   * the editor's quicker slide), so each press binds the buttons to whichever
   * makes the drag do what its button always does: in play the left orbits; in
   * the editor the right orbits and the middle pans.
   */
  private readonly orbitEvenSprinting = (event: PointerEvent): void => {
    const [orbit, pan] = event.shiftKey ? [THREE.MOUSE.PAN, THREE.MOUSE.ROTATE] : [THREE.MOUSE.ROTATE, THREE.MOUSE.PAN];
    if (this.editor?.active === true) {
      Object.assign(this.views[0].orbit.mouseButtons, { RIGHT: orbit, MIDDLE: pan });
      return;
    }
    for (const view of this.views) view.orbit.mouseButtons.LEFT = orbit;
  };
  /** Who plays with what: the mouse turns the camera of whoever holds the keyboard. */
  private lineup: Lineup;
  /** What the player can stand on: the ground's tile in each cell, as last drawn; where there is none, nothing, and the player stays where they stood. */
  private ground: GroundTiles | null = null;
  /** The town's pieces made to be stood on, by each cell they reach into: paving, stairs, blocks and planks. */
  private readonly underfoot = new Map<string, (() => THREE.Object3D)[]>();
  /** The piece bench's floor, which it stands on, having no ground; the world has none. */
  private floor: THREE.Object3D | null = null;
  private readonly ray = new THREE.Raycaster();
  /** Each villager's mixer, playing its idle. */
  private readonly idles: THREE.AnimationMixer[] = [];
  /** The villagers and animals standing on the ground, stood again on it once it is laid: each on the highest ground under them no higher than its top. */
  private readonly standing: { at: { x: number; z: number }; top: number; root: THREE.Object3D }[] = [];
  /** Each villager by their character, so the one a player plays as steps out of the village while they play. */
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
  /** Who the first player plays as; the second's follows from it. */
  private firstAs: CharacterId = PLAYER_CHARACTER;
  /** Each player's name as each character, once given to the overlay: the first time they play as them. */
  private readonly named = new Set<string>();
  /** The character and animal viewer's stage, once it has been opened. */
  private staged: Stage | null = null;
  /** The map editor's pictures of the pieces, once one has been asked for. */
  private pictures: Thumbnails | null = null;
  /** Whether the debug overlay is open, toggled by its key. */
  private overlayOpen = false;
  /** What the overlay last reported, so it reports only a change. */
  private reported = "";

  constructor(
    private readonly container: HTMLElement,
    /** Told when the GPU's device is lost, or a file for a second player fails to load. */
    private readonly onFailure: (message: string) => void,
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
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.onDeviceLost = (info) => {
      this.renderer.setAnimationLoop(null);
      onFailure(`${info.api} device lost: ${info.message}`);
    };
    this.renderer.domElement.className = "block h-full w-full";
    container.appendChild(this.renderer.domElement);

    // The renderer's clear colour rather than the scene's background, which would clear the whole canvas before each half is drawn.
    this.renderer.setClearColor(themeColor("--color-surface-secondary"));
    this.scene.add(new THREE.HemisphereLight(undefined, themeColor("--color-surface-elevated"), 1.6));
    this.scene.add(this.sun, this.sun.target);

    this.scene.add(this.overlay.group);

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

  /** For tools: what the last frame drew, counted: draw calls and triangles, the scene's renders (each view and each shadow), and the objects and meshes the scene holds, which every render walks. */
  drawn(): { calls: number; triangles: number; renders: number; objects: number; meshes: number } {
    const { drawCalls, triangles, frameCalls: renders } = this.renderer.info.render;
    let objects = 0;
    let meshes = 0;
    this.scene.traverse((object) => {
      objects++;
      if (object instanceof THREE.Mesh) meshes++;
    });
    return { calls: drawCalls, triangles, renders, objects, meshes };
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

  /** For tools: stand a player (the first unless told) at a place, on the ground there, their camera moved with them. */
  standAt(x: number, z: number, player = 0): void {
    const view = this.views[player] as PlayerView | undefined;
    if (view === undefined) throw new Error(`adventure: no player ${player + 1}`);
    view.standAt(x, this.floorBelow(x, z, ANIMAL_REACH) ?? 0, z);
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
    const { floor, grid } = gridFloor();
    this.floor = floor;
    this.scene.add(bench, marks, floor, grid);
    // It stands in the town's place.
    this.parts.set("town", [bench, marks]);
  }

  /**
   * Draw the map's pieces and lay its ground's tiles on the grid, once their
   * files have loaded, merged by chunk, and give the overlay each piece's name
   * and each part of the town's, over all its pieces. Resolves with the map's
   * editor, which redraws only what an edit changes, or null when the viewer
   * closed first.
   */
  async placeTown(map: MapDocument, listeners: Omit<EditorListeners, "shown">): Promise<MapEditor | null> {
    const layer = new TownLayer((url) => this.fileOf(url));
    const ground = new GroundTiles((url) => this.fileOf(url));
    const pieces = piecesOf(map);
    await Promise.all([layer.show(pieces), ground.show(map.ground, pieces)]);
    if (this.disposed) return null;
    this.layer = layer;
    this.ground = ground;
    this.scene.add(layer.group, ground.group);
    this.parts.set("town", [layer.group]);
    this.parts.set("ground", [ground.group]);
    this.labelTown(map);
    this.editor = new MapEditor(map, layer, ground, this.scene, this.views[0].camera, this.views[0].orbit, this.renderer.domElement, {
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
      if (villager.sits === undefined) this.standing.push({ at: villager, top: STEP, root });
      else seat(root, new THREE.Vector3(villager.x, SEATS[villager.sits], villager.z));
      this.scene.add(root);
      this.villagers.set(villager.character, root);
      this.parts.set("villagers", [...(this.parts.get("villagers") ?? []), root]);
      this.overlay.add("character", villager.character, () => root.position.clone().setY(root.position.y + CHARACTER_LABEL_HEIGHT), () => root.visible);
    });
    this.stepOut();
    this.standVillagers();
  }

  /**
   * Put each animal in its place once its file has loaded, standing idle on the
   * ground, the pack drawn at its one scale. They cast no shadow, as villagers
   * don't. Every file of the pack paints from the one colour map with the one
   * material, so all share the first file's: one texture, not one a file.
   */
  async placeAnimals(beasts: readonly Beast[]): Promise<void> {
    const files = await Promise.all(beasts.map((b) => this.fileOf(animalOrThrow(b.animal).url)));
    if (this.disposed) return;
    let material: THREE.Material | null = null;
    const roots = beasts.map((beast, i) => {
      const gltf = files[i];
      const clip = THREE.AnimationClip.findByName(gltf.animations, "idle");
      if (clip === null) throw new Error(`adventure: the ${beast.animal} has no idle`);
      const root = gltf.scene.clone();
      root.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        if (Array.isArray(child.material)) throw new Error(`adventure: the ${beast.animal} has a part of several materials`);
        material ??= child.material;
        child.material = material;
      });
      root.scale.setScalar(ANIMAL_SCALE);
      // Lowered inside the root the ground stands it on, above the nodes its idle moves.
      root.children[0].position.y -= (beast.sunk ?? 0) / ANIMAL_SCALE;
      root.position.set(beast.x, 0, beast.z);
      root.rotation.y = yawOf(beast);
      const mixer = new THREE.AnimationMixer(root);
      mixer.clipAction(clip).play();
      // Out of step with the villagers' idles as well as each other's.
      mixer.setTime((((i + 0.5) * IDLE_PHASE) % 1) * clip.duration);
      this.idles.push(mixer);
      this.standing.push({ at: beast, top: ANIMAL_REACH, root });
      this.scene.add(root);
      const top = new THREE.Box3().setFromObject(root).max.y + ANIMAL_LABEL_GAP;
      this.overlay.add("character", `animal-${beast.animal}`, () => root.position.clone().setY(top + root.position.y));
      return root;
    });
    this.parts.set("animals", roots);
    this.standVillagers();
  }

  /** Stand each standing villager and animal on the ground under them, or at y = 0 before the ground is laid. */
  private standVillagers(): void {
    for (const { at, top, root } of this.standing) root.position.y = this.floorBelow(at.x, at.z, top) ?? 0;
  }

  /**
   * The first player plays as a character, where they stand, playing `clip`
   * (or its first clip when it has no clip of that name) until they set off,
   * and holding what they held. The villager who is that character steps out
   * of the village while they play, and a second player who was them becomes
   * someone else. Resolves once they are shown.
   */
  async show(character: Character, clip: string): Promise<void> {
    this.firstAs = character.id;
    this.stepOut();
    if (this.views.length > 1) this.dress(1, "idle").catch((error: unknown) => this.onFailure(String(error)));
    await this.dress(0, clip);
  }

  /** Dress a player as the character they play, playing `clip`: a change of character loads its file; the same character only plays the clip. */
  private async dress(player: number, clip: string): Promise<void> {
    const view = this.views[player];
    const character = this.castOf(player);
    if (view.shown?.character === character) {
      view.playOn(clip, true);
      return;
    }
    const gltf = await this.fileOf(characterOrThrow(character).url);
    if (this.disposed || this.views[player] !== view || this.castOf(player) !== character) return;
    view.shown?.mixer.stopAllAction();
    view.shown?.root.removeFromParent();
    view.show(this.shownOf(character, gltf, clone(gltf.scene)), clip);
    const name = `${character} (player ${player + 1})`;
    if (!this.named.has(name)) {
      this.named.add(name);
      this.overlay.add("character", name, () => labelOver(this.views[player] ?? view), () => this.views[player]?.shown?.character === character);
    }
    if (player === 0) this.attachHeld();
  }

  /** Who a player plays as: the first as they chose, and the second by the first, never the same character. */
  private castOf(player: number): CharacterId {
    return player === 0 ? this.firstAs : secondPlayerOf(this.firstAs);
  }

  /** Every villager stands in the village but the ones the players play as. */
  private stepOut(): void {
    const playing = this.views.map((_, i) => this.castOf(i));
    for (const [character, root] of this.villagers) root.visible = !playing.includes(character);
  }

  /** The map editor's pictures of the kits' pieces, drawn as the map draws them: made the first time they are asked for, once the map is drawn. */
  thumbnails(): Thumbnails {
    const layer = this.layer;
    if (layer === null) throw new Error("adventure: the map isn't drawn yet");
    this.pictures ??= new Thumbnails(this.renderer, (piece, texture) => layer.pieceOf(piece, texture));
    return this.pictures;
  }

  /** The character and animal viewer's stage, drawn in the world's place while it is open: made the first time it is asked for. */
  stage(): Stage {
    this.staged ??= new Stage(this.renderer, (url) => this.fileOf(url));
    return this.staged;
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
    this.stepOut();
    this.dress(1, "idle").catch((error: unknown) => this.onFailure(String(error)));
  }

  /** The second player leaves, and the villager they played is back in their place. */
  private leave(): void {
    const second = this.views.pop();
    if (second === undefined) return;
    second.shown?.mixer.stopAllAction();
    second.shown?.root.removeFromParent();
    second.dispose();
    this.stepOut();
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
    grip(shown.root, this.held, this.holding.weapon, this.holding.hand);
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
    const ground = this.ground;
    const tile = ground?.tileAt(Math.floor(x), Math.floor(z));
    const targets = [...(ground === null || tile === undefined ? [] : [ground.solidOf(tile)]), ...(this.underfoot.get(key) ?? []).map((target) => target()), ...(this.floor === null ? [] : [this.floor])];
    return this.ray.intersectObjects(targets)[0]?.point.y ?? null;
  };

  /**
   * Put the sun over the player a view is drawn round, its shadow box round
   * them, and round the other player too while that view sees them near enough
   * for their shadow to show: wide enough for each, and deep enough along its
   * light for both and the ground under them. The renderer draws a light's
   * shadow once for each camera a frame, so each view gets the box placed for
   * it.
   */
  private placeSun(view: PlayerView): void {
    const { player, camera } = view;
    const middle = this.sun.target.position.set(player.x, player.y, player.z);
    let apart = 0;
    const other = this.views.find((v) => v !== view)?.player;
    if (other !== undefined && Math.hypot(other.x - player.x, other.y - player.y, other.z - player.z) <= SHADOW_SEEN && this.sees(camera, other)) {
      middle.set((player.x + other.x) / 2, (player.y + other.y) / 2, (player.z + other.z) / 2);
      apart = Math.hypot(other.x - middle.x, other.y - middle.y, other.z - middle.z);
    }
    const reach = SHADOW_REACH + apart;
    this.sun.position.copy(middle).addScaledVector(SUN_OFFSET, 1 + apart / SUN_OFFSET.length());
    const box = this.sun.shadow.camera;
    if (box.right !== reach) {
      Object.assign(box, { left: -reach, right: reach, top: reach, bottom: -reach, far: SHADOW_FAR + 2 * apart });
      box.updateProjectionMatrix();
    }
  }

  /** Whether a camera's view holds a player. */
  private sees(camera: THREE.PerspectiveCamera, player: { x: number; y: number; z: number }): boolean {
    camera.updateMatrixWorld();
    this.sight.setFromProjectionMatrix(this.sightMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    PLAYER_BOUND.center.set(player.x, player.y + PLAYER_BOUND.radius / 2, player.z);
    return this.sight.intersectsSphere(PLAYER_BOUND);
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
    if (this.staged?.open === true) {
      // Play waits as it was while the viewer is open: no one moves, joins or leaves, and the mouse is the stage's.
      for (const view of this.views) view.orbit.enabled = false;
      this.staged.frame(asked[0], dt);
      if (this.drawable) this.staged.draw();
      return;
    }
    const editing = this.editor?.active === true;
    if (editing) {
      // Who joins or leaves while the map is edited does so once it closes.
      this.views[0].turnCamera(asked[0], dt);
      this.editor?.frame(asked[0], dt);
      // The mouse is the editor's, whoever held the keyboard in play; and every frame, since the orbit eases each drag and wheel turn in over the frames after it, and applies only what an update gives it.
      this.views[0].orbit.enabled = true;
      this.views[0].orbit.update();
    } else {
      if (asked.length > this.views.length) this.join();
      else if (asked.length < this.views.length) this.leave();
      const reach = GRID_SIZE / 2 - 0.5;
      this.views.forEach((view, i) => {
        // The mouse turns the camera of whoever holds the keyboard.
        view.orbit.enabled = playerOf(this.lineup, "keys") === i;
        // Before the walk, so the keys walk the way the camera now looks.
        view.turnCamera(asked[i], dt);
        view.walk(asked[i], dt, reach, this.floorBelow);
        view.shown?.mixer.update(dt);
        view.orbit.update();
      });
    }
    if (asked.some((player) => player.overlay)) this.overlayOpen = !this.overlayOpen;
    this.report(this.overlayOpen);
    for (const idle of this.idles) idle.update(dt);
    if (this.drawable) this.draw();
    this.overlay.endFrame();
  }

  /**
   * Draw each player's view: alone, the whole canvas; two, a half each, left
   * and right, each with its own player's overlay and the sun's shadow box
   * round its own player.
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
    // Round what the camera looks at while the map is edited, round the player in play.
    const [x, z] = this.editor?.active === true ? [view.orbit.target.x, view.orbit.target.z] : [view.player.x, view.player.z];
    this.overlay.update(this.overlayOpen, x, z, view.camera.position);
    this.placeSun(view);
    this.renderer.render(this.scene, view.camera);
  }

  dispose(): void {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.editor?.dispose();
    this.staged?.dispose();
    this.pictures?.dispose();
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

/** A dark floor the bench's size, with grid lines on it, for the piece bench, which has no ground. */
function gridFloor(): { floor: THREE.Object3D; grid: THREE.Object3D } {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE), new THREE.MeshStandardMaterial({ color: themeColor("--color-surface-tertiary") }));
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
  const grid = new THREE.Group();
  grid.add(lines, majorLines);
  return { floor, grid };
}

/** The sun, casting the players' shadows inside a small box round them. */
function sunlight(): THREE.DirectionalLight {
  const sun = new THREE.DirectionalLight(undefined, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -SHADOW_REACH, right: SHADOW_REACH, top: SHADOW_REACH, bottom: -SHADOW_REACH, near: SHADOW_NEAR, far: SHADOW_FAR });
  sun.shadow.bias = -0.0005;
  return sun;
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
