import * as THREE from "three";
import { chain, ring, rod, roundBox, sculpt, type Solid } from "../forms";
import { figureParts } from "../figure-parts";
import { SHINES } from "../shine";
import { assembled, itemModel, piece, type PlatePose } from "./item";

/*
 * The Medical Kit (item): a country doctor's bag, tan leather, wide at its
 * foot and narrowing to a brass frame along its top, two dark straps round
 * it, carried by its leather handle. It reads by the bag's shape, the one
 * thing carried at the side by a handle, the bright frame along its top,
 * apart from the boxes and jars. Carried hanging, the bag beside the leg;
 * on the floor it stands on its foot.
 *
 * Built standing (up +y, its length along x, its depth along z, its
 * handle's middle at the origin), then turned into the grip's frame for a
 * hanging carry: the handle along the grip's axis, the bag below the fist
 * (+z).
 */

/** The bag's top and foot below the handle, its half-length and half-depth at its foot and at its top, and how round. */
const BAG = { top: -0.058, foot: -0.228, long: [0.122, 0.11], deep: [0.05, 0.025], round: 0.017 };
/** The handle: its radius in the fist, and where its ends meet the frame. */
const HANDLE = { radius: 0.0105, end: 0.052 };
/** The straps' places along the bag. */
const STRAPS = [-0.07, 0.07];

/** On the floor the bag stands on its foot: the grip's frame turned so the bag, hanging along +z below the handle, is down. */
const ON_ITS_FOOT: PlatePose = { lie: new THREE.Euler(Math.PI / 2, 0, 0), spin: 0.7 };

/** From the standing build into the grip's frame: its x along the grip's axis, its up out of the fist's bottom (the bag hangs along +z). */
const HANG = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0));

/** How far along the bag's height a point is, 0 at its foot and 1 at its top. */
const upTheBag = (y: number) => THREE.MathUtils.clamp((y - BAG.foot) / (BAG.top - BAG.foot), 0, 1);

/** The bag's body: a rounded box narrowing from its foot to its top (a close bound). */
function body(): Solid {
  const middle = (BAG.top + BAG.foot) / 2;
  const tall = (BAG.top - BAG.foot) / 2;
  return {
    distance: (x, y, z) => {
      const t = upTheBag(y);
      const long = THREE.MathUtils.lerp(BAG.long[0], BAG.long[1], t);
      const deep = THREE.MathUtils.lerp(BAG.deep[0], BAG.deep[1], t * t);
      const r = BAG.round;
      const qx = Math.abs(x) - long + r;
      const qy = Math.abs(y - middle) - tall + r;
      const qz = Math.abs(z) - deep + r;
      return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
    },
    min: [-BAG.long[0], BAG.foot, -BAG.deep[0]],
    max: [BAG.long[0], BAG.top, BAG.deep[0]],
  };
}

/** The leather: the body with its straps darker round it, and the handle arching over the frame. */
function leatherGeometry(): THREE.BufferGeometry {
  return sculpt()
    .add(body(), "woodLight")
    .paint((x) => Math.min(...STRAPS.map((at) => Math.abs(x - at))) - 0.008, "woodDark")
    .geometry(0.0032);
}

function handleGeometry(): THREE.BufferGeometry {
  const { radius, end } = HANDLE;
  const points: [number, number, number][] = [
    [-end, BAG.top + 0.002, 0],
    [-end * 0.92, -0.022, 0],
    [-end * 0.55, -0.002, 0],
    [0, 0, 0],
    [end * 0.55, -0.002, 0],
    [end * 0.92, -0.022, 0],
    [end, BAG.top + 0.002, 0],
  ];
  return sculpt()
    .add(chain(points, [0.0075, 0.0085, radius, radius, radius, 0.0085, 0.0075]), "woodMid")
    .geometry(0.0018);
}

/** The brass: the frame's two rails along the top, its ends, the clasp at its middle, and the rings the handle hangs from. */
function brassGeometry(): THREE.BufferGeometry {
  const { top, long } = BAG;
  const rail = BAG.deep[1] - 0.003;
  const shape = sculpt();
  for (const side of [-1, 1]) shape.add(rod([-long[1] + 0.012, top, side * rail], [long[1] - 0.012, top, side * rail], 0.0048), "brass", 0.003);
  for (const end of [-1, 1]) shape.add(roundBox([end * (long[1] - 0.012), top, 0], [0.006, 0.006, rail + 0.004], 0.004), "brass", 0.004);
  shape.add(roundBox([0, top - 0.006, rail + 0.004], [0.012, 0.009, 0.004], 0.003), "brass", 0.003);
  for (const end of [-1, 1]) shape.add(ring([end * HANDLE.end, top + 0.004, 0], 0.009, 0.0028, [Math.PI / 2, 0, 0]), "brass", 0.002);
  return shape.geometry(0.0014);
}

const PARTS = figureParts("item:medical-kit", () => ({ leather: leatherGeometry(), handle: handleGeometry(), brass: brassGeometry() }));

/** A part of the bag turned into the grip's frame. */
function hung(mesh: THREE.Mesh): THREE.Mesh {
  mesh.quaternion.setFromRotationMatrix(HANG);
  return mesh;
}

const inGrip = (x: number, y: number, z: number): THREE.Vector3Tuple => new THREE.Vector3(x, y, z).applyMatrix4(HANG).toArray();

function medicalKit(): THREE.Group {
  const parts = PARTS.get();
  const leather = hung(piece(parts.leather, "medical kit"));
  const handle = hung(piece(parts.handle, "medical kit handle"));
  const brass = hung(piece(parts.brass, "medical kit frame", SHINES.brass));
  return assembled("medical kit", [leather, handle, brass], [
    { between: [leather, brass], at: inGrip(0, BAG.top, 0), radius: BAG.long[1] + 0.02 },
    ...[-1, 1].map((end) => ({ between: [handle, brass] as [THREE.Mesh, THREE.Mesh], at: inGrip(end * HANDLE.end, BAG.top + 0.004, 0), radius: 0.02 })),
    ...[-1, 1].map((end) => ({ between: [handle, leather] as [THREE.Mesh, THREE.Mesh], at: inGrip(end * HANDLE.end, BAG.top, 0), radius: 0.02 })),
  ]);
}

export const MEDICAL_KIT = itemModel({
  card: "medical-kit",
  parts: [PARTS],
  held: () => ({ object: medicalKit(), handle: HANDLE.radius, carry: "hang" }),
  plate: ON_ITS_FOOT,
});
