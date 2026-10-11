/**
 * The page's query string, or "" where there is no page: in tests, tools and
 * workers, whose modules read the same settings.
 *
 * Not `typeof window`: Next compiles that to "object" in browser bundles, a
 * worker's included, where there is no window. Nor a check for `document`,
 * which the headless canvas stand-in (`headless.ts`) puts on a test's or a
 * worker's global.
 */
export function pageSearch(): string {
  return "window" in globalThis ? window.location.search : "";
}
