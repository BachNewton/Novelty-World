import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * The page's stylesheet for a test: kits that bake their colours into a model read them from the design tokens as
 * it's built, through `getComputedStyle`, which Node doesn't have. This answers from `globals.css` and the kits'
 * `tokens.css`, as a gallery's page does. Read from disk, since a test is handed a stylesheet import as an empty
 * string; a kit that gains a sheet adds it here, or its first colour throws.
 */
export function installTokenStylesheet(): void {
  const sheets = [
    readFileSync(path.resolve(__dirname, "../../../app/globals.css"), "utf8"),
    readFileSync(path.resolve(__dirname, "bikes/tokens.css"), "utf8"),
    readFileSync(path.resolve(__dirname, "boats/tokens.css"), "utf8"),
    readFileSync(path.resolve(__dirname, "cars/cockpit/tokens.css"), "utf8"),
    readFileSync(path.resolve(__dirname, "dealers/tokens.css"), "utf8"),
    readFileSync(path.resolve(__dirname, "homes/tokens.css"), "utf8"),
    readFileSync(path.resolve(__dirname, "identity/tokens.css"), "utf8"),
    readFileSync(path.resolve(__dirname, "marina/tokens.css"), "utf8"),
    readFileSync(path.resolve(__dirname, "night/tokens.css"), "utf8"),
    readFileSync(path.resolve(__dirname, "people/tokens.css"), "utf8"),
    readFileSync(path.resolve(__dirname, "town-kit/tokens.css"), "utf8"),
  ];
  const tokens = new Map<string, string>();
  for (const css of sheets) {
    for (const [, name, value] of css.matchAll(/(--[\w-]+):\s*([^;]+);/g)) tokens.set(name, value.trim());
  }
  Object.assign(globalThis, {
    document: { documentElement: {} },
    getComputedStyle: () => ({ getPropertyValue: (name: string) => tokens.get(name) ?? "" }),
  });
}
