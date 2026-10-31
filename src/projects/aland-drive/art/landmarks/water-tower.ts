import { createBuilder, flat, type MeshBuilder } from "./kit";
import type { Landmark } from "./landmark";

/*
 * Mariehamn's water tower on Badhusberget, which the 3D data has no building for: an ochre drum on a ring of white
 * blade columns, with a white band and a ribbon of windows on top. The drum's rim is cut down on the south, the side of
 * the viewing pad, so the band stands in front of it there. Heights are the laser's, the proportions between them the photos'.
 */

const RADIUS = 6;
const COLUMNS_TOP = 3.05;
const RIM = 15.7;
const CUT_RIM = 14;
const BAND_RADIUS = 5.55;
const BAND_TOP = 17.2;
const GLASS_TOP = 18.7;
const ROOF_TOP = 19.2;
const BLADES = 12;
const BLADE = { deep: 1.05, wide: 0.78 };
const MULLIONS = 16;
/** +z is south, and angles run from +x towards +z. */
const SOUTH_RAD = Math.PI / 2;
const CUT_HALF_RAD = 1.25;
const BAND_OFFSET_SOUTH = 0.25;

function drum(mesh: MeshBuilder, sides: number) {
  const ochre = flat("tower-ochre");
  const rimLip = flat("tower-white", 0.8);
  const rimAt = (angle: number) => (Math.abs(Math.atan2(Math.sin(angle - SOUTH_RAD), Math.cos(angle - SOUTH_RAD))) < CUT_HALF_RAD ? CUT_RIM : RIM);
  const at = (angle: number, radius: number, y: number) => [radius * Math.cos(angle), y, radius * Math.sin(angle)] as const;
  for (let side = 0; side < sides; side++) {
    const a = (side * Math.PI * 2) / sides;
    const b = ((side + 1) * Math.PI * 2) / sides;
    const rim = rimAt((a + b) / 2);
    mesh.quad(at(a, RADIUS, COLUMNS_TOP), at(b, RADIUS, COLUMNS_TOP), at(b, RADIUS, rim), at(a, RADIUS, rim), ochre);
    mesh.quad(at(a, RADIUS, rim), at(b, RADIUS, rim), at(b, BAND_RADIUS - 0.1, rim + 0.15), at(a, BAND_RADIUS - 0.1, rim + 0.15), rimLip);
  }
}

function cabin(mesh: MeshBuilder, sides: number) {
  const white = flat("tower-white");
  const centre = [0, BAND_OFFSET_SOUTH] as const;
  mesh.lathe(centre, [[BAND_RADIUS, CUT_RIM - 0.25], [BAND_RADIUS, BAND_TOP], [BAND_RADIUS - 0.3, BAND_TOP]], sides, white);
  const glassRadius = BAND_RADIUS - 0.3;
  mesh.lathe(centre, [[glassRadius, BAND_TOP], [glassRadius, GLASS_TOP]], sides, flat("glass-sky"));
  for (let mullion = 0; mullion < MULLIONS; mullion++) {
    const angle = (mullion * Math.PI * 2) / MULLIONS;
    mesh.box([glassRadius * Math.cos(angle) * 1.01, (BAND_TOP + GLASS_TOP) / 2, BAND_OFFSET_SOUTH + glassRadius * Math.sin(angle) * 1.01], [0.2, GLASS_TOP - BAND_TOP, 0.18], white, angle);
  }
  mesh.lathe(centre, [[glassRadius + 0.4, GLASS_TOP], [glassRadius + 0.4, GLASS_TOP + 0.12], [glassRadius * 0.55, ROOF_TOP - 0.1], [0, ROOF_TOP]], sides, flat("tower-roof"));
}

function blades(mesh: MeshBuilder) {
  const white = flat("tower-white");
  for (let blade = 0; blade < BLADES; blade++) {
    const angle = ((blade + 0.5) * Math.PI * 2) / BLADES;
    const distance = RADIUS - BLADE.deep / 2 - 0.06;
    mesh.box([distance * Math.cos(angle), (COLUMNS_TOP - 1) / 2, distance * Math.sin(angle)], [BLADE.deep, COLUMNS_TOP + 1, BLADE.wide], white, angle);
  }
}

function underside(mesh: MeshBuilder) {
  mesh.lathe([0, 0], [[4.3, -1], [4.3, COLUMNS_TOP]], 16, flat("tower-core"));
  mesh.lathe([0, 0], [[RADIUS, COLUMNS_TOP], [0, COLUMNS_TOP]], 24, flat("tower-white", 0.75));
  mesh.lathe([0, 0], [[RADIUS + 0.06, COLUMNS_TOP - 0.08], [RADIUS + 0.06, COLUMNS_TOP + 0.08]], 36, flat("tower-white"));
  mesh.box([0, 1.25, 4.33], [1.5, 2.5, 0.06], flat("tower-white"));
  mesh.box([0, 1.15, 4.37], [1.1, 2.3, 0.06], flat("glass"));
}

export function buildWaterTower(): Landmark {
  const near = createBuilder();
  drum(near, 36);
  cabin(near, 30);
  blades(near);
  underside(near);

  const far = createBuilder();
  far.lathe([0, 0], [[RADIUS, 0], [RADIUS, RIM]], 10, flat("tower-ochre"));
  far.lathe([0, 0], [[BAND_RADIUS, RIM], [BAND_RADIUS, BAND_TOP], [BAND_RADIUS, GLASS_TOP], [0, ROOF_TOP]], 10, [flat("tower-white"), flat("glass"), flat("tower-roof")]);

  return { id: "water-tower", name: "Mariehamns vattentorn", east: 107115.5, north: 6683723, baseM: 40.76, near: near.done(), far: far.done(), farFromM: 700 };
}
