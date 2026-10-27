import * as THREE from "three/webgpu";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { themeColor } from "@/shared/lib/three/theme-color";
import { heightOf, speciesOrThrow } from "../cast";
import { ISLAND, SPAWN, homeAt } from "../level";
import { LOOK_CONE, START_CAMERA, cameraPose, headingOf, offView, steer, toggleView, viewMove, type CameraMode, type CameraState } from "../camera";
import type { Input } from "../input";
import { PUT_DOWN_REACH, WALK_SPEED, inFront, turnToward, walk } from "../movement";
import type { Moment } from "../protocol";
import { easeRemote, type Session } from "../session";
import type { Animal, Avatar, Look, Point, World } from "../types";
import { REACH, carriedBy, distance } from "../world";
import { polyInstance, type Models } from "./assets";
import { CARETAKER_HEIGHT, Caretaker } from "./caretaker";
import { buildIsland, type HomeView } from "./island-view";
import { paintPortraits } from "./portraits";

/** What pressing interact would do right now, for the prompt on screen. */
export type Target =
  | { kind: "pick-up"; animal: string }
  | { kind: "put-down"; home: string | null; right: boolean }
  | { kind: "name"; species: string };

export interface SceneCallbacks {
  onTarget(target: Target | null): void;
  onNameRequest(species: string): void;
  onCameraMode(mode: CameraMode): void;
}

const TURN_SPEED = 10;
/** Where a carried animal is shown in first person, in the camera's frame: low and to the right, clear of the prompt. */
const FIRST_PERSON_HOLD = new THREE.Vector3(0.3, -0.36, -1.1);
/** How far down a held animal sits between the hands, as a share of its height: in the arms, not on them. */
const HELD_SINK = 0.35;
/** How near a pair's home a player must be to read its name. */
const TAG_RANGE = 6;
/** How far round the player the sun's shadows reach. */
const SHADOW_REACH = 35;

/** An animal on the island, wherever it is. */
interface AnimalView {
  object: THREE.Group;
  height: number;
  /** Which way it faces where it was left, from its id, so a hidden one sits still. */
  turn: number;
}

function turnOf(id: string): number {
  let hash = 0;
  for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return (hash % 628) / 100;
}

interface PlayerView {
  caretaker: Caretaker;
  tag: CSS2DObject | null;
}

function sameLook(a: Look, b: Look): boolean {
  return a.shirt === b.shirt && a.hair === b.hair && a.skin === b.skin;
}

function label(className: string): CSS2DObject {
  const element = document.createElement("div");
  element.className = className;
  return new CSS2DObject(element);
}

const TAG_CLASS = "pointer-events-none rounded-full bg-wh-paper/90 px-2 py-0.5 text-xs font-semibold text-wh-ink shadow";

export class GameScene {
  private readonly renderer: THREE.WebGPURenderer;
  private readonly labels = new CSS2DRenderer();
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
  private readonly timer = new THREE.Timer();
  private readonly sun: THREE.DirectionalLight;
  private readonly homes: Map<string, HomeView>;
  private readonly tags = new Map<string, CSS2DObject>();
  private readonly animals = new Map<string, AnimalView>();
  private readonly players = new Map<string, PlayerView>();
  private readonly resize: ResizeObserver;
  private local: PlayerView;
  private position: Point = { ...SPAWN };
  // Start facing into the backyard's village, the beach behind.
  private heading = Math.PI;
  private moving = false;
  private view: CameraState = START_CAMERA;
  private target: Target | null = null;
  private lastTargetKey = "";
  private world: World | null = null;
  private readonly unsubscribe: (() => void)[] = [];
  private namesOf = new Map<string, string>();
  private disposed = false;

