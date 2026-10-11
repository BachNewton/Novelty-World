import * as THREE from "three";
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
    // three draws a transparent double-sided material in two passes, back faces then front, by flipping
    // its side and marking it changed for each, which rebuilds its shader parameters twice a draw, every frame.
    // Added light sums the same in any order, so one pass draws it the same.
    forceSinglePass: true,
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

/** A box's six faces as `THREE.BoxGeometry` lays them, in its order: the axes a face's
 *  corners run along (u, v) and out of (w), which way each runs, and the sizes along them. */
const BOX_FACES: [u: number, v: number, w: number, uDir: number, vDir: number, uSize: number, vSize: number, wSize: number, wSign: number][] = [
  [2, 1, 0, -1, -1, 2, 1, 0, 1],
  [2, 1, 0, 1, -1, 2, 1, 0, -1],
  [0, 2, 1, 1, 1, 0, 2, 1, 1],
  [0, 2, 1, 1, -1, 0, 2, 1, -1],
  [0, 1, 2, 1, -1, 0, 1, 2, 1],
  [0, 1, 2, -1, -1, 0, 1, 2, -1],
];

/**
 * Many small boxes merged into one mesh, each tinted by vertex colour: a wall
 * of books is thousands of pieces, far too many to draw one by one. Each box
 * is written straight into the batch's arrays, vertex for vertex what a
 * `THREE.BoxGeometry` moved by its matrix and merged would hold, without
 * making that geometry: a room of books made thousands of them.
 */
export function batch() {
  const position: number[] = [];
  const normal: number[] = [];
  const uv: number[] = [];
  const colour: number[] = [];
  const index: number[] = [];
  const tints = new Map<PaletteKey, THREE.Color>();
  const normalMatrix = new THREE.Matrix3();
  const corner = new THREE.Vector3();
  const facing = new THREE.Vector3();
  const local = [0, 0, 0];
  const add = (size: Size, tint: PaletteKey, matrix: THREE.Matrix4) => {
    let rgb = tints.get(tint);
    if (!rgb) tints.set(tint, (rgb = new THREE.Color(paletteHex(tint))));
    normalMatrix.getNormalMatrix(matrix);
    for (const [u, v, w, uDir, vDir, uSize, vSize, wSize, wSign] of BOX_FACES) {
      const width = size[uSize];
      const height = size[vSize];
      const depth = wSign * size[wSize];
      const first = position.length / 3;
      for (let iy = 0; iy < 2; iy++) {
        for (let ix = 0; ix < 2; ix++) {
          // The corner as BoxGeometry stores it, in 32-bit floats, before it is moved.
          local[u] = (ix * width - width / 2) * uDir;
          local[v] = (iy * height - height / 2) * vDir;
          local[w] = depth / 2;
          corner.set(Math.fround(local[0]), Math.fround(local[1]), Math.fround(local[2])).applyMatrix4(matrix);
          position.push(corner.x, corner.y, corner.z);
          local[u] = 0;
          local[v] = 0;
          local[w] = depth > 0 ? 1 : -1;
          facing.set(local[0], local[1], local[2]).applyNormalMatrix(normalMatrix);
          normal.push(facing.x, facing.y, facing.z);
          uv.push(ix, 1 - iy);
          colour.push(rgb.r, rgb.g, rgb.b);
        }
      }
      index.push(first, first + 2, first + 1, first + 2, first + 3, first + 1);
    }
  };
  return {
    add,
    /** A box standing on `at` (its base, not its centre), like `box`. */
    block: (size: Size, tint: PaletteKey, at: [number, number, number]) => {
      add(size, tint, new THREE.Matrix4().makeTranslation(at[0], at[1] + size[1] / 2, at[2]));
    },
    mesh: () => {
      if (index.length === 0) throw new Error("A batch was meshed with no boxes in it");
      const geometry = new THREE.BufferGeometry();
      geometry.setIndex(index);
      geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(position), 3));
      geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(normal), 3));
      geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uv), 2));
      geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(colour), 3));
      return new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
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
