import type RAPIER from "@dimforge/rapier3d-compat";
import type { Rapier } from "./rapier";

/** How many colliders a world holds, in all and of each shape. */
export interface ColliderCount {
  colliders: number;
  shapes: Record<string, number>;
}

/**
 * A world's colliders, kept in named groups (a chunk of a map, the people
 * standing in it) and changed a whole group at a time, only when the world is
 * settled.
 *
 * Adding or removing a collider doesn't touch the tree Rapier's queries walk:
 * only a step rebuilds it, and a ray, shape cast or character move between the
 * change and the step can walk into a collider that is gone, which traps the
 * WebAssembly. So a change is only asked for here, as a function that makes the
 * group's colliders, and `settle` applies every change asked for and steps the
 * world straight after, with no query between: every query, whenever it runs,
 * sees a set of colliders the tree agrees with. Asking needs no Rapier, so what
 * loads before Rapier does can ask at once, and is in the world at the first
 * settle.
 */
export class ColliderGroups {
  private readonly held = new Map<string, RAPIER.Collider[]>();
  private readonly asked = new Map<string, (rapier: Rapier) => RAPIER.ColliderDesc[]>();
  /** Each group's colliders by their shape's name. */
  private readonly shapes = new Map<string, Record<string, number>>();

  /** Put a group's colliders in place of what it held, at the next settle: none takes the group away. */
  set(group: string, make: (rapier: Rapier) => RAPIER.ColliderDesc[]): void {
    this.asked.set(group, make);
  }

  /** Whether a change is waiting for the next settle. */
  get pending(): boolean {
    return this.asked.size > 0;
  }

  /**
   * Apply every change asked for, then step the world, which puts them, and any
   * collider moved since the last step, where queries find them. Says whether
   * any group changed.
   */
  settle(rapier: Rapier, world: RAPIER.World): boolean {
    const changed = this.asked.size > 0;
    for (const [group, make] of this.asked) {
      for (const collider of this.held.get(group) ?? []) world.removeCollider(collider, false);
      const descs = make(rapier);
      if (descs.length === 0) this.held.delete(group);
      else this.held.set(group, descs.map((desc) => world.createCollider(desc)));
      const shapes: Record<string, number> = {};
      for (const desc of descs) {
        const name = rapier.ShapeType[desc.shape.type];
        shapes[name] = (shapes[name] ?? 0) + 1;
      }
      this.shapes.set(group, shapes);
    }
    this.asked.clear();
    world.step();
    return changed;
  }

  /** A group's colliders, as of the last settle. */
  of(group: string): readonly RAPIER.Collider[] {
    return this.held.get(group) ?? [];
  }

  /** What the groups hold, as of the last settle. */
  count(): ColliderCount {
    let colliders = 0;
    for (const held of this.held.values()) colliders += held.length;
    const shapes: Record<string, number> = {};
    for (const held of this.shapes.values()) for (const [name, n] of Object.entries(held)) shapes[name] = (shapes[name] ?? 0) + n;
    return { colliders, shapes };
  }
}
