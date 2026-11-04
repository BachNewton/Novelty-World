/// <reference types="vite/client" />
import globals from "../../../app/globals.css?raw";

const kitSheets = import.meta.glob<string>("./*/tokens.css", { query: "?raw", import: "default", eager: true });

/**
 * The page's stylesheet for a test: kits that bake their colours into a model read them from the design tokens as
 * it's built, through `getComputedStyle`, which Node doesn't have. This answers from `globals.css` and each kit's
 * `tokens.css`, as a gallery's page does.
 */
export function installTokenStylesheet(): void {
  const tokens = new Map<string, string>();
  for (const css of [globals, ...Object.values(kitSheets)]) {
    for (const [, name, value] of css.matchAll(/(--[\w-]+):\s*([^;]+);/g)) tokens.set(name, value.trim());
  }
  Object.assign(globalThis, {
    document: { documentElement: {} },
    getComputedStyle: () => ({ getPropertyValue: (name: string) => tokens.get(name) ?? "" }),
  });
}
