import type { Place } from "./game";

/*
 * A link that opens the game at a place: `?at=east,north,height,yaw,pitch`, the same five numbers as `tools/look.mjs`
 * takes and the dev menu copies. The drive starts on the road nearest that place, and the free camera opens on the view.
 * East and north are ETRS-TM35FIN metres, height is above the ground, yaw and pitch radians. A link with only east and
 * north looks from a little above the ground, north.
 */

const PARAMETER = "at";
const GLANCE: Omit<Place, "east" | "north"> = { height: 30, yaw: 0, pitch: -0.15 };

export function placeAsked(search: string): Place | null {
  const asked = new URLSearchParams(search).get(PARAMETER);
  if (asked === null) return null;
  const numbers = asked.split(",").map(Number);
  if ((numbers.length !== 2 && numbers.length !== 5) || numbers.some((number) => !Number.isFinite(number))) {
    throw new Error(`?${PARAMETER}= takes east,north or east,north,height,yaw,pitch, not ${asked}`);
  }
  const [east, north, height = GLANCE.height, yaw = GLANCE.yaw, pitch = GLANCE.pitch] = numbers;
  return { east, north, height, yaw, pitch };
}

/** This page's address, opening at a place. */
export function placeLink(href: string, { east, north, height, yaw, pitch }: Place): string {
  const url = new URL(href);
  url.searchParams.delete(PARAMETER);
  // Set by hand, so the commas stay commas rather than %2C and the link reads as the five numbers it is.
  const place = `${PARAMETER}=${[east.toFixed(1), north.toFixed(1), height.toFixed(1), yaw.toFixed(3), pitch.toFixed(3)].join(",")}`;
  url.search = url.search ? `${url.search}&${place}` : `?${place}`;
  return url.toString();
}
