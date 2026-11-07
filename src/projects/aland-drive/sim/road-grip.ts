import { CLASS, type SurfaceClass } from "../art/town-ground/class";
import type { RoadAttributes } from "../art/surfaces/road-attributes";
import type { RibbonMesh } from "../render/roads";
import CARRIAGEWAY from "../render/carriageway.json";
import { SURFACES, type Surface } from "./surfaces";

/*
 * What a tyre on a road triangle is on: what the triangle is drawn as. A motor
 * road's shoulder is the loose verge in the country, and on a sealed street in
 * town its kerb and paving, hard ground, whatever class its points carry: the
 * road draws a shoulder over a class, as it does a junction's corner that took a
 * sidewalk's class from the nearest way. Elsewhere a way's own surface (a path's
 * gravel, a sidewalk's slabs, a street's setts) is what its class says, and a
 * motor road's carriageway is its asphalt or gravel. Slabs, setts and steps grip
 * as asphalt.
 */

/** Past this across a way is its shoulder. The carriageway's edge is 1, and the paving stores its points there up to a couple of hundredths past it: the outline is kept within 2 cm, over a shoulder of a metre or so, and across is rounded to 1/1024. `pipeline/roadside.py` reads the same edge. */
const CARRIAGEWAY_EDGE_ACROSS = CARRIAGEWAY.edgeAcross;

const CLASS_SURFACES: Record<SurfaceClass, Surface | null> = {
  [CLASS.none]: null,
  [CLASS.steps]: "asphalt",
  [CLASS.bed]: "grass",
  [CLASS.lawn]: "grass",
  [CLASS.gravel]: "gravel",
  [CLASS.slab]: "asphalt",
  [CLASS.tarmac]: "asphalt",
  [CLASS.cobble]: "asphalt",
};

/**
 * A byte per ribbon triangle, in the order of its indices, as an index into `SURFACES`. A triangle is read at its middle,
 * as its look blends there: a class by each of its bits, the dress by its average. It's on the carriageway only when none
 * of its corners is past the edge, since a kerb's strip is a thin triangle with two corners on the edge.
 * `classes` is a class per vertex of the ribbon, none where a vertex has none of its own.
 */
export function roadGrip(ribbon: RibbonMesh, dress: RoadAttributes, classes: Uint8Array): Uint8Array {
  const { indices, across } = ribbon;
  const surfaces = new Uint8Array(indices.length / 3);
  const index = (surface: Surface) => SURFACES.indexOf(surface);
  for (let triangle = 0; triangle < surfaces.length; triangle++) {
    let [bits, sealed, town] = [0, 0, 0];
    let shoulder = false;
    for (let bit = 1; bit <= 0b100; bit <<= 1) {
      let set = 0;
      for (let corner = 0; corner < 3; corner++) set += classes[indices[triangle * 3 + corner]] & bit ? 1 : 0;
      if (set >= 2) bits |= bit;
    }
    for (let corner = 0; corner < 3; corner++) {
      const vertex = indices[triangle * 3 + corner];
      sealed += dress.surface[vertex * 4] / 3;
      town += dress.surface[vertex * 4 + 1] / 3;
      shoulder ||= Math.abs(across[vertex]) > CARRIAGEWAY_EDGE_ACROSS;
    }
    const own = CLASS_SURFACES[bits as SurfaceClass];
    if (shoulder) surfaces[triangle] = index(sealed > 0.5 && town > 0.5 ? "asphalt" : "gravel");
    else if (own) surfaces[triangle] = index(own);
    else surfaces[triangle] = index(sealed > 0.5 ? "asphalt" : "gravel");
  }
  return surfaces;
}

/** A class per vertex of a tile's ribbon: the paving's points carry their own, and nothing else has one. */
export function ribbonClasses(vertices: number, paving: { firstPoint: number; classes: Uint8Array }): Uint8Array {
  const classes = new Uint8Array(vertices);
  classes.set(paving.classes, paving.firstPoint);
  return classes;
}
