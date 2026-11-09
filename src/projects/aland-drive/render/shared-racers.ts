import type { Standing } from "../challenge/standings";
import type { RaceChallenge } from "../challenge/types";
import type { ComputerCars } from "../net/computer-cars";
import type { ComputerCarMessage, RaceProgress } from "../net/protocol";
import type { SeenCar } from "../racers/awareness";
import { gridPlaces, racersOn, startPlaceOf } from "../challenge/grid-places";
import { gridSlots, RaceGrid, seenCarOf, type GridHost } from "../racers/grid";
import type { RaceLine } from "../racers/race-line-file";
import { gridRacerId, isRacer, leftUnfinished, mayRunRacer, parseRacerDriver, placerOf, replacementId, replacementOf, standingOf, type RacerDriver } from "../racers/shared";
import type { CarState } from "../sim/car-state";
import type { CarId } from "../sim/cars";
import type { Condition } from "../sim/surfaces";

/*
 * A race's racers in the game, shared online (`racers/shared.ts`): the racers
 * this page runs are simulated cars here (`racers/grid.ts`), every other one
 * a stand-in, as another player's car is, and each is a computer-driven car
 * (`net/computer-cars.ts`) that the player in the race nearest it runs. Solo,
 * this page is the only player in the race and runs them all.
 *
 * Each frame, before the world steps, what the nearest-player rule decided is
 * made so here: a racer handed here is taken from its record where its state
 * has it, and one handed away is let go, its stand-in carrying on from where
 * it was. After the step every racer run here is sent with its record.
 */

export interface SharedRacersHost {
  cars: ComputerCars;
  /** This player's id in the world, or "" alone, and their car as it stands. */
  selfId: () => string;
  selfState: () => CarState;
  grid: GridHost;
  raceLine: (race: RaceChallenge) => Promise<RaceLine>;
  /** A stand-in of a racer another page runs: heard where it is, forgotten, or where it stands now. */
  standIn: {
    hear: (id: string, state: CarState) => void;
    forget: (id: string) => void;
    stateAt: (id: string, share: number) => CarState;
  };
  /** A racer this page took out of the world: nothing of it is drawn any more. */
  gone: (id: string) => void;
  /** The race this player is in and how far round, or null. */
  progress: () => RaceProgress | null;
  /** The race's clock on this page, for a racer that takes a leaver's place. */
  clockS: () => number;
  condition: () => Condition;
}

interface Said {
  state: CarState;
  progress: RaceProgress | null;
}

