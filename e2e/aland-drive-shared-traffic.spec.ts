// e2e-covers: src/projects/aland-drive/traffic/** src/projects/aland-drive/net/**
import type { Server } from "node:http";
import type { Browser, Page } from "@playwright/test";
import { serveTiles } from "../src/projects/aland-drive/tools/serve-tiles.mjs";
import { LOCAL_RELAY } from "./relay";
import { expect, test } from "./test";
import { WEBGPU_BROWSER } from "./webgpu";

/*
 * Shared traffic: the cars, cyclists and walkers on the lanes, each run by the
 * player nearest it and driven by every page near it. Two pages share a world
 * on this run's own relay, on the fixture with its lane map, and see the same
 * vehicles in the same places: both ways, after one drives on past the other
 * and vehicles change hands, and after the host goes and the one left takes
 * its vehicles on.
 */

const PAGE = "/games/3d-games/aland-drive";
const FIXTURE_TILES = "src/projects/aland-drive/fixture";
/** The first player stands this far along the fixture's start road, the second a little behind. */
const FIRST_AT_M = 400;
const SECOND_BEHIND_M = 30;
/** Then the second moves on this far ahead of the first: most of what's round them is nearer it now. */
const SECOND_AHEAD_M = 150;
/** Compared within this of both players: well inside every kind's bubble, so each page holds all of them. */
const NEAR_BOTH_M = 180;
/** Busier than the island, so a country road has all three kinds near the start. */
const DENSITY = { cars: 4, cyclists: 8, walkers: 30 };
/** A vehicle's record crosses the wire in centimetres. */
const SAME_PLACE_M = 0.02;

let tiles: Server;
let tilesPort: number;

test.beforeAll(async () => {
  const { server, port } = await serveTiles(FIXTURE_TILES, null, 0, { withLanes: true });
  tiles = server;
  tilesPort = port;
});

test.afterAll(() => {
  tiles.close();
});

test.use(WEBGPU_BROWSER);
test.setTimeout(240_000);

type Vehicle = { id: string; kind: string; x: number; z: number; runsHere: boolean; handovers: number };

async function joinWorld(browser: Browser, world: string, along: number): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await page.goto(`${PAGE}?tiles=local:${tilesPort}&${LOCAL_RELAY}&drive-world=${world}`);
  await page.waitForFunction(() => window.__alandDrive?.online().status === "connected" && window.__alandDrive.mapReady(), null, { timeout: 90_000 });
  await page.evaluate(([at, { cars, cyclists, walkers }]) => {
    const probe = window.__alandDrive;
    probe?.placeOnRoad(0, at);
    probe?.traffic(cars);
    probe?.cyclists(cyclists);
    probe?.walkers(walkers);
  }, [along, DENSITY] as const);
  return page;
}

const vehicles = (page: Page): Promise<Vehicle[]> => page.evaluate(() => window.__alandDrive?.sharedTraffic() ?? []);
const carAt = (page: Page) => page.evaluate(() => window.__alandDrive?.car().position ?? [0, 0, 0]);

/** The vehicles within reach of both players' cars, as one page holds them. */
async function nearBoth(page: Page, cars: number[][]): Promise<Vehicle[]> {
  return (await vehicles(page)).filter((vehicle) => cars.every(([x, , z]) => Math.hypot(vehicle.x - x, vehicle.z - z) < NEAR_BOTH_M));
}

/**
 * With both pages held, one sends every vehicle it runs, and the other comes to have each exactly where the first does:
 * the same vehicles, in the same places.
 */
async function sameOnBoth(runner: Page, other: Page): Promise<number> {
  const cars = [await carAt(runner), await carAt(other)];
  const run = (await nearBoth(runner, cars)).filter((vehicle) => vehicle.runsHere);
  await runner.evaluate(() => window.__alandDrive?.flushTraffic());
  try {
    await other.waitForFunction(
      ([expected, closeM]) => {
        const held = new Map((window.__alandDrive?.sharedTraffic() ?? []).map((vehicle) => [vehicle.id, vehicle]));
        return expected.every(({ id, x, z }) => {
          const there = held.get(id);
          return there !== undefined && !there.runsHere && Math.hypot(there.x - x, there.z - z) < closeM;
        });
      },
      [run, SAME_PLACE_M] as const,
      { timeout: 20_000 },
    );
  } catch (error) {
    throw new Error(`the other page never had the runner's vehicles where it has them: runner ${JSON.stringify(run)}, other ${JSON.stringify(await vehicles(other))}`, { cause: error });
  }
  return run.length;
}

