import { vehicleCells, type VehicleId } from "../fleet";
import type { Cell } from "../types";
import { I_VEHICLES } from "./i";
import { J_VEHICLES } from "./j";
import { L_VEHICLES } from "./l";
import { O_VEHICLES } from "./o";
import { vehicleFrame, type Paint, type Part, type VehicleDesign } from "./parts";
import { S_VEHICLES } from "./s";
import { T_VEHICLES } from "./t";
import { Z_VEHICLES } from "./z";

export const VEHICLES: Record<VehicleId, VehicleDesign> = {
  ...I_VEHICLES,
  ...O_VEHICLES,
  ...S_VEHICLES,
  ...Z_VEHICLES,
  ...T_VEHICLES,
  ...J_VEHICLES,
  ...L_VEHICLES,
};

export interface BodyCell {
  cell: Cell;
  paint: Paint;
}

// Everything needed to draw one vehicle, in its own frame (see parts.ts).
export interface VehicleModel {
  id: VehicleId;
  design: VehicleDesign;
  cells: Cell[];
  length: number;
  body: BodyCell[];
  parts: Part[];
}

export function vehicleModel(id: VehicleId): VehicleModel {
  const design = VEHICLES[id];
  const cells = vehicleCells(id);
  return {
    id,
    design,
    cells,
    length: design.length,
    body: cells.map((cell) => ({ cell, paint: design.body(cell) })),
    parts: design.details(vehicleFrame(cells, design.length)),
  };
}
