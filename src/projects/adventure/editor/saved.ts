import { parseMap, serializeMap, type MapDocument } from "./map";

/** Where this browser keeps the map, under the site's per-project key. */
const KEY = "nw:adventure:map";

/**
 * The map saved in this browser, or null when none is. A saved map that can't
 * be read throws, saying why: it is the owner's work, so it is never passed
 * over for the code's town without a word.
 */
export function savedMap(): MapDocument | null {
  const text = localStorage.getItem(KEY);
  if (text === null) return null;
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new Error(`adventure: the map saved in this browser isn't JSON: ${String(error)}`, { cause: error });
  }
  return parseMap(json);
}

export function saveMap(map: MapDocument): void {
  localStorage.setItem(KEY, serializeMap(map));
}

export function discardSavedMap(): void {
  localStorage.removeItem(KEY);
}
