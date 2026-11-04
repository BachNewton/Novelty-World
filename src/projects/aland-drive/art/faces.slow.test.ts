import { describe, expect, it } from "vitest";
import type { ArtModel } from "./catalogue";
import KNOWN from "./known-overlaps.json";
import { overlapsOf } from "./overlaps";
import { installTokenStylesheet } from "./stylesheet";

installTokenStylesheet();

// Two faces in one plane flicker as the camera moves, which no still shot shows, so every kit's every model is checked.
// Loaded once the stylesheet is in, since some kits read their colours as they load.
const catalogues = Object.fromEntries(
  await Promise.all(Object.entries(import.meta.glob<{ artModels: () => ArtModel[] }>("./*/catalogue.ts")).map(async ([path, load]) => [path, await load()] as const)),
);
const galleries = Object.keys(import.meta.glob("./*/gallery-page.ts"));
const kitOf = (path: string) => path.split("/")[1];
const known: Record<string, Record<string, number> | undefined> = KNOWN;

const models = Object.entries(catalogues).flatMap(([path, { artModels }]) => artModels().map((model) => [`${kitOf(path)}: ${model.name}`, model] as const));

describe("every kit's models", () => {
  it.each(galleries.map(kitOf))("%s lists what its gallery shows in its catalogue", (kit) => {
    expect(Object.keys(catalogues).map(kitOf)).toContain(kit);
  });

  // Its own faces, the ground it stands on and, laid end to end, the next one along: a placement fights where a face
  // lies flat on the ground or meets its neighbour's in one plane. Art that was there before the check keeps the
  // overlaps it had, written down in known-overlaps.json; anything new has none. A count that falls is a fix, and the
  // list is brought down to it.
  it.each(models)("%s has no two faces fighting for one plane that it didn't have", (name, model) => {
    const found = Object.fromEntries(
      Object.entries(model.geometries).flatMap(([version, geometry]) => {
        if (geometry === null) return [];
        const { own, onGround, beside } = overlapsOf(geometry, model);
        return [[version, own], [`${version} on its ground`, onGround], [`${version} beside the next`, beside]].filter(([, count]) => count !== 0);
      }),
    );
    expect(found).toEqual(known[name] ?? {});
  });

  it("lists only models that exist", () => {
    const names = new Set<string>(models.map(([name]) => name));
    expect(Object.keys(known).filter((name) => !names.has(name))).toEqual([]);
  });
});
