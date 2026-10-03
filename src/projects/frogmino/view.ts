import { PREVIEW_LANES, type PreviewLanes } from "./world/preview-rows";

// Which screen the page opens on, from its URL. With no switch it is the
// lobby; the switches exist so a developer lands straight on what they are
// working on.

export type FrogminoView = "lobby" | "solo" | "local" | DevView;

/** `?play=solo` skips the lobby into solo play; `?play=local` opens local
 *  co-op's join screen. */
export const PLAY_PARAM = "play";
const PLAYS = ["solo", "local"] as const;

/** `?lanes=7|9|10` sets local co-op's road width. */
export const LANES_PARAM = "lanes";
const DEFAULT_COOP_LANES: PreviewLanes = 10;

/** Dev views that replace the game entirely, in order of precedence. */
const DEV_VIEWS = ["garage", "world", "sounds", "music", "frog"] as const;
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
  if (play === "solo" && params.has(LANES_PARAM)) {
    throw new Error(`Frogmino: ?${LANES_PARAM} is for local co-op only; solo plays the stream's own road`);
  }
  return play ?? "lobby";
}

/** Local co-op's road width: `?lanes`, or 10 lanes. Fails loudly on a width
 *  with no co-op rows. */
export function coopLanes(search: string): PreviewLanes {
  const lanes = new URLSearchParams(search).get(LANES_PARAM);
  if (lanes === null) return DEFAULT_COOP_LANES;
  const width = PREVIEW_LANES.find((option) => String(option) === lanes);
  if (width === undefined) {
    throw new Error(`Frogmino: ?${LANES_PARAM}=${lanes} has no co-op rows; the widths are ${PREVIEW_LANES.join(", ")}`);
  }
  return width;
}
