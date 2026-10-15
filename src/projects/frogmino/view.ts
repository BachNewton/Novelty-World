import { coopCourseById, DEFAULT_COOP_COURSE } from "./coop-courses";

// Which screen the page opens on, from its URL. With no switch it is the
// lobby; the switches exist so a developer lands straight on what they are
// working on.

export type FrogminoView = "lobby" | "local" | DevView;

/** `?play=local` skips the lobby into local co-op's join screen. */
export const PLAY_PARAM = "play";

/** `?replay=<name>` plays a named replay (see `proof/replays.ts`). */
export const REPLAY_PARAM = "replay";

/** Dev views that replace the game entirely, in order of precedence. */
const DEV_VIEWS = ["garage", "world", "sounds", "music", "frog", REPLAY_PARAM] as const;
type DevView = (typeof DEV_VIEWS)[number];

export function frogminoView(search: string): FrogminoView {
  const params = new URLSearchParams(search);
  const devView = DEV_VIEWS.find((view) => params.has(view));
  if (devView !== undefined) return devView;
  const play = params.get(PLAY_PARAM);
  if (play !== null && play !== "local") {
    throw new Error(`Frogmino: unknown ?${PLAY_PARAM}=${play}; the only one is ?${PLAY_PARAM}=local`);
  }
  return play ?? "lobby";
}

/** The replay `?replay` names. Fails loudly on a missing name; whether a
 *  replay by that name exists is the replay view's to say. */
export function replayName(search: string): string {
  const name = new URLSearchParams(search).get(REPLAY_PARAM);
  if (name === null || name === "") throw new Error(`Frogmino: ?${REPLAY_PARAM} needs a replay's name, as in ?${REPLAY_PARAM}=perch`);
  return name;
}

/** `?course=<id>` picks the co-op course the local join screen and a host's
 *  waiting room start on (see `coop-courses/`). */
export const COURSE_PARAM = "course";

/** The co-op course the URL picks, or the default. Fails loudly on an id no
 *  course has, naming those there are. */
export function coopCourseParam(search: string): string {
  const id = new URLSearchParams(search).get(COURSE_PARAM);
  return id === null ? DEFAULT_COOP_COURSE : coopCourseById(id).id;
}
