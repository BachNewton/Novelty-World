// Which screen the page opens on, from its URL. With no switch it is the
// world; `?cats` is the cat preview, where the cats' art is built and judged,
// and `?art` is the gallery of every other piece of the game's art.

export type HearthwoodView = "world" | "cats" | "art";

export function hearthwoodView(search: string): HearthwoodView {
  const params = new URLSearchParams(search);
  if (params.has("cats")) return "cats";
  if (params.has("art")) return "art";
  return "world";
}
