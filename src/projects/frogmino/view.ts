// Which screen the page opens on, from its URL. With no switch it is the
// lobby; the switches exist so a developer lands straight on what they are
// working on.

export type FrogminoView = "lobby" | "solo" | "local" | DevView;

/** `?play=solo` skips the lobby into solo play; `?play=local` opens local
 *  co-op's join screen. */
export const PLAY_PARAM = "play";
const PLAYS = ["solo", "local"] as const;

/** `?replay=<name>` plays a named replay (see `proof/replays.ts`). */
export const REPLAY_PARAM = "replay";

/** Dev views that replace the game entirely, in order of precedence. */
const DEV_VIEWS = ["garage", "world", "sounds", "music", "frog", REPLAY_PARAM] as const;
type DevView = (typeof DEV_VIEWS)[number];

function isPlay(play: string): play is (typeof PLAYS)[number] {
  return (PLAYS as readonly string[]).includes(play);
}

export function frogminoView(search: string): FrogminoView {
  const params = new URLSearchParams(search);
  const devView = DEV_VIEWS.find((view) => params.has(view));
  if (devView !== undefined) return devView;
  const play = params.get(PLAY_PARAM);
  if (play !== null && !isPlay(play)) {
    throw new Error(`Frogmino: unknown ?${PLAY_PARAM}=${play}; the only ones are ${PLAYS.map((p) => `?${PLAY_PARAM}=${p}`).join(" and ")}`);
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
