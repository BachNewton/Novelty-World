import * as THREE from "three/webgpu";

/**
 * A model's animation: a looping pose (standing or walking) and one-shot
 * poses that play once over it, then hand back to whichever loop it is in by then.
 */
export class Poses<Pose extends string> {
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<Pose, THREE.AnimationAction>();
  private looping: Pose;
  private oneShot: THREE.AnimationAction | null = null;

  constructor(
    root: THREE.Object3D,
    clips: ReadonlyMap<string, THREE.AnimationClip>,
    poseClips: Record<Pose, string>,
    loops: readonly Pose[],
    who: string,
  ) {
    this.mixer = new THREE.AnimationMixer(root);
    for (const [pose, name] of Object.entries(poseClips) as [Pose, string][]) {
      const clip = clips.get(name);
      if (clip === undefined) throw new Error(`whisker hollow: the ${who} has no ${name} clip`);
      const action = this.mixer.clipAction(clip);
      if (!loops.includes(pose)) action.setLoop(THREE.LoopOnce, 1);
      this.actions.set(pose, action);
    }
    this.mixer.addEventListener("finished", () => {
      if (this.oneShot === null) return;
      this.oneShot.fadeOut(0.2);
      this.oneShot = null;
      this.action(this.looping).reset().fadeIn(0.2).play();
    });
    this.looping = loops[0];
    this.action(this.looping).play();
    // Start each model at a different point in its loop, so a crowd doesn't breathe in step.
    this.mixer.setTime(Math.random() * 2);
  }

  private action(pose: Pose): THREE.AnimationAction {
    const action = this.actions.get(pose);
    if (action === undefined) throw new Error(`whisker hollow: no ${pose} pose`);
    return action;
  }

  /** Whether a one-shot is playing. */
  get busy(): boolean {
    return this.oneShot !== null;
  }

  /** Switch the loop underneath, crossfading unless a one-shot is playing over it. */
  loop(pose: Pose): void {
    if (pose === this.looping) return;
    const from = this.action(this.looping);
    this.looping = pose;
    if (this.oneShot !== null) return;
    this.action(pose).reset().fadeIn(0.2).play();
    from.fadeOut(0.2);
  }

  /** Play a pose once over the loop. */
  once(pose: Pose, timeScale = 1): void {
    const action = this.action(pose);
    (this.oneShot ?? this.action(this.looping)).fadeOut(0.15);
    this.oneShot = action;
    action.reset().setEffectiveTimeScale(timeScale).fadeIn(0.15).play();
  }

  update(dt: number): void {
    this.mixer.update(dt);
  }

  stop(): void {
    this.mixer.stopAllAction();
  }
}
