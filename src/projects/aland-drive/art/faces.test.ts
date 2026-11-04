import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ArtModel } from "./catalogue";
import { coplanarOverlaps } from "./coplanar";
import { useTokenStylesheet } from "./stylesheet";

useTokenStylesheet();

// Two faces in one plane flicker as the camera moves, which no still shot shows, so every kit's every model is checked.
const catalogues = import.meta.glob<{ artModels: () => ArtModel[] }>("./*/catalogue.ts", { eager: true });
const kits = readdirSync(import.meta.dirname, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map(({ name }) => name);

describe("every kit's models", () => {
  it.each(kits.filter((kit) => existsSync(join(import.meta.dirname, kit, "gallery-page.ts"))))("%s lists what its gallery shows in its catalogue", (kit) => {
    expect(catalogues[`./${kit}/catalogue.ts`]?.artModels).toBeTypeOf("function");
  });

  const models = Object.entries(catalogues).flatMap(([path, { artModels }]) => artModels().map((model) => [`${path.split("/")[1]}: ${model.name}`, model] as const));
  it.each(models)("%s has no two faces fighting for one plane", (_, { geometries, groundY = 0 }) => {
    const found = Object.entries(geometries).flatMap(([version, geometry]) => (geometry === null ? [] : coplanarOverlaps(geometry, { groundY }).map(({ at }) => `${version} at ${at.map((value) => value.toFixed(2)).join(", ")}`)));
    expect(found).toEqual([]);
  });
});
