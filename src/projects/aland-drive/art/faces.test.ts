import { describe, expect, it } from "vitest";
import type { ArtModel } from "./catalogue";
import { coplanarOverlaps } from "./coplanar";
import { installTokenStylesheet } from "./stylesheet";

installTokenStylesheet();

// Two faces in one plane flicker as the camera moves, which no still shot shows, so every kit's every model is checked.
const catalogues = import.meta.glob<{ artModels: () => ArtModel[] }>("./*/catalogue.ts", { eager: true });
const galleries = Object.keys(import.meta.glob("./*/gallery-page.ts"));
const kitOf = (path: string) => path.split("/")[1];

describe("every kit's models", () => {
  it.each(galleries.map(kitOf))("%s lists what its gallery shows in its catalogue", (kit) => {
    expect(Object.keys(catalogues).map(kitOf)).toContain(kit);
  });

  const models = Object.entries(catalogues).flatMap(([path, { artModels }]) => artModels().map((model) => [`${kitOf(path)}: ${model.name}`, model] as const));
  it.each(models)("%s has no two faces fighting for one plane", (_, { geometries, groundY = 0 }) => {
    const found = Object.entries(geometries).flatMap(([version, geometry]) => (geometry === null ? [] : coplanarOverlaps(geometry, { groundY }).map(({ at }) => `${version} at ${at.map((value) => value.toFixed(2)).join(", ")}`)));
    expect(found).toEqual([]);
  });
});
