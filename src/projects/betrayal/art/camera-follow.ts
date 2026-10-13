import type { FloorId } from "../types";
import type { FloorChoice } from "./house";
import type { Point3 } from "./house-camera";

/*
 * The camera's two modes, as a pure reducer over what the player does with
 * the camera and what the game shows. Following, the camera's target tracks
 * the active explorer (or, for a moment, something the turn shows about them,
 * or a figure walking), and the view goes to whatever floor that is on.
 * Free, the camera is the player's alone and nothing in the game moves it.
 * Panning or changing floor by hand frees it; Follow, or a new turn, brings
 * it back. Turning, tilting and zooming change neither: following, they
 * orbit and zoom round whatever is followed.
 */

export type CameraMode = "following" | "free";

/** Something a following camera looks at instead of the active explorer, for
 *  a while: a place the game shows (on its floor), or a figure walking. */
export type Subject = { point: Point3; floor: FloorId } | { figure: string };

export interface CameraFollow {
  mode: CameraMode;
  /** Null: the active explorer. Always null when free. */
  subject: Subject | null;
}

export const FOLLOWING: CameraFollow = { mode: "following", subject: null };

export type CameraCue =
  /** The player pans, or changes floor by hand: the camera is theirs. */
  | { kind: "free" }
  /** The player asks to follow, or a new turn begins: back to the active explorer. */
  | { kind: "follow" }
  /** A place to see: a room appearing, a card drawn, a room shown close, a choice jumped to. */
  | { kind: "show"; point: Point3; floor: FloorId }
  /** A figure starts walking. */
  | { kind: "walk"; figure: string }
  /** A figure has arrived where it was walking. */
  | { kind: "arrive"; figure: string }
  /** A beat lets go of the place it showed (a close view's walls going down). */
  | { kind: "release" };

export function cameraCue(state: CameraFollow, cue: CameraCue): CameraFollow {
  if (cue.kind === "free") return state.mode === "free" ? state : { mode: "free", subject: null };
  if (cue.kind === "follow") return FOLLOWING;
  if (state.mode === "free") return state;
  switch (cue.kind) {
    case "show":
      return { mode: "following", subject: { point: { x: cue.point.x, y: cue.point.y, z: cue.point.z }, floor: cue.floor } };
    case "walk":
      return { mode: "following", subject: { figure: cue.figure } };
    case "arrive":
      return state.subject && "figure" in state.subject && state.subject.figure === cue.figure ? FOLLOWING : state;
    case "release":
      return state.subject && "point" in state.subject ? FOLLOWING : state;
  }
}

/** What the camera aims at: its subject, or the active figure; null when it is free, or there is no one to follow. */
export function followed(state: CameraFollow, active: string | null): Subject | null {
  if (state.mode === "free") return null;
  return state.subject ?? (active === null ? null : { figure: active });
}

/** The floor the view shows while following something on `floor`: that floor, unless every floor is showing. */
export function followedFloor(showing: FloorChoice, floor: FloorId): FloorChoice {
  return showing === "all" ? "all" : floor;
}
