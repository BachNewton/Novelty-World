import type { TileManifest } from "./tile";

/*
 * Reading a tile's buildings (`pipeline/buildings.py` writes them): a mesh for
 * each 600 m cell, merged so a block of town is one draw call, and the outlines
 * the car can't pass. A vertex carries where it is on its facade, so the wall
 * shader can lay its windows out by the real size of that wall.
 */

/** One 600 m cell's merged buildings, in scene space. */
export interface SolidsCell {
  x: number;
  z: number;
  positions: Float32Array;
  /** (along the facade, above the building's ground, the facade's width, its eaves), metres. */
  facades: Float32Array;
  /** On a roof its photo's colour. On a wall (palette colour, door here, shade, style); alpha is the style on both. */
  tints: Uint8Array;
  indices: Uint16Array;
}

export interface Solids {
  cells: SolidsCell[];
  /** Four numbers each: x and z at both ends. */
  walls: Float32Array;
}

const INT16_COLUMNS = 7;

export function decodeSolids(data: ArrayBuffer, solids: TileManifest["solids"]): Solids {
  const bytes = new Uint8Array(data);
  const { unitM } = solids;
  let at = 0;
  const cells = solids.cells.map(({ x, z, vertices, indices }) => {
    const columns = Array.from({ length: INT16_COLUMNS }, () => {
      const deltas = new DataView(data, at, vertices * 2);
      at += vertices * 2;
      const running = new Int16Array(vertices);
      let value = 0;
      for (let vertex = 0; vertex < vertices; vertex++) {
        value += deltas.getInt16(vertex * 2, true);
        running[vertex] = value;
      }
      return running;
    });
    const positions = new Float32Array(vertices * 3);
    const facades = new Float32Array(vertices * 4);
    const tints = new Uint8Array(vertices * 4);
    for (let vertex = 0; vertex < vertices; vertex++) {
      positions[vertex * 3] = x + columns[0][vertex] * unitM;
      positions[vertex * 3 + 1] = columns[1][vertex] * unitM;
      positions[vertex * 3 + 2] = z + columns[2][vertex] * unitM;
      for (let part = 0; part < 4; part++) {
        facades[vertex * 4 + part] = columns[3 + part][vertex] * unitM;
        tints[vertex * 4 + part] = bytes[at + part * vertices + vertex];
      }
    }
    at += vertices * 4;
    const kept = new Uint16Array(indices);
    new Uint8Array(kept.buffer).set(bytes.subarray(at, at + indices * 2));
    at += indices * 2;
    return { x, z, positions, facades, tints, indices: kept };
  });
  const walls = new Float32Array(solids.walls * 4);
  new Uint8Array(walls.buffer).set(bytes.subarray(at, at + walls.byteLength));
  at += walls.byteLength;
  if (at !== data.byteLength) throw new Error(`buildings: ${data.byteLength} bytes, expected ${at}`);
  return { cells, walls };
}