async function bothHeld(pages: Page[], held: boolean): Promise<void> {
  for (const page of pages) await page.evaluate((hold) => window.__alandDrive?.hold(hold), held);
}

test("two players see the same cars, cyclists and walkers in the same places, through a handover and a host change", async ({ browser }) => {
  const world = `traffic-${crypto.randomUUID()}`;
  const host = await joinWorld(browser, world, FIRST_AT_M);
  await host.waitForFunction(() => window.__alandDrive?.online().role === "host");
  const guest = await joinWorld(browser, world, FIRST_AT_M - SECOND_BEHIND_M);
  for (const page of [host, guest]) await page.waitForFunction(() => window.__alandDrive?.players()[0]?.position != null, null, { timeout: 30_000 });

  // Every kind is round them, and each page runs some of what's there.
  await guest.waitForFunction(
    (reach) => {
      const probe = window.__alandDrive;
      const [x, , z] = probe?.car().position ?? [0, 0, 0];
      const near = (probe?.sharedTraffic() ?? []).filter((vehicle) => Math.hypot(vehicle.x - x, vehicle.z - z) < reach);
      return ["car", "bike", "walker"].every((kind) => near.some((vehicle) => vehicle.kind === kind)) && near.some((vehicle) => vehicle.runsHere) && near.some((vehicle) => !vehicle.runsHere);
    },
    NEAR_BOTH_M,
    { timeout: 60_000 },
  );
  await bothHeld([host, guest], true);
  expect(await sameOnBoth(host, guest)).toBeGreaterThan(0);
  expect(await sameOnBoth(guest, host)).toBeGreaterThan(0);
  // One traffic, not two: no slot holds a vehicle from each player.
  const ids = new Set([...(await vehicles(host)), ...(await vehicles(guest))].map(({ id }) => id));
  const slots = [...ids].map((id) => id.split("~")[0]);
  expect(slots.filter((slot, at) => slots.indexOf(slot) !== at)).toEqual([]);
  const hostRan = (await nearBoth(host, [await carAt(host), await carAt(guest)])).filter((vehicle) => vehicle.runsHere).map(({ id }) => id);

  // The guest moves on ahead: vehicles the host ran change hands to it as they come nearer it.
  await guest.evaluate((along) => window.__alandDrive?.placeOnRoad(0, along), FIRST_AT_M + SECOND_AHEAD_M);
  await bothHeld([host, guest], false);
  await guest.waitForFunction((ids) => (window.__alandDrive?.sharedTraffic() ?? []).some((vehicle) => ids.includes(vehicle.id) && vehicle.runsHere && vehicle.handovers > 0), hostRan, { timeout: 30_000 });
  await bothHeld([host, guest], true);
  expect(await sameOnBoth(host, guest)).toBeGreaterThan(0);
  expect(await sameOnBoth(guest, host)).toBeGreaterThan(0);

  // The host goes: the guest hosts, and takes on every vehicle the host ran round it, none of them gone.
  const cars = [await carAt(host), await carAt(guest)];
  const left = (await nearBoth(guest, cars)).filter((vehicle) => !vehicle.runsHere).map(({ id }) => id);
  expect(left.length).toBeGreaterThan(0);
  await host.context().close();
  await guest.waitForFunction(() => window.__alandDrive?.online().role === "host" && window.__alandDrive.players().length === 0, null, { timeout: 30_000 });
  await guest.waitForFunction((ids) => {
    const held = new Map((window.__alandDrive?.sharedTraffic() ?? []).map((vehicle) => [vehicle.id, vehicle]));
    return ids.every((id) => held.get(id)?.runsHere === true);
  }, left);
  await guest.context().close();
});
