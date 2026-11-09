import { buildInterior, type Interior, type InteriorId } from "../art/dealers/interiors";
import type { V3 } from "../art/dealers/shell";
import type { DealerInterior, Door, Lamp, PlanOutline, Solid, Spot, Stock, Window } from "./interior";

/*
 * Today's three draft rooms, read into the interior definition, so the walk-in works before their art is rebuilt to it. What
 * a draft doesn't say (where its furniture stands on the plan, its openings, its door) is written here from its art.
 * Once a dealership's art returns a `DealerInterior` itself, its entry here goes, and this file with the last one.
 */

/** The draft material's light that every surface gets. */
const DRAFT_AMBIENT = 0.5;
const EYE_M = 1.6;

const STOCK: Readonly<Record<InteriorId, Stock>> = {
  "waterfront-showroom": { makers: ["Tärna", "Aurelle"], from: ["dealer"] },
  "town-dealer": { makers: ["Västan", "Ödmark", "Norrsken"], from: ["dealer"] },
  "village-garage": { makers: ["Klippa"] },
};

const rectangle = (x0: number, z0: number, x1: number, z1: number): PlanOutline => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const box = (x: number, z: number, hx: number, hz: number, yaw = 0): Solid => ({ kind: "box", centre: [x, z], half: [hx, hz], yaw });
const round = (x: number, z: number, radiusM: number): Solid => ({ kind: "round", centre: [x, z], radiusM });
/** A price stand (`priceStand`, `art/dealers/kit.ts`): what stops a body is its card, 0.56 m across and edge on at waist height. */
const stand = (x: number, z: number, yaw: number): Solid => box(x, z, 0.28, 0.06, yaw);
/** An upright pane along x at `z`, or along z at `x`. */
const paneAlongX = (x0: number, x1: number, z: number, y0: number, y1: number): Window => ({ corners: [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]] });

interface Extra {
  spots: readonly Spot[];
  solids: readonly Solid[];
  windows: readonly Window[];
  viewFrom: V3;
  door: Door;
}

function extras(id: InteriorId): Extra {
  switch (id) {
    case "village-garage":
      return {
        spots: [],
        solids: [
          box(-1.4, -8.45, 1.95, 0.35),
          box(-5, -8.5, 2.05, 0.4),
          round(-12.5, -8.5, 0.35),
          round(-11.8, -8.6, 0.35),
          round(-12.4, -1.2, 0.42),
          round(-12.4, -2, 0.42),
          box(-3.6, -0.8, 0.3, 0.2),
          // The office's half wall, the counter, the desk and the coffee table behind it.
          box(2.6, -5.2, 0.1, 3.8),
          box(5, -3, 1.2, 0.5, Math.PI / 2 + 0.25),
          box(4.8, -8.6, 0.9, 0.3),
          // The lift's posts, and the price stands.
          round(-3.02, -4.2, 0.28),
          round(0.22, -4.2, 0.28),
          stand(-3.2, -1.7, 0.2),
          stand(-6.1, -8.2, 0.2),
        ],
        windows: [paneAlongX(-11.6, -7.6, 0, 0, 3.4), paneAlongX(-5.6, -1.6, 0, 0, 3.4)],
        viewFrom: [-6.6, EYE_M, -0.6],
        door: { at: [-2.1, -0.7], yaw: 0.2, reachM: 1.4 },
      };
    case "town-dealer":
      return {
        spots: [
          { at: [-6.9, 0, -2.4], yaw: Math.PI / 2 },
          { at: [6.9, 0, -2.4], yaw: -Math.PI / 2 },
        ],
        solids: [
          box(-6.2, -12.65, 1.2, 0.5),
          box(6.2, -12.65, 1.2, 0.5),
          box(15.6, -7.3, 1.3, 0.45, -Math.PI / 2),
          round(14.3, -7.3, 0.5),
          box(-16.2, -7.3, 1.5, 0.3, Math.PI / 2),
          box(0, -14.87, 9, 0.13),
          ...[-9.9, 9.9].flatMap((x) => [stand(x, -1.3, x < 0 ? 0.4 : -0.4), stand(x, -13.3, x < 0 ? 0.4 : -0.4)]),
        ],
        windows: [paneAlongX(-17, 17, 0, 0, 4.3)],
        viewFrom: [0, EYE_M, -1],
        door: { at: [0, -1.1], yaw: 0, reachM: 1.4 },
      };
    case "waterfront-showroom": {
      const heightAt = (z: number) => 3.9 + ((8 - z) / 16) * (5.7 - 3.9);
      const side = (x: number): Window => ({ corners: [[x, 0, -8], [x, 0, 2], [x, heightAt(2), 2], [x, heightAt(-8), -8]] });
      return {
        spots: [],
        solids: [
          box(0, 5.4, 3.1, 0.56),
          round(1.6, 6.7, 0.32),
          round(-1.6, 6.7, 0.32),
          box(0, 7.92, 5.5, 0.08),
          box(-10.6, 4.8, 1.4, 0.45),
          box(-7.3, 3.3, 0.85, 0.45, -Math.PI / 2),
          round(-10.4, 2.9, 0.5),
          box(11, 5.5, 1.7, 0.6),
          ...[-6.5, 6.5].map((x) => round(x, 0.6, 0.3)),
        ],
        windows: [paneAlongX(-14, 14, -8, 0, heightAt(-8)), side(-14), side(14)],
        viewFrom: [0, EYE_M, -6],
        door: { at: [7, 6.6], yaw: 0.3, reachM: 1.4 },
      };
    }
  }
}

function fromDraft(draft: Interior): DealerInterior {
  const { id, turntable, displays, lighting, room } = draft;
  const extra = extras(id);
  const lamps: Lamp[] = lighting.lights.map(({ at, paint, power, reachM }) => ({ kind: "point", at, paint, power, reachM }));
  return {
    name: `${draft.brand.name.charAt(0)}${draft.brand.name.slice(1).toLowerCase()}`,
    room: draft.soup,
    turntables: [{ soup: turntable.soup, centre: turntable.centre, turnSeconds: turntable.turnSeconds }],
    stock: STOCK[id],
    spots: [
      { at: [turntable.centre[0], turntable.deckY, turntable.centre[2]], yaw: 0.6, turntable: 0 },
      ...displays.map(({ at, yaw }): Spot => ({ at, yaw })),
      ...extra.spots,
    ],
    floor: rectangle(room.x[0], room.z[0], room.x[1], room.z[1]),
    solids: extra.solids,
    windows: extra.windows,
    viewFrom: extra.viewFrom,
    light: { ambient: DRAFT_AMBIENT, ambientPaint: "wall-trim", lamps, mirrors: lighting.mirrors },
    door: extra.door,
  };
}

export function draftInterior(site: InteriorId): DealerInterior {
  return fromDraft(buildInterior(site));
}
