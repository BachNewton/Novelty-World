import { frogCells, insideLanes, pieceShape, turnWithKicks, type Placement, type Turn } from "./logic";
import type { Cell, Frog, Lanes } from "./types";

// How the frogs of a team move among each other on the face, pure: standing
// on a partner, support, the hop that carries what stands on the hopper,
// slides that carry riders, turns, and falling. The run (`run.ts`) plays
// these with the vehicles overlapping the team in the way, and the planner
// (`proof/team-plan.ts`) with nothing but the road's edges, so the two agree
// on every move by sharing them. Each takes the team as whatever the caller
// keeps of its frogs, and hands back the same, moved.
//
// The frogs are solid to each other. A frog stands on a partner when one of
// its cells is directly on top of one of the partner's, and it is supported
// when it stands on the road (height 0) or on a partner. Nothing else holds a
// frog up but its own hop's airtime and riding a row, which the run keeps.

// Whether cells keep clear of whatever else is in the way: for the run, the
// vehicles overlapping the team.
export type Clear = (cells: readonly Cell[]) => boolean;

// Whether any cell of `a` is where a cell of `b` would be `rise` rows up: 0
// for the two overlapping. Read off the shared piece shapes, since the
// planner asks it in its innermost loop.
function meets(a: Frog, b: Frog, rise: number): boolean {
  const cols = b.col - a.col;
  const rows = b.height + rise - a.height;
  const under = pieceShape(b.kind, b.rotation);
  return pieceShape(a.kind, a.rotation).some((p) => under.some((q) => q.col + cols === p.col && q.row + rows === p.row));
}

// Whether `upper` stands on `lower`: one of its cells directly on top of one
// of `lower`'s.
export function standsOn(upper: Frog, lower: Frog): boolean {
  return meets(upper, lower, 1);
}

// Whether a frog stands on the road or on a partner.
export function supported(team: readonly Frog[], player: number): boolean {
  const frog = team[player];
  return frog.height === 0 || team.some((other, i) => i !== player && standsOn(frog, other));
}

// The frogs a frog carries: those standing on it, those standing on them, and
// so on.
export function carried(team: readonly Frog[], player: number): number[] {
  const found = [player];
  for (let at = 0; at < found.length; at++) {
    const under = team[found[at]];
    team.forEach((frog, i) => {
      if (!found.includes(i) && standsOn(frog, under)) found.push(i);
    });
  }
  return found.slice(1).sort((a, b) => a - b);
}

// The team with the `moving` frogs moved, all at once: null unless each stays
// on the road, clear of the way and of the frogs that stay put.
function moveAll<F extends Frog>(team: readonly F[], moving: readonly number[], move: (frog: F) => F, lanes: Lanes, clear: Clear): F[] | null {
  const next = team.map((frog, i) => (moving.includes(i) ? move(frog) : frog));
  for (const i of moving) {
    const frog = next[i];
    if (!insideLanes(frog.kind, frog, lanes) || !clear(frogCells(frog))) return null;
    if (team.some((other, j) => !moving.includes(j) && meets(frog, other, 0))) return null;
  }
  return next;
}

// A slide a lane over. The frogs standing on the slider ride along, if every
// one of them has room in its new place; if not, the slide still happens
// without them, and they stay where they are. Null if the slider itself has
// no room.
export function slide<F extends Frog>(team: readonly F[], player: number, by: number, lanes: Lanes, clear: Clear): F[] | null {
  const moved = (frog: F): F => ({ ...frog, col: frog.col + by });
  const riders = carried(team, player);
  const along = riders.length === 0 ? null : moveAll(team, [player, ...riders], moved, lanes, clear);
  return along ?? moveAll(team, [player], moved, lanes, clear);
}

// A turn about the piece's middle, to the first of its kicks with room. It
// carries nothing: what stands on the frog stays where it is.
export function turn<F extends Frog>(team: readonly F[], player: number, way: Turn, lanes: Lanes, clear: Clear): F[] | null {
  const frog = team[player];
  const room = (placement: Placement): boolean => moveAll(team, [player], (f) => ({ ...f, ...placement }), lanes, clear) !== null;
  const placement = turnWithKicks(frog.kind, frog, way, room);
  return placement === null ? null : team.map((f, i) => (i === player ? { ...f, ...placement } : f));
}

// A hop: the frog rises one cell, and everything it carries rises with it.
// Null if any of them would rise into the way or into a frog that stays put.
// Whether the frog may hop at all (supported, and not in its own airtime) is
// the caller's to say.
export function lift<F extends Frog>(team: readonly F[], player: number, lanes: Lanes, clear: Clear): F[] | null {
  return moveAll(team, [player, ...carried(team, player)], (frog) => ({ ...frog, height: frog.height + 1 }), lanes, clear);
}

// Where a frog comes to rest if it falls from where it is: the highest place
// below it where it stands on the road or on a partner.
export function restingHeight(team: readonly Frog[], player: number): number {
  const frog = team[player];
  let height = frog.height;
  while (!supported(team.map((f, i) => (i === player ? { ...frog, height } : f)), player)) height--;
  return height;
}

// Every frog that may fall and isn't supported falls to its resting height,
// the lowest first, so a frog standing on a partner comes down with it when
// the partner lands; again until none falls. The same team back if none
// falls.
export function settleTeam<F extends Frog>(team: readonly F[], mayFall: (player: number) => boolean): readonly F[] {
  if (team.every((_, player) => !mayFall(player) || supported(team, player))) return team;
  let next = team;
  for (let fell = true; fell; ) {
    fell = false;
    const order = next.map((_, i) => i).sort((a, b) => next[a].height - next[b].height || a - b);
    for (const player of order) {
      if (!mayFall(player) || supported(next, player)) continue;
      const height = restingHeight(next, player);
      next = next.map((frog, i) => (i === player ? { ...frog, height } : frog));
      fell = true;
    }
  }
  return next;
}
