import type { Scene } from "three/webgpu";
import { buildCarArt, carOnRoad, type CarArt } from "../art/cars/model";
import { CARS } from "../art/cars/specs";
import type { CarState } from "../sim/car-state";
import type { CarId } from "../sim/cars";

/*
 * Other players' cars, drawn with the same art as the car being driven, one
 * set of geometry per kind of car however many drive it. A car is drawn only
 * on ground that has its detail here: its height is its own client's, from
 * that client's detailed ground, and on coarser ground it would float or sink.
 * Further off it is a marker on the maps.
 */

type View = ReturnType<typeof carOnRoad>;

export function createRemoteCarViews(scene: Scene, sun: { azimuthDeg: number; elevationDeg: number }) {
  const arts = new Map<CarId, CarArt>();
  const views = new Map<string, { car: CarId; view: View }>();

  const artFor = (car: CarId) => {
    let art = arts.get(car);
    if (!art) {
      const spec = CARS.find((candidate) => candidate.id === car);
      if (!spec) throw new Error(`no art for the car ${car}`);
      art = buildCarArt(spec);
      arts.set(car, art);
    }
    return art;
  };

  const forget = (id: string) => {
    views.get(id)?.view.dispose();
    views.delete(id);
  };

  return {
    /** Draws a car this frame, or leaves it out when its ground isn't here. */
    draw(id: string, state: CarState, grounded: boolean) {
      const { car } = state;
      let shown = views.get(id);
      if (shown && shown.car !== car) {
        forget(id);
        shown = undefined;
      }
      if (!grounded) {
        if (shown) forget(id);
        return;
      }
      if (!shown) {
        shown = { car, view: carOnRoad(scene, sun, artFor(car)) };
        views.set(id, shown);
      }
      shown.view.draw(state);
    },
    /** Whether a car was drawn on the last frame. */
    drawn: (id: string) => views.has(id),
    forget,
    dispose() {
      for (const id of [...views.keys()]) forget(id);
      for (const art of arts.values()) art.dispose();
      arts.clear();
    },
  };
}
