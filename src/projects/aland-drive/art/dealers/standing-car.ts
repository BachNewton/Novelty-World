import { Mesh, type BufferGeometry, type Material, type Node } from "three/webgpu";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CarId } from "../../sim/cars";
import type { CarDetail } from "../cars/build";
import { buildCarArt, createCarModel } from "../cars/model";
import type { Sun } from "../sun";
import { carSpecOf, restingCar } from "./index";

/*
 * A car on a forecourt: the drivable car's own art standing still at its origin, nose to -z, its body and wheels merged
 * into one mesh and its glass into another, so a car standing for sale is two draws near and one far rather than the
 * ten a driven car's moving parts take. Every car of a kind has the same geometry, so its swap is measured once.
 */

export function standingCar(car: CarId, detail: CarDetail, sun: Sun, hazed: (color: Node<"vec3">) => Node<"vec3">, paint?: string): Mesh[] {
  const art = buildCarArt(carSpecOf(car), detail);
  const model = createCarModel(art, sun, { hazed, ...(paint === undefined ? {} : { paint: { colour: paint, finish: "solid" } }) });
  model.draw(restingCar(art.spec, [0, 0, 0], 0));
  model.root.updateMatrixWorld(true);
  const byMaterial = new Map<Material, BufferGeometry[]>();
  model.root.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    const material = child.material as Material;
    byMaterial.set(material, [...(byMaterial.get(material) ?? []), (child.geometry as BufferGeometry).clone().applyMatrix4(child.matrixWorld)]);
  });
  art.dispose();
  return [...byMaterial].map(([material, parts]) => {
    const merged = mergeGeometries(parts);
    for (const part of parts) part.dispose();
    return new Mesh(merged, material);
  });
}
