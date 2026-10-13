"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import type { HouseScene, Pin } from "../../art/house-scene";
import { FLOOR_NAMES, FLOORS } from "../../engine/board";
import type { GameView } from "../../engine/view";
import { ENGINE } from "../../game";
import type { InputKind } from "../../input/controls";
import type { ShownThing } from "../../play/things";
import type { FloorId } from "../../types";
import { PromptButton } from "../prompts";
import { MOOD_BG } from "./moods";

/*
 * Details: what is useful to know at a glance, over the house while the
 * player holds them up (`details-hold.ts`), and gone the moment they let go.
 * Each room is named by its back wall, with where its stairs lead; each
 * thing in a room is named where it lies, a room's objects in one list over
 * their spot; and each explorer's mark adds the explorer's name and its
 * stats (`figure-marks.tsx`). Everything here comes from the seat's own view.
 */

/** How high over the floor a thing's label stands, in metres: over its plate. */
const THING_HEIGHT = 0.3;

interface Detail {
  id: string;
  at: Pin["at"];
  height: number;
  lift: number;
  apart: boolean;
}

/** A room's stairs, where they lead to another floor than its own. */
function stairsTo(view: GameView, tile: string, floor: FloorId): FloorId | null {
  const to = ENGINE.catalog.rooms[tile].links.flatMap((link) => view.board.tiles.find((placed) => placed.tile === link)?.floor ?? []);
  return to.find((other) => other !== floor) ?? null;
}

const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The room names and the things' labels, pinned over the house. */
export function HouseDetails({ scene, view, things }: { scene: HouseScene; view: GameView; things: readonly ShownThing[] }) {
  const ref = useRef<HTMLDivElement>(null);
  // A room's objects share one spot, so they share one label: its first object holds the pin.
  const lying = new Map<string, ShownThing[]>();
  for (const thing of things) if (thing.place.kind === "floor") lying.set(thing.room, [...(lying.get(thing.room) ?? []), thing]);
  const standing = things.filter((thing) => thing.place.kind !== "floor");
  const details: (Detail & { node: ReactNode })[] = [
    ...view.board.tiles.map(({ tile, floor }) => {
      const stairs = stairsTo(view, tile, floor);
      const Arrow = stairs !== null && FLOORS.indexOf(stairs) > FLOORS.indexOf(floor) ? ArrowUp : ArrowDown;
      return {
        id: `room:${tile}`,
        at: { room: tile, far: true },
        height: 0,
        lift: 1,
        // Rooms never move aside: each has its own place, and the marks and labels over it are what matters.
        apart: false,
        node: (
          <span data-detail-room={tile} className="flex max-w-32 flex-col items-center rounded bg-(--bt-panel)/80 px-1.5 text-center text-[11px] leading-3.5 text-(--bt-muted)">
            <span className="font-semibold tracking-wide uppercase">{ENGINE.catalog.rooms[tile].name}</span>
            {stairs !== null && (
              <span className="inline-flex items-center gap-0.5">
                <Arrow aria-hidden className="size-3" />
                <span>{capitalised(FLOOR_NAMES[stairs])}</span>
              </span>
            )}
          </span>
        ),
      };
    }),
    ...[...lying.values()].map((group) => ({
      id: `things:${group[0].room}`,
      at: { thing: group[0].id },
      height: THING_HEIGHT,
      lift: 1,
      apart: true,
      node: <ThingNames things={group} />,
    })),
    ...standing.map((thing) => ({
      id: `thing:${thing.id}`,
      at: { thing: thing.id },
      height: THING_HEIGHT,
      lift: 1,
      apart: true,
      node: <ThingNames things={[thing]} />,
    })),
  ];
  // Each element carries its pin, so the pins are set again only when what they say changes.
  const pinOf = ({ at, height, lift, apart }: Detail) => JSON.stringify({ at, height, lift, apart });
  const key = details.map(pinOf).join("|");

  useEffect(() => {
    const root = ref.current;
    if (!root) throw new Error("The details have no element");
    const pins = [...root.children].map((element): Pin => {
      if (!(element instanceof HTMLElement) || element.dataset.pin === undefined) throw new Error("A detail has no pin");
      return { element, ...(JSON.parse(element.dataset.pin) as Omit<Pin, "element" | "clamp">), clamp: false };
    });
    scene.setPins("details", pins);
    return () => {
      scene.setPins("details", []);
    };
  }, [scene, key]);

  return (
    <div ref={ref} aria-label="Details" className="contents">
      {details.map((detail) => (
        <div key={detail.id} data-pin={pinOf(detail)} className="pointer-events-none invisible absolute top-0 left-0">
          {detail.node}
        </div>
      ))}
    </div>
  );
}

function ThingNames({ things }: { things: readonly ShownThing[] }) {
  return (
    <ul className="flex flex-col gap-px rounded border border-(--bt-line) bg-(--bt-panel)/90 px-1.5 py-0.5 text-[11px] leading-3.5">
      {things.map((thing) => (
        <li key={thing.id} data-detail-thing={thing.id} className="flex items-center gap-1 whitespace-nowrap">
          <span aria-hidden className={`inline-block size-2 shrink-0 rounded-full ${MOOD_BG[thing.mood]}`} />
          {thing.name}
        </li>
      ))}
    </ul>
  );
}

/** The on-screen button that shows the details while it is held, as Z or a controller's R3 does. */
export function DetailsButton({ held, hold, input, className }: { held: boolean; hold: (on: boolean) => void; input: InputKind; className: string }) {
  return (
    <PromptButton
      meaning="details"
      input={input}
      aria-label="Show the details"
      aria-pressed={held}
      title="Rooms, things and every explorer's stats"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        hold(true);
      }}
      onPointerUp={() => {
        hold(false);
      }}
      onPointerCancel={() => {
        hold(false);
      }}
      // A long press would otherwise open the page's menu over the house.
      onContextMenu={(event) => {
        event.preventDefault();
      }}
      className={`touch-none select-none ${className}`}
    >
      Details
    </PromptButton>
  );
}
