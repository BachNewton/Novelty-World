// Which screen the page opens on, from its URL. With no switch it is the
// lobby; the switches exist so a developer lands straight on what they are
// working on.

export type FrogminoView = "lobby" | "solo" | DevView;

/** `?play=solo` skips the lobby into solo play. */
export const PLAY_PARAM = "play";

/** Dev views that replace the game entirely, in order of precedence. */
const DEV_VIEWS = ["garage", "world", "sounds", "music", "frog"] as const;
type DevView = (typeof DEV_VIEWS)[number];

export function frogminoView(search: string): FrogminoView {
  const params = new URLSearchParams(search);
  const devView = DEV_VIEWS.find((view) => params.has(view));
  if (devView !== undefined) return devView;
  const play = params.get(PLAY_PARAM);
  if (play === null) return "lobby";
  if (play === "solo") return "solo";
  throw new Error(`Frogmino: unknown ?${PLAY_PARAM}=${play}; the only one is ?${PLAY_PARAM}=solo`);
}
