import { DataTexture, LinearFilter, LinearMipmapLinearFilter, NoColorSpace, RGBAFormat, type Node, ClampToEdgeWrapping } from "three/webgpu";
import { float, floor, ivec2, max, smoothstep, step, texture, textureLoad, vec2 } from "three/tsl";

/*
 * The gallery's stand-in for a surface image in the tile layers: one tile's image in a
 * texture of its own, fetched before the game starts. In the game this is
 * `TileLayers`' array, sampled just as the ground photo is.
 */

const PIXELS = 3000;
const TILE_M = 6000;
const ANISOTROPY = 8;
const RANGE_NEAR_EDGE = 0.5;

/** The tile in the gallery, by the scene's x and z of its north-west corner. */
export const TOWN_TILE = { name: "L2334E", x: -6000, z: 6000 } as const;

let image: DataTexture | null = null;
let ribbons: Uint8Array | null = null;

export async function loadTownSurface(): Promise<void> {
  const [surface, classes] = await Promise.all([fetch(`/town/${TOWN_TILE.name}-surface.rgba`), fetch(`/town/${TOWN_TILE.name}-ribbons.bin`)]);
  if (!surface.ok || !classes.ok) throw new Error("no baked town surface");
  const made = new DataTexture(new Uint8Array(await surface.arrayBuffer()), PIXELS, PIXELS, RGBAFormat);
  made.colorSpace = NoColorSpace;
  made.magFilter = LinearFilter;
  made.minFilter = LinearMipmapLinearFilter;
  made.wrapS = made.wrapT = ClampToEdgeWrapping;
  made.generateMipmaps = true;
  made.anisotropy = ANISOTROPY;
  made.needsUpdate = true;
  image = made;
  ribbons = new Uint8Array(await classes.arrayBuffer());
}

export const townLoaded = () => image !== null;

export function ribbonClassesFor(tile: string, sections: number): Uint8Array {
  if (tile === TOWN_TILE.name && ribbons?.length === sections) return ribbons;
  return new Uint8Array(sections);
}

export function sampleTownSurface(place: Node<"vec2">): { mask: Node<"vec4">; angle: Node<"float">; classed: Node<"float"> } {
  if (!image) throw new Error("the town surface isn't loaded");
  const uv = place.sub(vec2(TOWN_TILE.x, TOWN_TILE.z)).div(TILE_M);
  const inside = step(float(0), uv.x).mul(step(uv.x, float(1))).mul(step(float(0), uv.y)).mul(step(uv.y, float(1)));
  const sampled = texture(image, uv);
  // Off the tile every distance reads as outside, as a tile with no town does.
  const mask = sampled.mul(inside) as unknown as Node<"vec4">;
  const texel = floor(uv.mul(PIXELS)).clamp(0, PIXELS - 1);
  const angle = textureLoad(image, ivec2(texel)).a as unknown as Node<"float">;
  const classed = max(smoothstep(float(RANGE_NEAR_EDGE - 0.01), float(RANGE_NEAR_EDGE + 0.01), mask.r), smoothstep(float(RANGE_NEAR_EDGE - 0.01), float(RANGE_NEAR_EDGE + 0.01), mask.g));
  return { mask, angle, classed };
}
