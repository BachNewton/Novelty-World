import { BufferAttribute, BufferGeometry } from "three";

/**
 * One model as its kit's gallery shows it, with every geometry it draws by name: a near and far version, or a car's
 * body and wheels. Geometries listed together are drawn in one place, as a car's body and its glass are, and checked
 * as one. Each kit's `catalogue.ts` exports `artModels()`, a list of these, which the checks over every kit find on
 * their own.
 */
export interface ArtModel {
  name: string;
  geometries: Record<string, BufferGeometry | readonly BufferGeometry[] | null>;
  /** The ground or water it stands on, in its own metres, which no camera is under: 0 unless given. Null for a room, seen from inside. */
  groundY?: number | null;
  /**
   * How the game lays it end to end along its +x, if it does: each the next `alongM` further on in its own metres (its
   * length unless given), and where it `flips`, every other one turned end for end.
   */
  laid?: { alongM?: number; flips?: boolean };
  /** False for what isn't stood on the ground at `groundY`: a part in its own pivot's frame, a box hung on a wall. */
  onGround?: boolean;
}

/** A model with a near and far version, as most kits build them. */
export const nearFar = (name: string, { near, far }: { near: BufferGeometry; far: BufferGeometry | null }): ArtModel => ({ name, geometries: { near, far } });

/**
 * A model whose parts each move on a pivot of their own, a bike's wheels or a rider's arm, split into one geometry per
 * part: its vertices sit in each part's own frame, so only faces of one part can be compared.
 */
export function rigidParts(name: string, geometry: BufferGeometry, partOf: (vertex: number) => number): Record<string, BufferGeometry> {
  const position = geometry.getAttribute("position");
  const indices = geometry.index?.array ?? Array.from({ length: position.count }, (_, index) => index);
  const byPart = new Map<number, number[]>();
  for (let first = 0; first < indices.length; first += 3) {
    const part = partOf(indices[first]);
    const kept = byPart.get(part) ?? [];
    kept.push(indices[first], indices[first + 1], indices[first + 2]);
    byPart.set(part, kept);
  }
  return Object.fromEntries(
    [...byPart].map(([part, kept]) => {
      const piece = new BufferGeometry();
      for (const [attribute, values] of Object.entries(geometry.attributes)) piece.setAttribute(attribute, values as BufferAttribute);
      piece.setIndex(kept);
      return [`${name} part ${part}`, piece];
    }),
  );
}

