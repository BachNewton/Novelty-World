import * as THREE from "three/webgpu";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ControlState } from "../input/controls";
import { stepPlayer, type FloorBelow, type Move, type Player } from "../player";

/** Where the orbit turns, above the player's feet: about the middle of a character, who stands some 0.7 to 0.85 tall. */
export const TARGET_HEIGHT = 0.4;
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
/**
 * The furthest the character's drawn height trails the ground: half a stair's
 * step. Up a flight at a run the steps come faster than one settles, and an
 * uncapped settle would add each to the last and sink them into the stairs.
 */
const MAX_SETTLE = 0.07;

/** A character on show: its file's scene or a clone of it, its mixer, and the clip playing. */
export interface Shown {
  character: string;
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  clips: THREE.AnimationClip[];
  action: THREE.AnimationAction | null;
  playing: string;
}

/**
 * One player on foot and the camera that follows them: where they stand, their
 * drawn height's settle, their character and its clips, and their camera's
 * orbit, turn, tilt and zoom. Each player has one, whether they play alone or
 * on half the screen.
 */
export class PlayerView {
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.05, 250);
  readonly orbit: OrbitControls;
  /** How far the character is drawn above their feet, which eases to nothing after the ground under them steps. */
  private settle = 0;
  /** The height the camera follows: the ground the player last stood on, eased. */
  private cameraHeight: number;
  shown: Shown | null = null;

  constructor(
    public player: Player,
    /** Where the camera starts, from the point the orbit turns round. */
    eye: THREE.Vector3,
    canvas: HTMLElement,
  ) {
    this.cameraHeight = player.y;
    this.orbit = new OrbitControls(this.camera, canvas);
    this.orbit.target.set(player.x, player.y + TARGET_HEIGHT, player.z);
    this.camera.position.copy(this.orbit.target).add(eye);
    this.orbit.enablePan = false;
    this.orbit.enableDamping = true;
    this.orbit.minDistance = 1;
    this.orbit.maxDistance = 20;
    // Never below the floor.
    this.orbit.maxPolarAngle = Math.PI / 2 - 0.02;
    this.orbit.update();
  }

  /** Where the camera stands from the point it turns round. */
  eye(): THREE.Vector3 {
    return this.camera.position.clone().sub(this.orbit.target);
  }

  /** Where the character is drawn: their feet, lifted by the settle. */
  drawnAt(): THREE.Vector3 {
    return new THREE.Vector3(this.player.x, this.player.y + this.settle, this.player.z);
  }

  /** Put the camera at `eye`, looking at `at`, as an orbit the player can carry on from. */
  lookFrom(eye: readonly [number, number, number], at: readonly [number, number, number]): void {
    this.camera.position.set(...eye);
    this.orbit.target.set(...at);
    this.orbit.update();
  }

  /** Put the player at a place at once, settled, their camera moved with them as it looked. */
  standAt(x: number, y: number, z: number): void {
    const shift = new THREE.Vector3(x - this.player.x, y - this.cameraHeight, z - this.player.z);
    this.player = { ...this.player, x, y, z, airborne: false, rise: 0 };
    this.settle = 0;
    this.cameraHeight = y;
    this.camera.position.add(shift);
    this.orbit.target.add(shift);
    this.placeCharacter();
  }

  /** Show a character as this player, cut straight to its gait's clip, or to `clip` while standing. */
  show(shown: Shown, clip: string): void {
    this.shown = shown;
    this.placeCharacter();
    const moving = this.player.gait !== "idle";
    const names = shown.clips.map((c) => c.name);
    this.playOn(moving ? this.player.gait : names.includes(clip) ? clip : names[0], false);
  }

  /** Blend into a clip from whatever played before, or cut to it when `fade` is off (a character just shown). */
  playOn(name: string, fade: boolean): void {
    const shown = this.shown;
    if (shown === null) throw new Error("adventure: no character is shown");
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

  /** Swing the camera round the player, tilt it and zoom it, as the arrow keys and + and − ask: right looks further right, up looks up. */
  turnCamera({ turn, tilt, zoom }: ControlState, dt: number): void {
    if (turn === 0 && tilt === 0 && zoom === 0) return;
    const offset = this.eye();
    const view = new THREE.Spherical().setFromVector3(offset);
    view.theta -= turn * TURN_SPEED * dt;
    view.phi = THREE.MathUtils.clamp(view.phi + tilt * TILT_SPEED * dt, this.orbit.minPolarAngle, this.orbit.maxPolarAngle);
    view.radius = THREE.MathUtils.clamp(view.radius * Math.exp(-zoom * ZOOM_SPEED * dt), this.orbit.minDistance, this.orbit.maxDistance);
    view.makeSafe();
    this.camera.position.copy(this.orbit.target).add(offset.setFromSpherical(view));
  }

  /**
   * Step the player as their controls ask, over the ground `floor` reports,
   * within `reach` of the origin, and the camera after them. Says whether the
   * clip playing changed by itself: they set off, or stopped.
   */
  walk(asked: ControlState, dt: number, reach: number, floor: FloorBelow): boolean {
    const before = this.player;
    this.player = stepPlayer(before, this.move(asked), dt, reach, floor);
    // A step of the ground under them is drawn as a settle, never a jump of the whole character.
    if (!before.airborne && !this.player.airborne) this.settle = THREE.MathUtils.clamp(this.settle + before.y - this.player.y, -MAX_SETTLE, MAX_SETTLE);
    this.settle *= Math.exp(-dt / SETTLE_TIME);
    const standing = this.player.airborne ? this.cameraHeight : this.player.y;
    const rise = (standing - this.cameraHeight) * (1 - Math.exp(-dt / CAMERA_SETTLE_TIME));
    this.cameraHeight += rise;
    const shift = new THREE.Vector3(this.player.x - before.x, rise, this.player.z - before.z);
    this.camera.position.add(shift);
    this.orbit.target.add(shift);
    this.placeCharacter();
    const shown = this.shown;
    if (shown === null) return false;
    const changed = this.player.gait !== before.gait;
    // The gaits are named for the clips that show them.
    if (changed) this.playOn(this.player.gait, true);
    // A slower walk plays its clip slower, so a planted foot stays still; a clip picked from the list plays as made.
    if (shown.action) shown.action.timeScale = shown.playing === this.player.gait ? this.player.stride : 1;
    return changed;
  }

  /** Fit the camera to the part of the screen it draws on. */
  fit(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /** What the controls ask for, turned from the camera's view onto the ground: ahead goes away from the camera. */
  private move({ ahead, right, sprint, jump }: ControlState): Move {
    if (ahead === 0 && right === 0) return { x: 0, z: 0, sprint, jump };
    const look = this.camera.getWorldDirection(new THREE.Vector3());
    const forward = new THREE.Vector2(look.x, look.z).normalize();
    // Right of the view, on the ground: the forward direction turned a quarter clockwise seen from above.
    return { x: forward.x * ahead - forward.y * right, z: forward.y * ahead + forward.x * right, sprint, jump };
  }

  private placeCharacter(): void {
    if (this.shown === null) return;
    this.shown.root.position.copy(this.drawnAt());
    this.shown.root.rotation.y = this.player.yaw;
  }

  dispose(): void {
    this.orbit.dispose();
  }
}