  constructor(
    private readonly container: HTMLElement,
    private readonly models: Models,
    private readonly session: Session,
    private avatarLook: Look,
    private readonly input: Input,
    private readonly callbacks: SceneCallbacks,
    private readonly overview: boolean,
  ) {
    this.renderer = new THREE.WebGPURenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(this.renderer.domElement);
    this.labels.domElement.className = "pointer-events-none absolute inset-0";
    container.appendChild(this.labels.domElement);

    const sky = themeColor("--color-wh-sky");
    this.scene.background = sky;
    // The overview looks down from far above, past where the haze would hide everything.
    if (!overview) this.scene.fog = new THREE.Fog(sky, 60, 200);
    this.scene.add(new THREE.HemisphereLight(sky, themeColor("--color-wh-grass"), 1.6));
    // The sun's shadows cover the ground round the player, and follow them.
    this.sun = new THREE.DirectionalLight(themeColor("--color-wh-sun"), 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -SHADOW_REACH, right: SHADOW_REACH, top: SHADOW_REACH, bottom: -SHADOW_REACH, near: 1, far: 120 });
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);

    const island = buildIsland(models);
    this.scene.add(island.object);
    this.homes = island.homes;
    for (const view of this.homes.values()) {
      const tag = label(TAG_CLASS);
      tag.position.copy(view.tagAt);
      tag.visible = false;
      this.scene.add(tag);
      this.tags.set(view.home.species, tag);
    }
    this.local = this.makePlayer(avatarLook, null);

    this.unsubscribe.push(session.subscribe(() => this.syncWorld()));
    this.unsubscribe.push(session.onMoment((moment) => this.celebrate(moment)));
    this.syncWorld();

    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(container);
    this.fit();
  }

  /** What the end-to-end tests read: the frame count, where the player stands and what interact would do. */
  private frames = 0;
  readonly probe = {
    frames: () => this.frames,
    position: () => ({ ...this.position }),
    heading: () => this.heading,
    target: () => this.target,
    camera: () => ({ ...this.view }),
  };

  async start(): Promise<void> {
    await this.renderer.init();
    if (this.disposed) return;
    paintPortraits(this.renderer, this.models, this.homes.values());
    this.timer.connect(document);
    this.renderer.setAnimationLoop((time) => this.frame(time));
  }

  /** Into the other view, first person or third. */
  toggleView(): void {
    this.setView(toggleView(this.view));
  }

  private setView(view: CameraState): void {
    const changed = view.mode !== this.view.mode;
    this.view = view;
    if (changed) this.callbacks.onCameraMode(view.mode);
  }

  interact(): void {
    const target = this.target;
    if (target === null) return;
    switch (target.kind) {
      case "pick-up":
        this.session.pickUp(target.animal, this.position);
        return;
      case "put-down":
        this.session.putDown(this.dropSpot());
        return;
      case "name":
        this.callbacks.onNameRequest(target.species);
        return;
    }
  }

  setLook(look: Look): void {
    if (sameLook(look, this.avatarLook)) return;
    this.avatarLook = look;
    this.local.caretaker.dispose();
    this.local = this.makePlayer(look, null);
  }

  private makePlayer(look: Look, name: string | null): PlayerView {
    const caretaker = new Caretaker(this.models, look);
    this.scene.add(caretaker.object);
    let tag: CSS2DObject | null = null;
    if (name !== null) {
      tag = label(TAG_CLASS);
      tag.element.textContent = name;
      tag.position.set(0, CARETAKER_HEIGHT + 0.35, 0);
      caretaker.object.add(tag);
    }
    return { caretaker, tag };
  }

  /** The caretaker drawn for a player, once they are drawn. */
  private playerView(id: string): PlayerView | undefined {
    return id === this.session.selfId ? this.local : this.players.get(id);
  }

  private fit(): void {
    const { clientWidth: width, clientHeight: height } = this.container;
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height);
    this.labels.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private dropSpot(): Point {
    return inFront(this.position, this.heading, PUT_DOWN_REACH);
  }

  /** Keep a view per animal, and each pair's name over its home. */
  private syncWorld(): void {
    const { world, room } = this.session.snapshot();
    if (this.world !== null && world !== null && world !== this.world) this.bendForChanges(this.world, world);
    this.world = world;
    this.namesOf = new Map(room.players.map((p) => [p.id, p.name]));
    if (world === null) return;
    for (const animal of world.animals) {
      if (!this.animals.has(animal.id)) this.animals.set(animal.id, this.makeAnimal(animal));
    }
    for (const pair of world.pairs) {
      const tag = this.tags.get(pair.species);
      if (tag !== undefined) tag.element.textContent = pair.naming?.name ?? "";
    }
  }

  /** Whoever just picked an animal up or put one down bends to do it, as everyone sees. */
  private bendForChanges(before: World, after: World): void {
    const carrierOf = (animal: Animal | undefined) => (animal?.where.kind === "carried" ? animal.where.by : null);
    const bending = new Set<string>();
    for (const animal of after.animals) {
      const was = carrierOf(before.animals.find((a) => a.id === animal.id));
      const now = carrierOf(animal);
      if (was === now) continue;
      if (was !== null) bending.add(was);
      if (now !== null) bending.add(now);
    }
    for (const id of bending) this.playerView(id)?.caretaker.pickUp();
  }

  private makeAnimal(animal: Animal): AnimalView {
    const pair = speciesOrThrow(animal.species);
    const model = animal.id.endsWith("/b") ? pair.models[1] : pair.models[0];
    const height = heightOf(model);
    const object = polyInstance(this.models, model, height);
    this.scene.add(object);
    return { object, height, turn: turnOf(animal.id) };
  }

  private celebrate(moment: Moment): void {
    const home = this.homes.get(moment.species);
    if (home !== undefined) this.hearts(home.home);
  }

  private hearts(at: Point): void {
    for (let i = 0; i < 5; i++) {
      // The renderer moves the label by its transform, so the rise animates a child.
      const heart = label("pointer-events-none");
      const rise = document.createElement("span");
      rise.className = "wh-heart-rise block text-2xl text-wh-heart";
      rise.textContent = "♥";
      rise.style.animationDelay = `${i * 0.12}s`;
      heart.element.appendChild(rise);
      heart.position.set(at.x + (i - 2) * 0.35, 1.4, at.z);
      heart.element.addEventListener("animationend", () => heart.removeFromParent(), { once: true });
      this.scene.add(heart);
    }
  }

  private frame(time: number): void {
    this.timer.update(time);
    const dt = Math.min(this.timer.getDelta(), 0.1);
    const now = performance.now();
    this.moveLocal(dt);
    this.session.setLocalAvatar(this.avatar(), now);
    this.updateCamera(dt);
    this.updatePlayers(dt);
    this.updateAnimals();
    this.followSun();
    this.updateTarget();
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
    this.frames += 1;
  }

  private avatar(): Avatar {
    return { x: this.position.x, z: this.position.z, heading: this.heading, moving: this.moving, look: this.avatarLook };
  }

  private moveLocal(dt: number): void {
    const frame = this.input.read(dt);
    this.setView(steer(this.view, frame.look));
    // Push is view-relative: up the screen is away from the camera.
    const push = viewMove(this.view.yaw, frame.move);
    const velocity = { x: push.x * WALK_SPEED, z: push.z * WALK_SPEED };
    // A caretaker bending to pick up or put down stays put for it.
    this.moving = Math.hypot(velocity.x, velocity.z) > 0.1 && !this.local.caretaker.busy;
    if (this.moving) this.position = walk(this.position, velocity, dt);
    // In first person the caretaker faces where they look; in third, where they walk.
    if (this.firstPerson) this.heading = headingOf(this.view.yaw);
    else if (this.moving) this.heading = turnToward(this.heading, Math.atan2(velocity.x, velocity.z), TURN_SPEED * dt);
    this.local.caretaker.object.visible = !this.firstPerson;
    this.place(this.local.caretaker, this.position, this.heading, this.moving, this.session.selfId, dt);
  }

  private place(caretaker: Caretaker, at: Point, heading: number, moving: boolean, id: string, dt: number): void {
    caretaker.object.position.set(at.x, 0, at.z);
    caretaker.object.rotation.y = heading;
    caretaker.holding = this.world !== null && carriedBy(this.world, id) !== undefined;
    caretaker.setMoving(moving);
    caretaker.update(dt);
  }

  private updatePlayers(dt: number): void {
    for (const [id, remote] of this.session.remotes) {
      let view = this.players.get(id);
      if (view === undefined || !sameLook(view.caretaker.look, remote.look)) {
        view?.caretaker.dispose();
        view = this.makePlayer(remote.look, this.namesOf.get(id) ?? "");
        this.players.set(id, view);
      }
      if (view.tag !== null) view.tag.element.textContent = this.namesOf.get(id) ?? "";
      easeRemote(remote, dt);
      this.place(view.caretaker, { x: remote.drawX, z: remote.drawZ }, remote.heading, remote.moving, id, dt);
    }
    for (const [id, view] of this.players) {
      if (!this.session.remotes.has(id)) {
        view.caretaker.dispose();
        this.players.delete(id);
      }
    }
  }

  private updateAnimals(): void {
    const world = this.world;
    if (world === null) return;
    for (const animal of world.animals) {
      const view = this.animals.get(animal.id);
      if (view === undefined) continue;
      const { object } = view;
      const where = animal.where;
      if (where.kind === "lost") {
        object.position.set(where.at.x, 0, where.at.z);
        object.rotation.set(0, view.turn, 0);
      } else if (where.kind === "carried") {
        const carrier = this.playerView(where.by)?.caretaker;
        if (where.by === this.session.selfId && this.firstPerson) this.holdInView(object);
        else if (carrier !== undefined) carrier.hold(object, view.height * HELD_SINK);
      } else {
        const home = this.homes.get(animal.species);
        if (home === undefined) continue;
        object.position.copy(home.seats[animal.id.endsWith("/b") ? 1 : 0]);
        object.rotation.set(0, home.home.turn, 0);
      }
    }
    // A pair's name shows over its home to anyone near enough to read it.
    for (const [species, tag] of this.tags) {
      const home = this.homes.get(species);
      tag.visible = tag.element.textContent !== "" && home !== undefined && distance(this.position, home.home) < TAG_RANGE;
    }
  }

  /** The sun's shadows are drawn round the player, wherever they are on the island. */
  private followSun(): void {
    this.sun.target.position.set(this.position.x, 0, this.position.z);
    this.sun.position.set(this.position.x - 24, 44, this.position.z + 20);
  }

  private get firstPerson(): boolean {
    return this.view.mode === "first" && !this.overview;
  }

  /** In first person the local caretaker isn't drawn, so what they carry is shown low in the view, looking back up at them. */
  private holdInView(animal: THREE.Object3D): void {
    animal.position.copy(FIRST_PERSON_HOLD);
    this.camera.localToWorld(animal.position);
    animal.rotation.set(0, this.heading + Math.PI, 0);
  }

  private updateTarget(): void {
    this.target = this.findTarget();
    const key = JSON.stringify(this.target);
    if (key !== this.lastTargetKey) {
      this.lastTargetKey = key;
      this.callbacks.onTarget(this.target);
    }
  }

  private findTarget(): Target | null {
    const world = this.world;
    if (world === null) return null;
    const held = carriedBy(world, this.session.selfId);
    if (held !== undefined) {
      const home = homeAt(this.dropSpot());
      return { kind: "put-down", home: home?.species ?? null, right: home?.species === held.species };
    }
    // In third person the nearest within reach; in first, the one nearest the middle of the view.
    let best: Target | null = null;
    let bestScore = Infinity;
    const consider = (at: Point, target: Target) => {
      const d = distance(at, this.position);
      if (d > REACH) return;
      const score = this.firstPerson ? offView(this.view.yaw, this.position, at) : d;
      if (score >= bestScore || (this.firstPerson && score > LOOK_CONE)) return;
      best = target;
      bestScore = score;
    };
    for (const animal of world.animals) {
      if (animal.where.kind === "lost") consider(animal.where.at, { kind: "pick-up", animal: animal.id });
    }
    for (const pair of world.pairs) {
      const home = this.homes.get(pair.species);
      if (pair.naming === null && home !== undefined) consider(home.home, { kind: "name", species: pair.species });
    }
    return best;
  }

  private updateCamera(dt: number): void {
    // The overview, for laying out the garden, looks down on all of it.
    const { eye, look } = this.overview
      ? cameraPose({ mode: "third", yaw: 0, pitch: 1.2, zoom: ISLAND.rx * 2.6 }, { x: 0, z: 0 })
      : cameraPose(this.view, this.position);
    // The eyes go with the caretaker; the camera behind follows on a short lag.
    if (this.firstPerson) this.camera.position.set(eye.x, eye.y, eye.z);
    else this.camera.position.lerp(new THREE.Vector3(eye.x, eye.y, eye.z), Math.min(1, dt * 6));
    this.camera.lookAt(look.x, look.y, look.z);
    this.camera.updateMatrixWorld();
  }

  dispose(): void {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.resize.disconnect();
    for (const off of this.unsubscribe) off();
    this.timer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labels.domElement.remove();
  }
}
