/*
 * Who touches whom in the simulation's Rapier world, as Rapier's collision
 * groups: a collider's memberships in the top 16 bits, the groups it touches
 * in the bottom 16, and two colliders touch only when each is a member of a
 * group the other touches.
 *
 * The ground, the buildings' walls and the world's edge are the world. A
 * simulated car, the player's or one the game drives, touches everything.
 * Another player's car (`remote-cars.ts`) touches the simulated cars and nothing else: its own client keeps it on the
 * ground, so here it has no ground to fall through, and two other cars meeting
 * is for their own clients to work out.
 */

const WORLD = 0x0001;
const CAR = 0x0002;
const REMOTE = 0x0004;
const EVERYONE = 0xffff;

const groups = (memberships: number, touches: number) => (memberships << 16) | touches;

export const WORLD_GROUPS = groups(WORLD, EVERYONE);
export const CAR_GROUPS = groups(CAR, EVERYONE);
export const REMOTE_GROUPS = groups(REMOTE, CAR);
/** A remote car that has just appeared where another car already is: it touches nothing until they're apart. */
export const GHOST_GROUPS = groups(REMOTE, 0);
/** What a wheel's ray finds: the world, never a car it happens to be over. */
export const WHEEL_RAY_GROUPS = groups(CAR, WORLD);
