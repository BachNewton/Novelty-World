// The dark outline around a shape of touching unit cubes is an inverted hull:
// a slightly larger copy of the whole shape, drawn inside out, so only a rim
// of it shows around the silhouette.
//
// It has to be the hull of the whole shape. A slightly larger copy of each
// cube pokes into its neighbours: at every seam, a neighbour's copy stands
// out of the shape's faces as a thin dark ledge or fin, visible or hidden
// depending on which way the seam runs and which side of it the camera is.
// That made the cells' borders look thicker on some seams than on others,
// and change when the frog turned.

// The middle of a unit cube.
export interface CubeSpot {
  x: number;
  y: number;
  z: number;
}

type Axis = 0 | 1 | 2;
type Range = [min: number, max: number];

// One axis-aligned rectangle of the hull: it lies in the plane where the
// `axis` coordinate is `plane`, faces outward toward `sign`, and spans `u`
// and `v` on the next two axes in turn (y and z for x, z and x for y, x and y
// for z).
export interface HullFace {
  axis: Axis;
  sign: 1 | -1;
  plane: number;
  u: Range;
  v: Range;
}

const AXES: readonly Axis[] = [0, 1, 2];

function coords(spot: CubeSpot): [number, number, number] {
  return [spot.x, spot.y, spot.z];
}

function spotKey([x, y, z]: readonly number[]): string {
  return `${String(x)},${String(y)},${String(z)}`;
}

// Each cube's own share of the hull: a box grown by `width` only on the sides
// with no neighbouring cube, with a face only on those sides. The shares meet
// edge to edge, so together they wrap the whole shape and nothing lies inside
// a cube.
export function outlineHull(spots: readonly CubeSpot[], width: number): HullFace[] {
  const filled = new Set(spots.map((spot) => spotKey(coords(spot))));
  const open = (at: readonly number[], axis: Axis, sign: 1 | -1): boolean =>
    !filled.has(spotKey(at.map((c, i) => (i === axis ? c + sign : c))));

  return spots.flatMap((spot) => {
    const at = coords(spot);
    const box = AXES.map((axis): Range => [
      at[axis] - 0.5 - (open(at, axis, -1) ? width : 0),
      at[axis] + 0.5 + (open(at, axis, 1) ? width : 0),
    ]);
    return AXES.flatMap((axis) =>
      ([-1, 1] as const)
        .filter((sign) => open(at, axis, sign))
        .map(
          (sign): HullFace => ({
            axis,
            sign,
            plane: box[axis][sign === 1 ? 1 : 0],
            u: box[(axis + 1) % 3],
            v: box[(axis + 2) % 3],
          }),
        ),
    );
  });
}

// The faces as triangles, xyz after xyz, wound counter-clockwise as seen from
// outside, so drawing only their back sides turns the hull inside out.
export function hullTriangles(faces: readonly HullFace[]): Float32Array {
  const positions = new Float32Array(faces.length * 18);
  faces.forEach((face, f) => {
    const corner = (u: number, v: number): number[] => {
      const point = [0, 0, 0];
      point[face.axis] = face.plane;
      point[(face.axis + 1) % 3] = u;
      point[(face.axis + 2) % 3] = v;
      return point;
    };
    const [u0, u1] = face.u;
    const [v0, v1] = face.v;
    const quad = [corner(u0, v0), corner(u1, v0), corner(u1, v1), corner(u0, v1)];
    if (face.sign === -1) quad.reverse();
    positions.set([0, 1, 2, 0, 2, 3].flatMap((i) => quad[i]), f * 18);
  });
  return positions;
}
