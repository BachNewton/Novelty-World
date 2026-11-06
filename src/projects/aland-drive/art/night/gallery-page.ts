import { startGame, type Place } from "../../render/game";

/*
 * The gallery's page: the real game on real tiles, its day set to each of the night's looks by the real calendar, so
 * its pictures are the game's own.
 */

export interface NightView {
  name: string;
  at?: Place;
  /** A showcase spot's key, for the chase camera with the headlights on. */
  jump?: string;
}

/** A date and hour that puts the sun where each look is: high summer, a November golden hour and dusk, a midsummer night, and a winter one. */
export const HOUR_LOOKS = {
  day: { date: { year: 2026, month: 6, day: 21 }, hour: 13 },
  golden: { date: { year: 2026, month: 11, day: 5 }, hour: 15.5 },
  dusk: { date: { year: 2026, month: 11, day: 5 }, hour: 16.75 },
  night: { date: { year: 2026, month: 6, day: 21 }, hour: 0.5 },
  winter: { date: { year: 2026, month: 11, day: 5 }, hour: 22 },
} as const;
export type HourLook = keyof typeof HOUR_LOOKS;

declare global {
  interface Window {
    __nightFailure?: string;
    __nightGallery?: {
      setHour: (look: HourLook) => void;
      show: (view: NightView) => Promise<void>;
      /** Shows or hides everything the night draws, for measuring it. */
      setDrawn: (drawn: boolean) => void;
    };
  }
}

const element = document.getElementById("game");
if (!element) throw new Error("no game element");

startGame(element, {
  onHud: () => undefined,
  onInputKind: () => undefined,
  onCamera: () => undefined,
  onFailure: (error) => {
    window.__nightFailure = error.stack ?? error.message;
  },
})
  .then((game) => {
    const probe = game.probe;
    (window as unknown as { __alandDrive: unknown }).__alandDrive = probe;
    window.__nightGallery = {
      setHour(look) {
        probe.setDay({ ...HOUR_LOOKS[look], held: true });
      },
      async show(view) {
        if (view.at) {
          probe.look(view.at);
          return;
        }
        if (view.jump === undefined) throw new Error(`${view.name} has no place`);
        await probe.jumpTo(view.jump);
        probe.setCamera("chase");
        probe.advance(120);
      },
      setDrawn: probe.showNightLights,
    };
  })
  .catch((error: unknown) => {
    window.__nightFailure = error instanceof Error ? (error.stack ?? error.message) : String(error);
  });
