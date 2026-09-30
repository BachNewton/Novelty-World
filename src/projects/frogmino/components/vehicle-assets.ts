import {
  BoxGeometry,
  CylinderGeometry,
  DataTexture,
  LinearMipmapLinearFilter,
  MeshLambertMaterial,
  NearestFilter,
  RGBAFormat,
  type BufferGeometry,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { themeColor } from "@/shared/lib/three/theme-color";
import { PAINTS, paintToken, type Paint, type Part } from "../vehicles/parts";

// Body cells carry the same darker inset border as the walls and the frog, so
// the cells still count where they touch. A body cell is a box stretched
// along the road, so only its front and back get a border all round; its
// sides and top get a border only along the edges that run down the road,
// the seams between cells, which would otherwise stretch with the length.
const CELL_TEXTURE_SIZE = 16;
const CELL_BORDER_TEXELS = 1;
const CELL_BORDER_SHADE = 0.4;

// Which edges of a face get the border: all four, only those along its rows,
// or only those along its columns.
export type BorderEdges = "all" | "rows" | "cols";

export function borderMask(edges: BorderEdges): DataTexture {
  const size = CELL_TEXTURE_SIZE;
  const last = size - 1;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nearU = Math.min(x, last - x) < CELL_BORDER_TEXELS;
      const nearV = Math.min(y, last - y) < CELL_BORDER_TEXELS;
      const edge = edges === "all" ? nearU || nearV : edges === "rows" ? nearV : nearU;
      const value = Math.round((edge ? CELL_BORDER_SHADE : 1) * 255);
      data.set([value, value, value, 255], (y * size + x) * 4);
    }
  }
  const texture = new DataTexture(data, size, size, RGBAFormat);
  texture.magFilter = NearestFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

const DRUM_SEGMENTS = 20;

export function makeVehicleAssets() {
  const masks = { all: borderMask("all"), rows: borderMask("rows"), cols: borderMask("cols") };
  const colors = Object.fromEntries(PAINTS.map((paint) => [paint, themeColor(paintToken(paint))]));
  // Plain lit, as the game scene's walls and frog are.
  const material = (paint: Paint, map?: DataTexture): MeshLambertMaterial =>
    new MeshLambertMaterial({ color: colors[paint], map: map ?? null });

  // A box's faces in order: +x, -x, +y, -y, +z, -z. The sides' texture v runs
  // up the rows and the top's u across the lanes.
  const body = Object.fromEntries(
    PAINTS.map((paint) => {
      const [rows, cols, all] = [material(paint, masks.rows), material(paint, masks.cols), material(paint, masks.all)];
      return [paint, [rows, rows, cols, cols, all, all]];
    }),
  ) as Record<Paint, MeshLambertMaterial[]>;
  const parts = Object.fromEntries(PAINTS.map((paint) => [paint, material(paint)])) as Record<
    Paint,
    MeshLambertMaterial
  >;

  const cube = new BoxGeometry(1, 1, 1);
  return {
    cube,
    body,
    parts,
    dispose() {
      cube.dispose();
      Object.values(masks).forEach((mask) => {
        mask.dispose();
      });
      Object.values(body).forEach((faces) => {
        new Set(faces).forEach((face) => {
          face.dispose();
        });
      });
      Object.values(parts).forEach((part) => {
        part.dispose();
      });
    },
  };
}

export type VehicleAssets = ReturnType<typeof makeVehicleAssets>;

function partGeometry(part: Part): BufferGeometry {
  const geometry = part.shape === "box" ? new BoxGeometry(1, 1, 1) : new CylinderGeometry(0.5, 0.5, 1, DRUM_SEGMENTS);
  // A cylinder's axis runs along y; turn it onto the drum's axis.
  if (part.shape === "drumX") geometry.rotateZ(Math.PI / 2);
  if (part.shape === "drumZ") geometry.rotateX(Math.PI / 2);
  const [x0, y0, z0] = part.min;
  const [x1, y1, z1] = part.max;
  geometry.scale(x1 - x0, y1 - y0, z1 - z0);
  geometry.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return geometry;
}

// A vehicle's parts merged into one geometry per paint, so a vehicle draws in
// a handful of calls however many details it has.
export function mergedParts(parts: readonly Part[]): { paint: Paint; geometry: BufferGeometry }[] {
  const byPaint = new Map<Paint, BufferGeometry[]>();
  for (const part of parts) {
    const list = byPaint.get(part.paint) ?? [];
    list.push(partGeometry(part));
    byPaint.set(part.paint, list);
  }
  return [...byPaint].map(([paint, geometries]) => {
    const merged = mergeGeometries(geometries);
    geometries.forEach((geometry) => {
      geometry.dispose();
    });
    return { paint, geometry: merged };
  });
}
