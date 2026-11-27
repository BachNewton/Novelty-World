import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { ColliderGroups } from "@/shared/lib/physics/collider-groups";
import { loadRapier, type Rapier } from "@/shared/lib/physics/rapier";
import { box, fitStandIns, type Shape } from "@/shared/lib/physics/stand-ins";
import { chunkShapes, COLUMN, descsOf, fittingOf, groundShapes, WALKER } from "./colliders";
import { flatGround, painted, raised } from "./ground";
import type { KitPiece } from "./kit";
import { BODY_RADIUS, emptyBoxes, Physics, playerBody, playerGroup, SNAP, standingBodies } from "./physics";
import { pushOf, SPEED, STANDING, stepPlayer, type Move, type Player } from "./player";
import type { Placement } from "./town";

let rapier: Rapier;
beforeAll(async () => {
  rapier = await loadRapier();
});

const DT = 1 / 60;
const STILL: Move = { x: 0, z: 0, sprint: false, jump: false };

/** The floor every world stands on: its top at y = 0. */
const FLOOR = box([-10, -1, -10], [10, 0, 10]);

/** A world of shapes, on the floor unless told otherwise, with the players in it at their places. */
function world(shapes: readonly Shape[], players: Player[] = [STANDING], floor: Shape[] = [FLOOR]): Physics {
  const physics = new Physics(rapier, new ColliderGroups());
  physics.colliders.set("map", (r) => descsOf(r, [...floor, ...shapes]));
  players.forEach((p, i) => physics.colliders.set(playerGroup(i), playerBody(p)));
  physics.settle();
  return physics;
}

/** A player walked frame by frame as `move` asks, until `done` or five seconds, with every state along the way. */
function walk(physics: Physics, from: Player, move: (frame: number) => Move, done: (p: Player) => boolean = () => false, player = 0): Player[] {
  const states = [from];
  const mover = physics.mover(player);
  for (let frame = 0; frame < 300 && !done(states[states.length - 1]); frame++) {
    states.push(stepPlayer(states[states.length - 1], move(frame), DT, mover));
    physics.settle();
  }
  return states;
}

const last = (states: Player[]): Player => states[states.length - 1];
const at = (x: number, z: number): Player => ({ ...STANDING, x, z });
/** A move on the ground at an angle from +x, in degrees. */
const heading = (degrees: number, sprint = false): Move => ({ ...STILL, x: Math.cos((degrees * Math.PI) / 180), z: Math.sin((degrees * Math.PI) / 180), sprint });

