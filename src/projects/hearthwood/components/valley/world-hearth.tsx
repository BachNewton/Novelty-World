"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { type Camera, Matrix4, Quaternion, Vector3 } from "three";
import { offerScore, type Viewer } from "../../gameplay/offering";
import type { WalkState } from "../../input/use-walk-input";
import type { AtmosphereUniforms } from "../../art/atmosphere";
import type { DishPalette } from "../../art/dish-looks";
import { HearthCooking, type CookingDrive } from "../../art/hearth-cooking";
import type { BrewPalette } from "../../art/brew-looks";
import { HearthBrewing, type BrewingDrive } from "../../art/hearth-brewing";
import { underFullMoon } from "../../gameplay/brewing";
import type { ValleyClock } from "./clock";
import { cameraPose, ease, easeBack, place, takeOver, type CameraPose } from "./camera-ease";
import { pitchedSite, subscribeCamping } from "./camping";
import type { Companionship } from "./companionship";
import { AFTER_RENDER_PRIORITY } from "./feature-renderer";
import { catchUp, turnBetween } from "./follow-camera";
import type { Foraging } from "./foraging";
import { answerFireTaps, brewedNow, offerableFire, settleFire, stepHearth, subscribeHearth, tellHearthSky, type Hearth } from "./hearth";
import { HEARTH_FOV, hearthView, sideOf, towardFire } from "./hearth-camera";
import type { Walker } from "./walker";

/*
 * The camp's fire as a place to cook: each frame it weighs the fire as
 * something offered (before the animals and forage, which must beat it),
 * steps the hearth's clock, and while a turn is on seats Elliott (the
 * walker held, turned to the fire) and eases the camera from wherever it
 * was to the hearth's view, and back to the walker's when they get up. It
 * tells the hearth the calendar's day and whether a full moon is up, draws
 * what cooks on the fire and the dish served, or the cauldron brewing and
 * the brew made, and answers a tap on the fire.
 */

/** After the walker has placed the camera and before a free camera overrides it. */
export const HEARTH_PRIORITY = -3;

/** How quickly the camera eases to the hearth and back, and Elliott turns to the fire, per second. */
const EASE = 2.6;
const TURN = 3;
/** Looking down at the fire, in first person, as they sit there. */
const LOOK_DOWN = -0.32;
/** A tap lands on the fire within this many CSS pixels of its middle, within this many metres of Elliott. */
const TAP_SLOP = 90;
const TAP_REACH = 4.5;
/** How quickly the cooking's heat dies down once the dish is out, per second. */
const COOL = 1.4;

export function WorldHearth({
  hearth,
  foraging,
  companionship,
  walker,
  input,
  clock,
  palette,
  brewPalette,
  atmosphere,
  outbid = () => false,
}: {
  hearth: Hearth;
  foraging: Foraging;
  companionship: Companionship;
  walker: Walker;
  input: RefObject<WalkState>;
  clock: ValleyClock;
  palette: DishPalette;
  brewPalette: BrewPalette;
  atmosphere: AtmosphereUniforms;
  /** Whether something else not weighed here (a person) is offered more strongly than the fire this frame. */
  outbid?: () => boolean;
}) {
  const subscribe = useCallback((listener: () => void) => subscribeHearth(hearth, listener), [hearth]);
  const shown = useSyncExternalStore(subscribe, () => hearth.shown);
  const subscribeCamp = useCallback((listener: () => void) => subscribeCamping(hearth.camping, listener), [hearth]);
  const site = useSyncExternalStore(subscribeCamp, () => pitchedSite(hearth.camping));
  const camera = useThree((s) => s.camera);
  const canvas = useThree((s) => s.gl.domElement);
  const drive = useRef<CookingDrive>({ heat: 0, served: null });
  const brewDrive = useRef<BrewingDrive>({ brewed: 0, made: null });
  const madeAt = useRef<number | null>(null);
  const pose = useRef<CameraPose>(cameraPose(HEARTH_FOV));
  const servedAt = useRef<number | null>(null);
  // The side of the fire Elliott sat down on, fixed for the turn.
  const [side, setSide] = useState(0);
  const sideNow = useRef(0);
  const projected = useMemo(() => new Vector3(), []);

  useEffect(() => {
    answerFireTaps(hearth, (x, y) => {
      const fire = offerableFire(hearth);
      if (fire === null) return false;
      const { heart } = fire;
      if (Math.hypot(heart.x - walker.x, heart.z - walker.z) > TAP_REACH) return false;
      const rect = canvas.getBoundingClientRect();
      projected.set(heart.x, heart.y, heart.z).project(camera);
      if (projected.z > 1) return false;
      const sx = rect.left + ((projected.x + 1) / 2) * rect.width;
      const sy = rect.top + ((1 - projected.y) / 2) * rect.height;
      return Math.hypot(sx - x, sy - y) < TAP_SLOP;
    });
    return () => {
      answerFireTaps(hearth, null);
    };
  }, [hearth, walker, camera, canvas, projected]);

  useFrame(({ camera: eye }, delta) => {
    tellHearthSky(hearth, clock.date.days, underFullMoon(clock.sky.moon, clock.sky.sun));
    frameHearth({ hearth, companionship, walker, input: input.current, pose: pose.current, drive: drive.current, brewDrive: brewDrive.current, servedAt, madeAt, side: sideNow, onSit: setSide }, eye, delta);
  }, HEARTH_PRIORITY);

  // After the frame: forage or an animal offered beats the fire, as they each had to beat it.
  useFrame(() => {
    settleFire(hearth, foraging.target !== null || companionship.candidate !== null || outbid());
  }, AFTER_RENDER_PRIORITY);

  const session = shown.session;
  const brewing = shown.brewing;
  if (!site) return null;
  if (session && shown.craft === "brew" && brewing) {
    return (
      <HearthBrewing
        at={site}
        side={side}
        ingredients={brewing.chosen}
        brew={brewing.phase === "choosing" ? null : brewing.brew}
        made={brewing.phase === "brewed"}
        palette={brewPalette}
        atmosphere={atmosphere}
        drive={brewDrive}
      />
    );
  }
  return (
    <HearthCooking
      at={site}
      side={side}
      cookware={session?.cookware ?? null}
      ingredients={session?.chosen ?? []}
      dish={session?.phase === "served" ? session.dish : null}
      palette={palette}
      atmosphere={atmosphere}
      drive={drive}
    />
  );
}

