/*
 * The cutaway markings: how a wall's meaning to the rules survives being cut
 * down to its stub (see "Walls under the cutaway" in design/presentation.md).
 * A real door shows as a gap with a lit threshold; a window as glass on the
 * stub's cap with its pool of light on the floor; a false door or window, one
 * against a neighbour's wall, as visibly blocked. The stub's cap takes a
 * colour of its own. The house and the bench build their rooms with them on
 * or off, and false doors in one of two styles, from the page's URL, so the
 * prototype can be judged by flipping between them.
 */

/** How a false door shows: boarded across, or an outline on an unbroken stub with a crossed threshold. */
export const FALSE_DOOR_STYLES = ["boarded", "outline"] as const;
export type FalseDoorStyle = (typeof FALSE_DOOR_STYLES)[number];

export interface Markings {
  falseDoor: FalseDoorStyle;
}

export const DEFAULT_MARKINGS: Markings = { falseDoor: "boarded" };

function isStyle(value: string): value is FalseDoorStyle {
  return (FALSE_DOOR_STYLES as readonly string[]).includes(value);
}

/**
 * The markings a page's query string asks for: `markings=off` turns them off
 * (null), and `falseDoor=boarded|outline` picks the false doors' style. They
 * are on, in the default style, unless asked otherwise; a value the page
 * doesn't know throws, so a typo never passes for a choice.
 */
export function markingsFromSearch(search: string): Markings | null {
  const params = new URLSearchParams(search);
  const switched = params.get("markings") ?? "on";
  if (switched !== "on" && switched !== "off") throw new Error(`markings=${switched}: it is on or off`);
  const style = params.get("falseDoor") ?? DEFAULT_MARKINGS.falseDoor;
  if (!isStyle(style)) throw new Error(`falseDoor=${style}: it is one of ${FALSE_DOOR_STYLES.join(", ")}`);
  return switched === "off" ? null : { falseDoor: style };
}
