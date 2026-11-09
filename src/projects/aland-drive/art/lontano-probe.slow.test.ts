import { it } from "vitest";
import type { BufferGeometry } from "three";
import { installTokenStylesheet } from "./stylesheet";
import { coplanarOverlaps } from "./coplanar";

installTokenStylesheet();
const { artModels } = await import("./cars/catalogue");

const corners = (g: BufferGeometry, t: number) => {
  const p = g.getAttribute("position");
  const index = g.getIndex();
  return [0, 1, 2].map((k) => {
    const v = index ? index.getX(t * 3 + k) : t * 3 + k;
    return [p.getX(v), p.getY(v), p.getZ(v)].map((n) => n.toFixed(3)).join(",");
  });
};

it("lists Lontano's overlaps", () => {
  for (const m of artModels().filter((model) => model.name === "Lontano hero")) {
    const g = m.geometries.body;
    if (!g) continue;
    const list = Array.isArray(g) ? g : [g];
    for (const o of coplanarOverlaps(list, { groundY: m.groundY ?? 0 })) console.log("OVERLAP", JSON.stringify(o.at), "A", corners(list[o.sources[0]], o.triangles[0]), "B", corners(list[o.sources[1]], o.triangles[1]), "groundY", m.groundY);
  }
});
