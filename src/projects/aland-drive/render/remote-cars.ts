import { Quaternion, Vector3, type Node, type Scene } from "three/webgpu";
import { buildCarArt, carOnRoad, type CarArt, type CarLights } from "../art/cars/model";
import { CARS } from "../art/cars/specs";
import { headingOf, type CarLamps, type CarState } from "../sim/car-state";
import type { CarId } from "../sim/cars";
import { type Sun } from "../art/sun";
import type { CarAtNight } from "../art/night";

/*
 * Other players' cars, drawn with the same art as the car being driven, one
 * set of geometry per kind of car however many drive it. A car is drawn only
 * on ground that has its detail here: its height is its own client's, from
 * that client's detailed ground, and on coarser ground it would float or sink.
 * Further off it is a marker on the maps.
 */

type View = ReturnType<typeof carOnRoad>;

/** A car's lamps as its art lights them. */
export const lightsOf = ({ head, brake, reverse }: CarLamps): CarLights => ({ headlights: head, brake, reversing: reverse });

export function createRemoteCarViews(scene: Scene, sun: Sun, hazed: (color: Node<"vec3">) => Node<"vec3">) {
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

  const turn = new Quaternion();
  const spot = new Vector3();
  /** A point in the car's own frame, where it is in the world. */
  const placed = ({ position, rotation }: CarState, [x, y, z]: readonly number[], side: 1 | -1) => {
    spot.set(x * side, y, z).applyQuaternion(turn.set(...rotation));
    return [spot.x + position[0], spot.y + position[1], spot.z + position[2]] as const;
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
        shown = { car, view: carOnRoad(scene, sun, artFor(car), { hazed }) };
        views.set(id, shown);
      }
      shown.view.draw(state);
      shown.view.setLights(lightsOf(state.lamps));
    },
    /** Where a car's lamps are, from its own art, and the way it faces. */
    atNight(state: CarState): CarAtNight {
      const { head, tail } = artFor(state.car).lamps;
      const heading = headingOf(state.rotation);
      return {
        head: [placed(state, head, -1), placed(state, head, 1)],
        tail: [placed(state, tail, -1), placed(state, tail, 1)],
        forwardX: -Math.sin(heading),
        forwardZ: -Math.cos(heading),
        braking: state.lamps.brake,
      };
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
