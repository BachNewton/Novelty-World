import { stickPlace } from "../../gameplay/fetch";
import type { Point3 } from "../../gameplay/offering";
import { forgetSticks, giveStick, pickUpOffered, pickUpStick, sticksAround, throwHeld, thrownToPickUp, type Fetching, type Thrown } from "./fetching";

/*
 * The probe's fetch, under its companions: the sticks lying about, the one
 * in Elliott's hand, throwing it, the sticks thrown and where they are, and
 * the dogs at play and what each is doing in its game.
 */

export interface FetchProbe {
  /** The world's sticks within `radius` of a point, less those taken up. */
  sticksNear: (x: number, z: number, radius: number) => { id: string; x: number; y: number; z: number }[];
  /** Whether a stick is offered to pick up. */
  offered: () => boolean;
  /** Picks up a world stick near Elliott by its id, or whatever stick is offered. */
  pickUp: (id?: string) => void;
  /** Picks up the thrown stick nearest Elliott, wherever it lies. */
  pickUpThrown: () => void;
  /** Puts a stick in Elliott's hand, as if picked up. */
  give: () => void;
  holding: () => boolean;
  /** Throws the stick in hand where Elliott looks, or along `way` from their hand. */
  throw: (way?: Point3) => void;
  /** The sticks thrown: where each is, and which dog carries it. */
  thrown: () => { id: number; phase: string; x: number; y: number; z: number; carriedBy: string | null }[];
  /** The dogs at play and what each is doing in its game. */
  games: () => { key: string; phase: string }[];
  /** Lets every stick go and ends every game. */
  forget: () => void;
}

export function fetchProbe(fetching: Fetching): FetchProbe {
  return {
    sticksNear: (x, z, radius) => sticksAround(fetching, x, z, radius).map((s) => ({ id: s.id, x: s.x, y: s.y, z: s.z })),
    offered: () => fetching.shown.offered,
    pickUp: (id) => {
      if (id === undefined) {
        pickUpOffered(fetching);
        return;
      }
      const hand = fetching.hand;
      if (!hand) throw new Error("The scene hasn't said where Elliott is");
      const spot = sticksAround(fetching, hand.from.x, hand.from.z, 80).find((s) => s.id === id);
      if (!spot) throw new Error(`No stick ${id} lying about`);
      pickUpStick(fetching, { spot });
    },
    pickUpThrown: () => {
      const hand = fetching.hand;
      if (!hand) throw new Error("The scene hasn't said where Elliott is");
      const far = (t: Thrown) => {
        const at = stickPlace(t.stick, fetching.world, t.turn);
        return Math.hypot(at.x - hand.from.x, at.z - hand.from.z);
      };
      const nearest = thrownToPickUp(fetching).sort((a, b) => far(a) - far(b))[0] as Thrown | undefined;
      if (!nearest) throw new Error("No thrown stick lying to pick up");
      pickUpStick(fetching, { thrown: nearest.id });
    },
    give: () => {
      giveStick(fetching);
    },
    holding: () => fetching.holding,
    throw: (way) => {
      if (way && fetching.hand) fetching.hand = { ...fetching.hand, way };
      throwHeld(fetching);
    },
    thrown: () =>
      fetching.thrown.map((t) => {
        const at = stickPlace(t.stick, fetching.world, t.turn);
        return { id: t.id, phase: t.stick.phase, x: at.x, y: at.y, z: at.z, carriedBy: t.carriedBy };
      }),
    games: () => [...fetching.companionship.animals.values()].flatMap((a) => (a.fetch ? [{ key: a.key, phase: a.fetch.phase }] : [])),
    forget: () => {
      forgetSticks(fetching);
    },
  };
}