export function createSharedRacers(host: SharedRacersHost) {
  let grid: RaceGrid | null = null;
  let line: RaceLine | null = null;
  /** What every other player last said of themselves: their car and the race they're in. */
  const said = new Map<string, Said>();

  const driverOf = (car: ComputerCarMessage): RacerDriver => parseRacerDriver(car.driver);
  const racers = () => host.cars.all().filter(({ driver }) => isRacer(driver));
  const ofThisRace = (car: ComputerCarMessage) => {
    const progress = host.progress();
    const driver = car.driver as Partial<RacerDriver>;
    return progress !== null && driver.race === progress.race && driver.attempt === progress.attempt;
  };

  /** This page stops running every racer of a race it is no longer in: retried, each goes for everyone; left, each passes to the nearest player still in it. */
  function letGoOthers(race: string | null, attempt: number | null): void {
    for (const car of host.cars.running()) {
      if (!isRacer(car.driver)) continue;
      const driver = car.driver as Partial<RacerDriver>;
      if (driver.race === race && driver.attempt === attempt) continue;
      if (grid?.racers.some(({ id }) => id === car.id)) {
        const entry = grid.racers.find(({ id }) => id === car.id);
        if (entry) host.standIn.hear(car.id, entry.car.stateAt(1));
        grid.release(car.id);
      }
      if (driver.race === race) {
        host.cars.remove(car.id);
        host.gone(car.id);
      } else host.cars.letGo(car.id);
    }
  }

  /** A player who left a race unfinished: the player in it nearest where they were puts a racer in their place, in their car. */
  function replace(peer: string, leaver: Said, was: RaceProgress): void {
    const own = host.progress();
    if (!grid || !line || own === null || own.race !== was.race || own.attempt !== was.attempt) return;
    const at = leaver.state.position;
    const off = (state: CarState) => Math.hypot(state.position[0] - at[0], state.position[2] - at[2]);
    const self = host.selfId();
    let nearest = { peer: self, off: off(host.selfState()) };
    for (const [other, { state, progress }] of said) {
      if (other === peer || progress?.race !== was.race || progress.attempt !== was.attempt) continue;
      const each = off(state);
      if (each < nearest.off || (each === nearest.off && other < nearest.peer)) nearest = { peer: other, off: each };
    }
    if (nearest.peer !== self) return;
    const id = replacementId(was.race, was.attempt, peer);
    if (host.cars.all().some((car) => car.id === id)) return;
    const driver = replacementOf(grid.race, line.line, { state: leaver.state, progress: was }, host.clockS(), host.condition());
    host.cars.add(id, leaver.state, { ...driver });
    grid.take(id, leaver.state, driver);
  }

  return {
    /**
     * Once this player's car is on its grid place for an attempt: the racers of any race before go, and this page puts
     * down the grid racers nearer its own start place than any other player's still in the race. A player who has left
     * the team (`gone`, by seat) has a racer on their place, as the one that took their place in the attempt they left.
     */
    async begin(race: RaceChallenge, attempt: number, seat: number, players: number, gone: readonly boolean[], asked: number, field: readonly CarId[]): Promise<void> {
      letGoOthers(race.id, attempt);
      grid?.dispose();
      grid = null;
      line = await host.raceLine(race);
      grid = new RaceGrid(race, line, host.grid);
      const count = racersOn(race, players, asked);
      const seats = Array.from({ length: players }, (_, each) => each);
      const still = seats.filter((each) => !gone[each]);
      const starts = still.map((each) => startPlaceOf(race, each, players, asked));
      const places = [...gridPlaces(race, count + players).slice(0, count), ...seats.filter((each) => gone[each]).map((each) => startPlaceOf(race, each, players, asked))];
      const condition = host.condition();
      for (const { slot, place, car, paint } of gridSlots(places, field)) {
        if (still[placerOf(place, starts)] !== seat) continue;
        const id = gridRacerId(race.id, attempt, slot);
        const entry = grid.place(id, attempt, place, car, paint, condition);
        host.cars.add(id, entry.car.stateAt(1), { ...grid.driverOf(entry) });
      }
    },

    /** This player is out of the race: every racer it runs passes to the nearest player still in it, or goes. */
    end(): void {
      letGoOthers(null, null);
      grid?.dispose();
      grid = null;
      line = null;
    },

    /** Before the world steps: racers handed here are taken, those handed away let go, and, once the race is under way here, every racer run here steps. */
    beforeStep(others: readonly SeenCar[], stepping: boolean): void {
      if (!grid) return;
      const running = host.cars.running().filter((car) => isRacer(car.driver) && ofThisRace(car));
      for (const car of running) {
        if (grid.racers.some(({ id }) => id === car.id)) continue;
        host.standIn.forget(car.id);
        grid.take(car.id, car.state, driverOf(car));
      }
      for (const entry of [...grid.racers]) {
        if (running.some((car) => car.id === entry.id)) continue;
        host.standIn.hear(entry.id, entry.car.stateAt(1));
        grid.release(entry.id);
      }
      if (stepping) grid.step([...others, ...this.seenElsewhere()]);
    },

    /** After the world steps: each racer run here as it now stands, with its record, to go to everyone. */
    afterStep(): void {
      for (const entry of grid?.racers ?? []) host.cars.update(entry.id, entry.car.stateAt(1), { ...grid?.driverOf(entry) });
    },

    /** The racers other pages run, as racers here see them. */
    seenElsewhere(): SeenCar[] {
      const here = new Set(grid?.racers.map(({ id }) => id));
      return racers()
        .filter((car) => !here.has(car.id))
        .map((car) => seenCarOf(car.id, host.standIn.stateAt(car.id, 1)));
    },

    /** Where every racer of this player's race stands, wherever it is run. */
    standings(): Standing[] {
      const here = grid?.standings() ?? [];
      const elsewhere = racers()
        .filter((car) => ofThisRace(car) && !grid?.racers.some(({ id }) => id === car.id))
        .map((car) => standingOf(driverOf(car)));
      return [...here, ...elsewhere];
    },

    /** How many racers this player's race has, wherever each is run. */
    count(): number {
      return racers().filter(ofThisRace).length;
    },

    /** The racers run here, to be drawn. */
    runHere: () => grid?.racers ?? [],

    /** Whether a player may run a computer-driven car: a racer, only a player in its race and attempt. */
    mayRun(car: ComputerCarMessage, peer: string): boolean | null {
      if (!isRacer(car.driver)) return true;
      const driver = driverOf(car);
      if (peer === host.selfId()) return mayRunRacer(driver, host.progress());
      const known = said.get(peer);
      return mayRunRacer(driver, known === undefined ? undefined : known.progress);
    },

    /** Another player's car, and the race they say they're in. */
    heard(peer: string, state: CarState, progress: RaceProgress | undefined): void {
      const before = said.get(peer);
      said.set(peer, { state, progress: progress ?? null });
      // Their car as it last raced: leaving hands a player back the car they had before.
      if (before?.progress && leftUnfinished(before.progress, progress ?? null)) replace(peer, before, before.progress);
    },

    /** A player gone from the world. */
    gone(peer: string): void {
      const last = said.get(peer);
      said.delete(peer);
      if (last?.progress && leftUnfinished(last.progress, null)) replace(peer, last, last.progress);
    },

    dispose(): void {
      grid?.dispose();
      grid = null;
    },
  };
}

export type SharedRacers = ReturnType<typeof createSharedRacers>;
