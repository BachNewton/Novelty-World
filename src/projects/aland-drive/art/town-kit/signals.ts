import type { V3 } from "../roadside/mesh";
import type { RoadsideModel } from "../roadside/models";
import { TownPainted, townModel, uprightRing, type TownPart } from "./paint";

/*
 * A traffic light on its own pole. Its head faces +z, at the traffic that stops for it; its lamps run on `time` in
 * `trafficLightMaterials`, so a junction costs nothing on the CPU. The back of the pole carries a walker's head for
 * whoever is crossing the other way.
 */

const SINK_M = 0.5;
const POLE_M = 3.5;
const LENS_R = 0.095;
const LENS_SIDES = 8;
const LAMP_GAP_M = 0.26;
const HEAD_WIDE_M = 0.27;
const HEAD_LOW_M = 2.3;
const HEAD_Z = 0.13;

const LAMPS: readonly TownPart[] = ["signal-green", "signal-amber", "signal-red"];

function head(into: TownPainted, hooded: boolean, sides: number): TownPainted {
  const high = HEAD_LOW_M + LAMP_GAP_M * LAMPS.length;
  const half = HEAD_WIDE_M / 2;
  into.box([-half, HEAD_LOW_M, HEAD_Z - 0.08], [half, high, HEAD_Z + 0.06], "signal-black", { shadeTop: 1.1 });
  // A backing board: what makes a lit lens read against a bright sky.
  into.face([[-half - 0.1, HEAD_LOW_M - 0.08, HEAD_Z - 0.081], [half + 0.1, HEAD_LOW_M - 0.08, HEAD_Z - 0.081], [half + 0.1, high + 0.08, HEAD_Z - 0.081], [-half - 0.1, high + 0.08, HEAD_Z - 0.081]], "signal-black", 1.25);
  LAMPS.forEach((lamp, index) => {
    const y = HEAD_LOW_M + LAMP_GAP_M * (index + 0.5);
    const z = HEAD_Z + 0.062;
    into.face(uprightRing([0, y, z], LENS_R, sides), lamp);
    if (!hooded) return;
    const [top, side, reach] = [y + LENS_R + 0.02, LENS_R + 0.025, 0.13];
    into
      .face([[-side, top, z], [side, top, z], [side * 0.85, top - 0.015, z + reach], [-side * 0.85, top - 0.015, z + reach]], "signal-black", 1.1)
      .face([[-side, top, z], [-side * 0.85, top - 0.015, z + reach], [-side * 0.85, top - 0.13, z + reach * 0.5], [-side, y - 0.02, z]], "signal-black", 0.8)
      .face([[side, top, z], [side * 0.85, top - 0.015, z + reach], [side * 0.85, top - 0.13, z + reach * 0.5], [side, y - 0.02, z]], "signal-black", 0.8);
  });
  return into;
}

function walkerHead(into: TownPainted): TownPainted {
  const z = -0.1;
  const half = 0.12;
  into.box([-half, 1.95, z - 0.1], [half, 2.55, z + 0.01], "signal-black");
  for (const [y, lamp] of [[2.39, "signal-stop"], [2.11, "signal-walk"]] as const) into.face(uprightRing([0, y, z - 0.102], 0.075, 6), lamp);
  return into;
}

/** A signal pole with one three-lamp head and a walker's head behind. */
export function buildTrafficLight(): RoadsideModel {
  const top: V3 = [0, POLE_M, 0];
  const near = new TownPainted()
    .tube([0, -SINK_M, 0], [0, 0.12, 0], 0.09, 6, { radiusTo: 0.075, shadeFrom: 0.85 }, "signal-black")
    .tube([0, 0.12, 0], top, 0.058, 6, { radiusTo: 0.05, cap: true }, "galvanised")
    .beam([0, HEAD_LOW_M + 0.2, 0], [0, HEAD_LOW_M + 0.2, HEAD_Z - 0.08], 0.05, 0.05, "signal-black")
    .box([-0.05, 1.05, 0.05], [0.05, 1.22, 0.12], "plate-yellow", { shadeTop: 1.1 });
  head(near, true, LENS_SIDES);
  walkerHead(near);
  const far = new TownPainted().tube([0, -SINK_M, 0], top, 0.09, 3, { radiusTo: 0.06 }, "galvanised");
  head(far, false, 4);
  return townModel(near, far, 70, 600);
}
