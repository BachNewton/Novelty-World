import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The page's stylesheet for a test: kits that bake their colours into a model read them from the design tokens as
 * it's built, through `getComputedStyle`, which Node doesn't have. This answers from `globals.css` and each kit's
 * `tokens.css`, as a gallery's page does.
 */
export function useTokenStylesheet(): void {
  const sheets = [join(import.meta.dirname, "../../../app/globals.css"), ...readdirSync(import.meta.dirname, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map(({ name }) => join(import.meta.dirname, name, "tokens.css")).filter(existsSync)];
  const tokens = new Map<string, string>();
  for (const sheet of sheets) {
    for (const [, name, value] of readFileSync(sheet, "utf8").matchAll(/(--[\w-]+):\s*([^;]+);/g)) tokens.set(name, value.trim());
  }
  Object.assign(globalThis, {
    document: { documentElement: {} },
    getComputedStyle: () => ({ getPropertyValue: (name: string) => tokens.get(name) ?? "" }),
  });
}
