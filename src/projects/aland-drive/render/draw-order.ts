import type { Material, Mesh, Object3D } from "three/webgpu";

/*
 * The order the world is drawn in. three doesn't decide it here: with a reversed depth buffer it sorts its opaque list
 * and then reverses the whole list (`RenderList.sort`), which puts the depth order right but turns `renderOrder` upside
 * down, so the sky, meant to come last, was drawn first and shaded every pixel, and the open sea's plane shaded the whole
 * lower half of the screen before the land covered it. So the renderer's sorting is off, and the scene's children are
 * kept in the order below, by the name of the material each draws with: three draws a scene's children in order, the
 * opaque ones first and the transparent ones after, each in that order.
 *
 * What covers most comes first: the player's car, the buildings, then the roads lying on the ground, the placed things,
 * the plantings and the forest, and only then the ground itself, which the depth test spares wherever something already
 * stands. The sea plane shows only past the last ring of terrain and the sky only where nothing is, so each is drawn once
 * everything it could be behind has been. No pixel changes: an opaque frame comes out the same in any order, only what is
 * shaded for nothing does. The transparent things follow every opaque one, from what lies on the ground to what hangs in
 * the air. `tools/frame-cost.mjs` counts what each draw shaded.
 */

/** Where a material not named below draws: among the placed things. */
const PLACED = "(placed)";

/** Material names, earliest drawn first. */
const ORDER: readonly string[] = [
  "car-hero",
  "car",
  "walls",
  "landmarks-far",
  "bridge",
  "underpass",
  "road",
  "cut-ground",
  PLACED,
  "verge-near",
  "verge-far",
  "reeds-near",
  "reeds-far",
  "shrubs-near",
  "shrubs-far",
  "shrubs-bare",
  "granite-outcrops",
  "granite-stones",
  "forest-turned",
  "forest-cone",
  "forest-branches",
  "forest-clumps",
  "terrain-inner",
  "terrain",
  "water",
  "world-edge",
  "sea-plane",
  "sky",
  // Transparent, drawn after everything above whatever their place here.
  "people-shadow",
  "bike-shadow",
  "deer-shadow",
  "forest-haze",
  "forest-haze-far",
  "shrubs-haze",
  "linden-haze",
  "car-glass",
  "tyre-smoke",
  "precipitation",
  "aurora",
  "glows",
];
const RANK = new Map(ORDER.map((name, rank) => [name, rank]));
const PLACED_RANK = RANK.get(PLACED) ?? 0;

/** The material an object draws with: its own, or its first mesh's. */
function materialOf(object: Object3D): Material | null {
  let found: Material | null = null;
  object.traverse((child) => {
    if (found !== null || !("isMesh" in child)) return;
    const { material } = child as Mesh;
    found = Array.isArray(material) ? (material[0] ?? null) : material;
  });
  return found;
}

/** Where an object draws in the order, by its material's name. */
export function drawRank(object: Object3D): number {
  const name = materialOf(object)?.name ?? "";
  return RANK.get(name) ?? PLACED_RANK;
}

/** Puts a scene's children in drawing order. Call it after a child joins, before the frame is drawn. */
export function orderScene(scene: Object3D): void {
  const ranks = new Map(scene.children.map((child) => [child, drawRank(child)]));
  scene.children.sort((a, b) => (ranks.get(a) ?? 0) - (ranks.get(b) ?? 0));
}