/** The fastest a walk went across the ground between two frames, and the furthest it moved between two frames in all, height too. */
function fastest(states: readonly Player[]): { across: number; jump: number } {
  let across = 0;
  let jump = 0;
  for (let i = 1; i < states.length; i++) {
    const [a, b] = [states[i - 1], states[i]];
    across = Math.max(across, Math.hypot(b.x - a.x, b.z - a.z) / DT);
    jump = Math.max(jump, Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
  }
  return { across, jump };
}

/**
 * That a walk never went faster than it asked, nor moved further in a frame
 * than its speed and a step down. The controller keeps a skin's width off what
 * it touches, and easing back to it may add a hair.
 */
function expectNatural(states: readonly Player[], move: Move): void {
  const speed = (move.sprint ? SPEED.sprint : SPEED.walk) * pushOf(move);
  const { across, jump } = fastest(states);
  expect(across).toBeLessThanOrEqual(speed * 1.02);
  expect(jump).toBeLessThanOrEqual(speed * DT + SNAP);
}

describe("a wall", () => {
  const wall = box([1, 0, -5], [1.1, 1, 5]);

  it("is slid along at a slant, never faster than the walk asked, shallow or steep", () => {
    for (const degrees of [20, 45, 70]) {
      for (const sprint of [false, true]) {
        const move = heading(degrees, sprint);
        const states = walk(world([wall]), at(0, 0), () => move, (p) => p.z > 2);
        expect(last(states).x).toBeLessThan(1 - BODY_RADIUS + 0.02);
        expect(last(states).z).toBeGreaterThan(2);
        expectNatural(states, move);
      }
    }
  });

  it("stops a walk into an inside corner, never throwing the player out of it", () => {
    const corner = box([-5, 0, 1], [1.1, 1, 1.1]);
    for (const degrees of [30, 45, 60]) {
      const move = heading(degrees, true);
      const states = walk(world([wall, corner]), at(0, 0), () => move);
      expect(last(states).x).toBeLessThan(1 - BODY_RADIUS + 0.02);
      expect(last(states).z).toBeLessThan(1 - BODY_RADIUS + 0.02);
      expectNatural(states, move);
    }
  });

  it("is never passed through at a sprint on a slow frame", () => {
    const physics = world([wall]);
    let p = at(0, 0);
    for (let i = 0; i < 20; i++) p = stepPlayer(p, { ...STILL, x: 1, sprint: true }, 0.1, physics.mover(0));
    expect(p.x).toBeLessThan(1);
  });
});

describe("a low blocker", () => {
  // A pumpkin's height, a fence's thickness: from x = 1 to 1.4.
  const block = box([1, 0, -2], [1.4, 0.33, 2]);

  it("stops a walk into it: too tall to step up", () => {
    const end = last(walk(world([block]), at(0, 0), () => ({ ...STILL, x: 1 })));
    expect(end.x).toBeLessThan(1 - BODY_RADIUS + 0.02);
    expect(end.y).toBeCloseTo(0, 2);
  });

  it("is landed on top of from a jump, not inside it, and run along", () => {
    const states = walk(world([block]), at(0.5, 0), (f) => ({ ...STILL, x: 0.6, jump: f === 0 }), (p) => p !== STANDING && p.x > 1.2 && !p.airborne);
    const landed = last(states);
    expect(landed.y).toBeCloseTo(0.33, 1);
    const along = { ...STILL, z: 1, sprint: true };
    const run = walk(world([block], [landed]), landed, () => along, (p) => p.z > 1.5);
    expect(run.every((p) => !p.airborne && Math.abs(p.y - landed.y) < 0.01)).toBe(true);
    expectNatural(run, along);
  });
});

describe("a lip", () => {
  it("as low as a curb or a stepping stone is walked over smoothly, by the capsule's round foot", () => {
    const move = { ...STILL, x: 1 };
    const states = walk(world([box([1, 0, -2], [3, 0.05, 2])]), at(0, 0), () => move, (p) => p.x > 2);
    expect(last(states).x).toBeGreaterThan(2);
    expect(last(states).y).toBeCloseTo(0.05, 2);
    expectNatural(states, move);
  });
});

describe("stairs", () => {
  /** A flight of the kit's town stairs rising to +x: eight steps, each 0.125 up and 0.125 deep, to a landing. */
  const steps = Array.from({ length: 8 }, (_, i) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1 - i * 0.125, 0.125, 1));
    mesh.position.set(0.5 - (1 - i * 0.125) / 2, i * 0.125 + 0.0625, 0);
    mesh.updateMatrixWorld(true);
    return mesh;
  });

  it("are a slope walked up and down smoothly, never faster than the walk", () => {
    const placed = fitStandIns(steps, WALKER, fittingOf("stairs-stone"), COLUMN);
    const up = { ...STILL, x: 1 };
    const climbing = walk(world(placed), at(-1.5, 0), () => up, (p) => p.x > 0.45);
    // Over the edge onto the landing, the capsule's round foot still rests a little down the slope.
    expect(Math.abs(last(climbing).y - 1)).toBeLessThan(0.1);
    expectNatural(climbing, up);
    const down = { ...STILL, x: -1 };
    const top = { ...STANDING, x: 0.4, y: 1 };
    const descending = walk(world(placed, [top]), top, () => down, (p) => p.x < -1.5);
    expect(descending.every((p) => !p.airborne)).toBe(true);
    expect(last(descending).y).toBeCloseTo(0, 1);
    expectNatural(descending, down);
  });
});

describe("the ground", () => {
  it("is level across a path and a pond, with no lip at their edges", () => {
    const cells: [number, number][] = [
      [2, 0],
      [3, 0],
      [4, 0],
    ];
    const ground = painted(painted(flatGround(), cells, "dirt"), [[6, 0]], "water");
    const shapes = [...groundShapes(ground).values()].flat();
    const move = { ...STILL, x: 1, sprint: true };
    const states = walk(world(shapes, [at(0.5, 0.5)], []), at(0.5, 0.5), () => move, (p) => p.x > 7.5);
    const heights = states.slice(10).map((p) => p.y);
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(0.002);
    expectNatural(states, move);
  });

  it("is a cliff to a raised cell, climbed only by a jump up half a storey", () => {
    const ground = raised(flatGround(), [[2, 0]], 1);
    const shapes = [...groundShapes(ground).values()].flat();
    const end = last(walk(world(shapes, [at(0.5, 0.5)], []), at(0.5, 0.5), () => ({ ...STILL, x: 1 })));
    expect(end.x).toBeLessThan(2 - BODY_RADIUS + 0.02);
  });

  it("stops a walk into an empty cell", () => {
    const physics = world([]);
    physics.colliders.set("empty", emptyBoxes([[1, -1]]));
    physics.settle();
    const end = last(walk(physics, at(0.2, -0.5), () => ({ ...STILL, x: 1 })));
    expect(end.x).toBeLessThan(1 - BODY_RADIUS + 0.02);
    expect(end.airborne).toBe(false);
  });
});

