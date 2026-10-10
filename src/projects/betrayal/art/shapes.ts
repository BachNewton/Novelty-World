import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { paletteHex, type PaletteKey } from "./palette";
import { TEXELS_PER_METRE, textureMetres } from "./textures";

/** A lit, flat-shaded palette colour: the default for small props. */
export function flat(colour: PaletteKey): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color: paletteHex(colour), flatShading: true });
}

/** An unlit colour that reads as its own light: flames, embers, moonlit glass. */
export function glow(colour: PaletteKey, map?: THREE.Texture): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: map ? 0xffffff : paletteHex(colour),
    map: map ?? null,
    fog: false,
    transparent: Boolean(map),
    alphaTest: map ? 0.5 : 0,
  });
}

/**
 * Light rather than paint, for glass glow, lamp pools and light beams: it adds
 * to whatever lies behind it, so the surface's own shading shows through the
 * colour. `vertexColors` lets a beam fade along its length.
 */
export function lightMaterial(
  opacity: number,
  { map, vertexColors = false }: { map?: THREE.Texture; vertexColors?: boolean } = {},
): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map: map ?? null,
    vertexColors,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
  });
}

export function textured(texture: THREE.Texture, alpha = false): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ map: texture, alphaTest: alpha ? 0.5 : 0 });
}

/**
 * Gives a geometry UVs taken from its own positions, projected along each
 * face's dominant normal axis and scaled to the texture's world size. Every
 * textured surface therefore shows `TEXELS_PER_METRE`, whatever its shape, and
 * pieces built in one frame continue each other's pattern.
 */
export function projectUvs(geometry: THREE.BufferGeometry, texture: THREE.Texture): THREE.BufferGeometry {
  const metres = textureMetres(texture);
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    const nx = Math.abs(normal.getX(i));
    const ny = Math.abs(normal.getY(i));
    const nz = Math.abs(normal.getZ(i));
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const [u, v] = ny >= nx && ny >= nz ? [x, -z] : nx >= nz ? [z, y] : [x, y];
    uv[i * 2] = u / metres.u;
    uv[i * 2 + 1] = v / metres.v;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geometry;
}

function mapOf(material: THREE.Material): THREE.Texture | null {
  return "map" in material ? (material.map as THREE.Texture | null) : null;
}

/**
 * A box whose base sits at `y` (not its centre), so props are built bottom-up.
 * A textured material gets world-scale UVs; an array of six materials follows
 * three's face order (+x, −x, +y, −y, +z, −z).
 */
export function box(
  size: [number, number, number],
  material: THREE.Material | THREE.Material[],
  at: [number, number, number] = [0, 0, 0],
): THREE.Mesh {
  const [w, h, d] = size;
  const geometry = new THREE.BoxGeometry(w, h, d);
  geometry.translate(at[0], at[1] + h / 2, at[2]);
  const map = (Array.isArray(material) ? material : [material]).map(mapOf).find(Boolean);
  if (map) projectUvs(geometry, map);
  return new THREE.Mesh(geometry, material);
}

/** A cylinder standing on `y`, low-poly by default. */
export function cylinder(
  radius: number,
  height: number,
  material: THREE.Material,
  at: [number, number, number] = [0, 0, 0],
  { top = radius, sides = 8 }: { top?: number; sides?: number } = {},
): THREE.Mesh {
  const geometry = new THREE.CylinderGeometry(top, radius, height, sides);
  geometry.translate(at[0], at[1] + height / 2, at[2]);
  return new THREE.Mesh(geometry, material);
}

/**
 * A flat picture of a pixel texture, sized so its pixels match the room's
 * texel density. Faces +z; `alpha` cuts out transparent pixels.
 */
export function pixelPlane(texture: THREE.Texture, { lit = true, alpha = false } = {}): THREE.Mesh {
  const image = texture.image as { width: number; height: number };
  const geometry = new THREE.PlaneGeometry(image.width / TEXELS_PER_METRE, image.height / TEXELS_PER_METRE);
  const material = lit
    ? textured(texture, alpha)
    : new THREE.MeshBasicMaterial({ map: texture, fog: false, alphaTest: alpha ? 0.5 : 0 });
  return new THREE.Mesh(geometry, material);
}

/** A lathe solid from a profile of [radius, height] points, bottom to top. */
export function lathe(profile: [number, number][], material: THREE.Material, sides = 10): THREE.Mesh {
  const points = profile.map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.Mesh(new THREE.LatheGeometry(points, sides), material);
}

export type Size = [w: number, h: number, d: number];

/**
 * Many small boxes merged into one mesh, each tinted by vertex colour: a wall
 * of books is thousands of pieces, far too many to draw one by one.
 */
export function batch() {
  const parts: THREE.BufferGeometry[] = [];
  const add = (size: Size, colour: PaletteKey, matrix: THREE.Matrix4) => {
    const geometry = new THREE.BoxGeometry(...size).applyMatrix4(matrix);
    const { r, g, b } = new THREE.Color(paletteHex(colour));
    const count = geometry.getAttribute("position").count;
    const colours = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) colours.set([r, g, b], i * 3);
    geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
    parts.push(geometry);
  };
  return {
    add,
    /** A box standing on `at` (its base, not its centre), like `box`. */
    block: (size: Size, colour: PaletteKey, at: [number, number, number]) => {
      add(size, colour, new THREE.Matrix4().makeTranslation(at[0], at[1] + size[1] / 2, at[2]));
    },
    mesh: () => {
      const merged = mergeGeometries(parts);
      for (const part of parts) part.dispose();
      return new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ vertexColors: true }));
    },
  };
}
export type Batch = ReturnType<typeof batch>;

export function group(...children: THREE.Object3D[]): THREE.Group {
  const result = new THREE.Group();
  if (children.length) result.add(...children);
  return result;
}

/** The bounds of everything showing under `root`, in its world's metres. */
export function shownBounds(root: THREE.Object3D): THREE.Box3 {
  const bounds = new THREE.Box3();
  const part = new THREE.Box3();
  const visit = (object: THREE.Object3D) => {
    if (!object.visible) return;
    // A batch's geometry holds its parts unposed; the parts it draws count themselves.
    if (object instanceof THREE.Mesh && !(object instanceof THREE.BatchedMesh)) {
      const geometry = object.geometry as THREE.BufferGeometry;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      if (geometry.boundingBox) bounds.union(part.copy(geometry.boundingBox).applyMatrix4(object.matrixWorld));
    }
    for (const child of object.children) visit(child);
  };
  visit(root);
  return bounds;
}
