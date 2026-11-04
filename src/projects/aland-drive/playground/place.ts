/*
 * Where the playground's tile is served from, the site's own public folder, and whether a page asked for it. A
 * page in the playground drives alone, as any page on tiles of its own does.
 */

export const PLAYGROUND_FOLDER = "aland-drive-playground";
const PARAMETER = "playground";

export const playgroundAsked = (search: string) => new URLSearchParams(search).has(PARAMETER);

/** This page's address in the playground, or back in Åland: the same page with the playground asked for or not, and no place to start at. */
export function playgroundLink(href: string, inPlayground: boolean): string {
  const url = new URL(href);
  url.searchParams.delete("at");
  if (inPlayground) url.searchParams.delete(PARAMETER);
  else url.searchParams.set(PARAMETER, "");
  return url.toString();
}