describe("stacked blocks", () => {
  it("are not walked into from the lower one's top", () => {
    const lower = box([-2, 0, -2], [4, 1, 2]);
    const upper = box([1, 1, -2], [2, 2, 2]);
    const end = last(walk(world([lower, upper], [{ ...STANDING, y: 1 }]), { ...STANDING, y: 1 }, () => ({ ...STILL, x: 1 })));
    expect(end.x).toBeLessThan(1 - BODY_RADIUS + 0.02);
    expect(end.y).toBeCloseTo(1, 1);
  });
});

describe("doors and arches", () => {
  /** A wall piece along its cell's +x edge with an opening in its middle: two posts and a lintel. */
  const posts = [
    { min: [0.4, 0, -0.5], max: [0.5, 1, -0.3] },
    { min: [0.4, 0, 0.3], max: [0.5, 1, 0.5] },
    { min: [0.4, 0.8, -0.3], max: [0.5, 1, 0.3] },
  ].map(({ min, max }) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(max[0] - min[0], max[1] - min[1], max[2] - min[2]));
    mesh.position.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    mesh.updateMatrixWorld(true);
    return mesh;
  });

  /** A walk through the middle of a piece standing in cell (0, 0), from its −x side: how far it gets. */
  function through(piece: KitPiece): number {
    const placements: Placement[] = [{ piece, x: 0, z: 0 }];
    return last(walk(world(chunkShapes(placements, () => posts)), at(0.2, 0.5), () => ({ ...STILL, x: 1 }), (p) => p.x > 2)).x;
  }

  it("closes a door's opening", () => {
    expect(through("wall-door")).toBeLessThan(0.9);
    expect(through("wall-wood-arch")).toBeLessThan(0.9);
  });

  it("leaves an opening in a wall open, under what spans it", () => {
    expect(through("wall-arch-top")).toBeGreaterThan(2);
  });
});

describe("slopes", () => {
  /** Where a player stood on a slope of `degrees`, rising toward +x, is a few seconds later. */
  function after(degrees: number): Player {
    const rise = Math.tan((degrees * Math.PI) / 180);
    const slab: Shape = { kind: "hull", points: [-4, -4 * rise, -4, 4, 4 * rise, -4, -4, -4 * rise, 4, 4, 4 * rise, 4, -4, -4 * rise - 1, -4, 4, 4 * rise - 1, 4] };
    const start = { ...STANDING, y: 0.05 };
    return last(walk(world([slab], [start], []), start, () => STILL));
  }

  it("hold a player on a pitch they can stand on", () => {
    expect(after(30).y).toBeGreaterThan(0);
  });

  it("slide a player off a pitch too steep to stand on", () => {
    expect(after(60).y).toBeLessThan(-1);
  });
});

describe("a gap", () => {
  /** Two posts standing a gap apart across z, at x 1 to 1.2: a fitted piece's stand-ins. */
  const posts = (gap: number): Shape[] => {
    const meshes = [-1, 1].map((side) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.4));
      mesh.position.set(1.1, 0.4, side * (gap / 2 + 0.2));
      mesh.updateMatrixWorld(true);
      return mesh;
    });
    return fitStandIns(meshes, WALKER, fittingOf("wall"), COLUMN);
  };
  const through = (shapes: Shape[]): number => last(walk(world(shapes), at(0, 0), () => ({ ...STILL, x: 1 }), (p) => p.x > 2)).x;

  it("as wide as a body passing through stays open", () => {
    expect(through(posts(2 * WALKER.passing + 2 * COLUMN))).toBeGreaterThan(2);
  });

  it("narrower than a body is filled", () => {
    expect(through(posts(2 * BODY_RADIUS - COLUMN))).toBeLessThan(1);
  });
});

describe("bodies", () => {
  /** How near a walk straight at a body standing at (1, 0) comes to its middle: it may slip round, never through. */
  const nearest = (physics: Physics): number => Math.min(...walk(physics, at(0, 0), () => ({ ...STILL, x: 1 })).map((p) => Math.hypot(p.x - 1, p.z)));

  it("block each other", () => {
    expect(nearest(world([], [at(0, 0), at(1, 0)]))).toBeGreaterThan(2 * BODY_RADIUS);
  });

  it("block a player as a villager does", () => {
    const physics = world([]);
    physics.colliders.set("bodies", standingBodies([{ x: 1, y: 0, z: 0, radius: BODY_RADIUS, height: 0.75, round: true }]));
    physics.settle();
    expect(nearest(physics)).toBeGreaterThan(2 * BODY_RADIUS);
  });
});
