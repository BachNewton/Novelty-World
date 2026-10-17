// Which screen the page opens on, from its URL. With no switch it is the
// valley; `?cats` is the cat preview, where the cats' art is built and judged.

export type HearthwoodView = "valley" | "cats";

export function hearthwoodView(search: string): HearthwoodView {
  return new URLSearchParams(search).has("cats") ? "cats" : "valley";
}
