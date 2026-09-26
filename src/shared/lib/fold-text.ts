/** Lowercases text and strips its diacritics, so comparing folded strings
 *  ignores case and accents: "Leppälä", "LEPPALA" and "leppala" all fold to
 *  "leppala". Only letters that decompose into a base letter and a combining
 *  mark fold; letters that are distinct in their own right, like "ø" or "ß",
 *  stay as they are. */
export function foldText(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}