interface HearthFrame {
  hearth: Hearth;
  companionship: Companionship;
  walker: Walker;
  input: WalkState;
  pose: CameraPose;
  drive: CookingDrive;
  brewDrive: BrewingDrive;
  servedAt: { current: number | null };
  madeAt: { current: number | null };
  /** The side of the fire Elliott sat down on, fixed for the turn, and who hears it. */
  side: { current: number };
  onSit: (side: number) => void;
}

const scratch = { matrix: new Matrix4(), quaternion: new Quaternion(), eye: new Vector3(), look: new Vector3(), up: new Vector3(0, 1, 0) };

/** One frame at the hearth: its clock, the fire's offer, sitting down and getting up, the camera, and how hard it cooks. */
function frameHearth({ hearth, companionship, walker, input, pose, drive, brewDrive, servedAt, madeAt, side, onSit }: HearthFrame, eye: Camera, delta: number): void {
  const seconds = Math.min(delta, 0.1);
  stepHearth(hearth, seconds);
  const session = hearth.shown.session;

  const viewer: Viewer | null =
    walker.view !== "walk" ? null : input.pointOfView === "first" ? { pointOfView: "first", eye: eye.position, look: eye.getWorldDirection(new Vector3()) } : { pointOfView: "third", x: walker.x, z: walker.z, heading: walker.heading };
  const offerable = offerableFire(hearth);
  hearth.candidate = viewer && offerable && companionship.shown.naming === null ? offerScore(viewer, offerable) : null;

  // Sitting down and getting up.
  const fire = pitchedSite(hearth.camping);
  if (session && walker.view === "walk" && fire) {
    walker.view = "hearth";
    side.current = sideOf(fire, walker);
    onSit(side.current);
    takeOver(pose, eye, HEARTH_FOV);
  }
  if (!session && walker.view === "hearth") walker.view = "walk";

  const k = catchUp(EASE, seconds);
  if (walker.view === "hearth" && fire) {
    // Turned to the fire, looking down at it, so getting up they face it in either view.
    const facing = towardFire(side.current);
    const turn = catchUp(TURN, seconds);
    walker.heading += turnBetween(walker.heading, facing) * turn;
    walker.orbit = { ...walker.orbit, yaw: walker.orbit.yaw + turnBetween(walker.orbit.yaw, facing) * turn };
    walker.lookPitch += (LOOK_DOWN - walker.lookPitch) * turn;
    const view = hearthView(fire, side.current, Math.hypot(walker.x - fire.x, walker.z - fire.z));
    scratch.eye.set(view.eye.x, view.eye.y, view.eye.z);
    scratch.look.set(view.look.x, view.look.y, view.look.z);
    scratch.matrix.lookAt(scratch.eye, scratch.look, scratch.up);
    scratch.quaternion.setFromRotationMatrix(scratch.matrix);
    ease(pose, scratch.eye, scratch.quaternion, HEARTH_FOV, k);
    place(eye, pose);
  } else if (pose.easing) {
    easeBack(pose, eye, HEARTH_FOV, k);
  }

  // How far it has brewed, and how long the brew has been out.
  const brewing = hearth.shown.brewing;
  brewDrive.brewed = brewedNow(hearth);
  if (brewing?.phase === "brewed") {
    madeAt.current ??= hearth.time;
    brewDrive.made = hearth.time - madeAt.current;
  } else {
    madeAt.current = null;
    brewDrive.made = null;
  }

  // How hard it cooks, and how long the dish has been out.
  if (session?.phase === "served") {
    servedAt.current ??= hearth.time;
    drive.served = hearth.time - servedAt.current;
    drive.heat *= 1 - catchUp(COOL, seconds);
  } else {
    servedAt.current = null;
    drive.served = null;
    drive.heat = session?.phase === "cooking" ? 1 : 0;
  }
}
