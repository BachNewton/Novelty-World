import { VEHICLE_IDS, VEHICLE_LENGTHS, vehicleCells, type VehicleId } from "../fleet";
import type { Cell } from "../types";
import { I_VEHICLES } from "./i";
import { J_VEHICLES } from "./j";
import { L_VEHICLES } from "./l";
import { O_VEHICLES } from "./o";
import { vehicleFrame, type Paint, type Part, type Vec3, type VehicleDesign } from "./parts";
import { S_VEHICLES } from "./s";
import { T_VEHICLES } from "./t";
import { Z_VEHICLES } from "./z";

const DESIGNS: Record<VehicleId, VehicleDesign> = {
  ...I_VEHICLES,
  ...O_VEHICLES,
  ...S_VEHICLES,
  ...Z_VEHICLES,
  ...T_VEHICLES,
  ...J_VEHICLES,
  ...L_VEHICLES,
};

// A vehicle's design and how long it is, which the fleet sets for the rules.
export interface FleetVehicle extends VehicleDesign {
  length: number;
}

export const VEHICLES = Object.fromEntries(
  VEHICLE_IDS.map((id) => [id, { ...DESIGNS[id], length: VEHICLE_LENGTHS[id] }]),
) as Record<VehicleId, FleetVehicle>;

// A body cell, and the solid box it fills in the vehicle's frame.
export interface BodyCell {
  cell: Cell;
  paint: Paint;
  min: Vec3;
  max: Vec3;
}

// Everything needed to draw one vehicle, in its own frame (see parts.ts).
export interface VehicleModel {
  id: VehicleId;
  design: FleetVehicle;
  cells: Cell[];
  length: number;
  body: BodyCell[];
  parts: Part[];
}

export function vehicleModel(id: VehicleId): VehicleModel {
  const design = VEHICLES[id];
  const cells = vehicleCells(id);
  const frame = vehicleFrame(cells, design.length);
  return {
    id,
    design,
    cells,
    length: design.length,
    body: cells.map((cell) => ({ cell, paint: design.body(cell), ...frame.bodyBox(cell) })),
    parts: design.details(frame),
  };
}
